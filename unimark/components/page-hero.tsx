import type { ReactNode } from "react";
import { Eyebrow } from "./ui";

/** Dark introductory band for supporting pages (the header is light-on-dark over it). */
export function PageHero({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="relative isolate overflow-hidden bg-ink text-white">
      <div className="bg-dots absolute inset-0 -z-10" aria-hidden="true" />
      <div className="absolute -right-40 -top-40 -z-10 h-[30rem] w-[30rem] rounded-full bg-teal/15 blur-[120px]" aria-hidden="true" />
      <div className="container-site pb-20 pt-36 sm:pb-28 sm:pt-44">
        <div className="animate-rise">
          <Eyebrow tone="dark">{eyebrow}</Eyebrow>
        </div>
        <h1 id="page-title" className="text-h1 mt-6 max-w-4xl animate-lift [animation-delay:80ms]">
          {title}
        </h1>
        {lead ? <p className="text-lead mt-6 max-w-2xl text-white/75 animate-lift [animation-delay:160ms]">{lead}</p> : null}
        {children ? <div className="mt-9 animate-rise [animation-delay:240ms]">{children}</div> : null}
      </div>
    </section>
  );
}
