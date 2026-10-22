import { RecentList } from "../components/upload/RecentList.js";
import { SampleList } from "../components/upload/SampleList.js";
import { UploadDropzone } from "../components/upload/UploadDropzone.js";
import { Section } from "../components/ui.js";

export function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Extract the substance of a watershed plan</h1>
      <p className="mt-2 max-w-[66ch] text-ink-2">
        Upload a Mississippi watershed plan and get its goals, management practices, implementation tasks, monitoring metrics, outreach activities and geographic areas as structured data. Every item carries a verbatim quote and page number, checked against the PDF.
      </p>
      <div className="mt-6">
        <UploadDropzone />
      </div>
      <Section title="Or try a sample plan">
        <SampleList />
      </Section>
      <Section title="Recently processed in this browser" className="[&:has(ul)]:block">
        <RecentList />
      </Section>
    </div>
  );
}
