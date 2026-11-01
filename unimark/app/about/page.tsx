import type { Metadata } from "next";
import { DownloadCta } from "@/components/download-cta";
import { Icon } from "@/components/icons";
import { PageHero } from "@/components/page-hero";
import { Phone } from "@/components/phone";
import { Eyebrow, SectionIntro } from "@/components/ui";
import { WheelDots } from "@/components/brand/logo";
import { about } from "@/content/pages";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({ ...about.meta, path: "/about/" });

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow={about.eyebrow} title={about.title} lead={about.lead} />

      <section aria-labelledby="mission-title" className="bg-paper py-24 sm:py-32">
        <div className="container-site grid items-center gap-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div data-reveal>
              <Eyebrow>{about.mission.eyebrow}</Eyebrow>
            </div>
            <h2 id="mission-title" className="text-h2 mt-5" data-reveal>
              {about.mission.title}
            </h2>
            <div className="mt-8 flex max-w-2xl flex-col gap-5 text-[1.08rem] text-muted" data-reveal>
              {about.mission.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
          <div className="relative mx-auto w-[min(62vw,18rem)]" data-reveal>
            <div className="absolute inset-x-0 top-[15%] -z-0 h-[70%] rounded-full bg-teal/20 blur-[80px]" aria-hidden="true" />
            <Phone screen="profile" sizes="(min-width: 1024px) 288px, 62vw" className="relative rotate-[3deg]" />
          </div>
        </div>
      </section>

      <section aria-label={about.vision.eyebrow} className="bg-ink py-24 text-white sm:py-32">
        <figure className="container-site max-w-5xl text-center" data-reveal>
          <div className="flex justify-center">
            <Eyebrow tone="dark">{about.vision.eyebrow}</Eyebrow>
          </div>
          <blockquote className="mt-8 text-[clamp(1.9rem,1.2rem+3vw,3.75rem)] font-extrabold leading-[1.08] tracking-[-0.035em] text-balance">
            “{about.vision.quote}”
          </blockquote>
          <WheelDots className="mx-auto mt-10 h-4 w-auto text-teal" />
        </figure>
      </section>

      <section aria-labelledby="principles-title" className="bg-white py-24 sm:py-32">
        <div className="container-site">
          <SectionIntro id="principles-title" eyebrow={about.principles.eyebrow} title={about.principles.title} />
          <ul className="mt-14 grid gap-5 md:grid-cols-3">
            {about.principles.items.map((item, i) => (
              <li
                key={item.title}
                data-reveal
                style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}
                className="rounded-[1.5rem] bg-paper p-7 ring-1 ring-line sm:p-8"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-teal-soft text-teal-ink">
                  <Icon name={item.icon} />
                </span>
                <h3 className="mt-7 text-[1.3rem] font-bold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-3 text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <DownloadCta placement="about" />
    </>
  );
}
