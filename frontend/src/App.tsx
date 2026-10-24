import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createBrowserRouter, RouterProvider } from "react-router";
import { getHealth } from "./api/client.js";
import { Icon } from "./components/ui.js";
import { DocumentPage } from "./routes/DocumentPage.js";
import { UploadPage } from "./routes/UploadPage.js";

function Shell() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-accent" />
            DocExtract
          </Link>
          <div className="flex items-center gap-4">
            <p className="hidden text-sm text-ink-3 sm:block">Watershed plan extraction</p>
            {health.data?.sourceZipUrl && (
              <a
                href={health.data.sourceZipUrl}
                download
                className="btn inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
              >
                <Icon.Download />
                Source code (zip)
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-ink-3">
          <span>
            Text-based PDFs only. Items that cannot be quoted verbatim from the document are
            discarded.
          </span>
          {health.data && (
            <span className="num">
              {health.data.provider === "mock" ? "mock provider" : health.data.model} · v
              {health.data.version}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <UploadPage /> },
      { path: "documents/:id", element: <DocumentPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold">There is nothing at this address</h1>
      <p className="mt-2 text-ink-2">
        <Link to="/" className="font-semibold text-accent">
          Go to the upload page
        </Link>
      </p>
    </div>
  );
}

export default function App() {
  return <RouterProvider router={router} />;
}
