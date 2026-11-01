import { partnerTeaser } from "@/content/home";
import { ArrowRight, Icon } from "../icons";
import { TrackedLink } from "../tracked-link";

export function PartnerTeaser() {
  return (
    <section aria-labelledby="partner-teaser-title" className="bg-paper pb-24 sm:pb-32">
      <div className="container-site">
        <div
          data-reveal
          className="flex flex-col gap-8 rounded-card bg-white p-8 ring-1 ring-line sm:p-10 md:flex-row md:items-center md:justify-between lg:px-14"
        >
          <div className="flex items-start gap-5">
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-teal-soft text-teal-ink sm:grid">
              <Icon name="handshake" />
            </span>
            <div>
              <p className="text-[0.8rem] font-bold uppercase tracking-[0.12em] text-teal-ink">{partnerTeaser.eyebrow}</p>
              <h2 id="partner-teaser-title" className="mt-2 text-[clamp(1.4rem,1.2rem+0.8vw,1.8rem)] font-extrabold tracking-[-0.025em]">
                {partnerTeaser.title}
              </h2>
              <p className="mt-2 max-w-xl text-muted">{partnerTeaser.body}</p>
            </div>
          </div>
          <TrackedLink href="/partners/" ctaId="partner-teaser" placement="home" className="btn btn-ghost-dark shrink-0 self-start md:self-center">
            {partnerTeaser.cta}
            <ArrowRight />
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
