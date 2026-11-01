import type { ReactNode } from "react";
import { WheelDots } from "./brand/logo";

/** Small pill label above a section heading. */
export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" | "teal" }) {
  const styles = {
    light: "bg-white text-ink ring-1 ring-line",
    dark: "bg-white/[0.06] text-white ring-1 ring-line-dark",
    teal: "bg-ink/10 text-ink ring-1 ring-ink/15",
  }[tone];
  const dots = tone === "teal" ? "text-ink" : "text-teal";
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.14em] ${styles}`}
    >
      <WheelDots className={`h-[0.55rem] w-auto ${dots}`} />
      {children}
    </p>
  );
}

type SectionIntroProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "light" | "dark";
  align?: "center" | "left";
  id?: string;
};

export function SectionIntro({ eyebrow, title, lead, tone = "light", align = "center", id }: SectionIntroProps) {
  const center = align === "center";
  return (
    <div className={`flex flex-col gap-5 ${center ? "mx-auto max-w-3xl items-center text-center" : "max-w-2xl items-start"}`}>
      <div data-reveal>
        <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      </div>
      <h2 id={id} data-reveal style={{ "--reveal-delay": "60ms" } as React.CSSProperties} className="text-h2">
        {title}
      </h2>
      {lead ? (
        <p
          data-reveal
          style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
          className={`text-lead max-w-2xl ${tone === "dark" ? "text-muted-dark" : "text-muted"}`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Marks content that has not been supplied yet. Always visible (including in
 * production builds) so a placeholder is never mistaken for final content;
 * `npm run check:launch` lists every one that remains.
 */
export function Placeholder({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-500/70 bg-amber-50 px-2 py-0.5 text-[0.8rem] font-semibold text-amber-900">
      <span aria-hidden="true">◌</span> Placeholder: {label}
    </span>
  );
}

export function CheckItem({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={`mt-[0.2rem] grid size-5 shrink-0 place-items-center rounded-full ${
          tone === "dark" ? "bg-teal text-ink" : "bg-teal-soft text-teal-ink"
        }`}
      >
        <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
