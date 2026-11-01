import { twoSides } from "@/content/home";
import { ArrowRight } from "../icons";
import { Phone } from "../phone";
import { TrackedLink } from "../tracked-link";
import { CheckItem, SectionIntro } from "../ui";

type Side = typeof twoSides.find;

function SideCard({ side, id, dark }: { side: Side; id: string; dark?: boolean }) {
  return (
    <article
      aria-labelledby={`${id}-title`}
      data-reveal
      style={{ "--reveal-delay": dark ? "120ms" : "0ms" } as React.CSSProperties}
      className={`group relative flex flex-col overflow-hidden rounded-card ${
        dark ? "bg-ink text-white ring-1 ring-white/5" : "bg-white text-ink shadow-card ring-1 ring-line"
      }`}
    >
      <div className="flex flex-1 flex-col p-7 sm:p-10">
        <p className={`text-[0.8rem] font-bold uppercase tracking-[0.12em] ${dark ? "text-teal" : "text-teal-ink"}`}>{side.label}</p>
        <h3 id={`${id}-title`} className="mt-3 text-[clamp(1.9rem,1.5rem+1.4vw,2.6rem)] font-extrabold leading-[1.05] tracking-[-0.035em]">
          {side.title}
        </h3>
        <p className={`mt-4 max-w-md text-[1.02rem] ${dark ? "text-muted-dark" : "text-muted"}`}>{side.body}</p>
        <ul className={`mt-7 flex flex-col gap-3.5 text-[0.98rem] font-medium ${dark ? "text-white/90" : "text-ink/90"}`}>
          {side.points.map((p) => (
            <CheckItem key={p} tone={dark ? "dark" : "light"}>
              {p}
            </CheckItem>
          ))}
        </ul>
        <div className="mt-9">
          <TrackedLink href="/get/" ctaId={id} placement="two-sides" className={`btn ${dark ? "btn-primary" : "btn-dark"}`}>
            {side.cta}
            <ArrowRight />
          </TrackedLink>
        </div>
      </div>
      <div className="relative -mb-[46%] mt-2 px-[18%] transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-2 sm:-mb-[40%]" aria-hidden="true">
        <Phone screen={side.screen} decorative sizes="(min-width: 768px) 300px, 64vw" />
      </div>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 ${dark ? "bg-gradient-to-t from-ink" : "bg-gradient-to-t from-white"}`}
        aria-hidden="true"
      />
    </article>
  );
}

export function TwoSides() {
  return (
    <section id="for-students" aria-labelledby="two-sides-title" className="bg-paper py-24 sm:py-32">
      <div className="container-site">
        <SectionIntro id="two-sides-title" eyebrow={twoSides.eyebrow} title={twoSides.title} lead={twoSides.lead} />
        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:mt-16">
          <SideCard side={twoSides.find} id="find-service" />
          <SideCard side={twoSides.offer} id="offer-service" dark />
        </div>
      </div>
    </section>
  );
}
