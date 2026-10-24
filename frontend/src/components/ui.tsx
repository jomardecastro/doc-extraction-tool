/* eslint-disable react-refresh/only-export-components -- shared primitives and icons live together on purpose */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";

/**
 * The few primitives every screen shares. One primary button style (accent), secondary
 * (outlined) and ghost (text); never a destructive primary. Badges are neutral: status is
 * carried by words and icons, not by a rainbow of pills.
 */

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-accent hover:bg-accent-soft border border-transparent",
};

const BASE =
  "btn inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-base font-semibold transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`${BASE} ${VARIANT[variant]} ${className}`} />;
}

export function LinkButton({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${BASE} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/** The way back from a detail page: a quiet text link above the title, never a primary button. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="row-action mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-accent"
    >
      <Icon.ArrowLeft />
      {children}
    </Link>
  );
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-sm text-ink-2 ${className}`}
    >
      {children}
    </span>
  );
}

export function Section({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-10 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent ${className}`}
    />
  );
}

/** Icon-only glyphs used inline with text; each is decorative next to a label. */
export const Icon = {
  ArrowLeft: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-2"
    >
      <path d="M13 8H3m0 0l4-4M3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Download: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-2"
    >
      <path
        d="M8 2.5v8m0 0l-3-3m3 3l3-3M3 11.5v1a1 1 0 001 1h8a1 1 0 001-1v-1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Check: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-2"
    >
      <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Alert: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-2"
    >
      <path
        d="M8 2.5l6 11H2l6-11z M8 6.5v3 M8 11.8v.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Upload: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-8 fill-none stroke-current stroke-[1.5]"
    >
      <path
        d="M12 16V5m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Doc: () => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 fill-none stroke-current stroke-[1.5]"
    >
      <path
        d="M4 1.5h5l3 3v10H4z M9 1.5v3h3 M6 8h4 M6 11h4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Chevron: ({ open }: { open: boolean }) => (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`size-4 fill-none stroke-current stroke-2 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M6 3.5l4.5 4.5L6 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
