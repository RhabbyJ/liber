import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { PageHero } from "@/components/page-hero";
import { PartnerForm } from "@/components/partner-form";
import { Eyebrow, SectionIntro } from "@/components/ui";
import { partners } from "@/content/pages";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({ ...partners.meta, path: "/partners/" });

export default function PartnersPage() {
  return (
    <>
      <PageHero eyebrow={partners.eyebrow} title={partners.title} lead={partners.lead}>
        <a href="#inquiry" className="btn btn-primary">
          {partners.cta}
        </a>
      </PageHero>

      <section aria-labelledby="ways-title" className="bg-paper py-24 sm:py-32">
        <div className="container-site">
          <SectionIntro id="ways-title" eyebrow={partners.ways.eyebrow} title={partners.ways.title} lead={partners.ways.lead} />
          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {partners.ways.items.map((item, i) => (
              <li
                key={item.title}
                data-reveal
                style={{ "--reveal-delay": `${i * 70}ms` } as React.CSSProperties}
                className="flex flex-col rounded-[1.5rem] bg-white p-7 ring-1 ring-line"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-teal-soft text-teal-ink">
                  <Icon name={item.icon} />
                </span>
                <h3 className="mt-7 text-[1.2rem] font-bold leading-snug tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-3 text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="approach-title" className="bg-ink py-24 text-white sm:py-32">
        <div className="container-site">
          <SectionIntro id="approach-title" tone="dark" eyebrow={partners.approach.eyebrow} title={partners.approach.title} />
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {partners.approach.steps.map((step, i) => (
              <li
                key={step.title}
                data-reveal
                style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}
                className="rounded-[1.5rem] bg-ink-2 p-7 ring-1 ring-line-dark sm:p-8"
              >
                <span className="text-[2.75rem] font-extrabold leading-none tracking-[-0.05em] text-teal" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-6 text-[1.25rem] font-bold tracking-[-0.02em]">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-3 text-muted-dark">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="inquiry" aria-labelledby="inquiry-title" className="bg-paper py-24 sm:py-32">
        <div className="container-site grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <div>
            <div data-reveal>
              <Eyebrow>{partners.form.eyebrow}</Eyebrow>
            </div>
            <h2 id="inquiry-title" className="text-h2 mt-5" data-reveal>
              {partners.form.title}
            </h2>
            <p className="text-lead mt-5 text-muted" data-reveal>
              {partners.form.lead}
            </p>
          </div>
          <div className="rounded-card bg-white p-6 shadow-card ring-1 ring-line sm:p-10">
            <PartnerForm />
          </div>
        </div>
      </section>
    </>
  );
}
