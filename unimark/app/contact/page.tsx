import type { Metadata } from "next";
import { ContactEmail } from "@/components/contact-email";
import { ArrowRight, Icon, type IconName } from "@/components/icons";
import { PageHero } from "@/components/page-hero";
import { TrackedLink } from "@/components/tracked-link";
import { contact } from "@/content/pages";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({ ...contact.meta, path: "/contact/" });

function Card({ icon, title, body, children }: { icon: IconName; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col rounded-[1.5rem] bg-white p-7 ring-1 ring-line sm:p-8" data-reveal>
      <span className="grid size-12 place-items-center rounded-2xl bg-teal-soft text-teal-ink">
        <Icon name={icon} />
      </span>
      <h2 className="mt-7 text-[1.3rem] font-bold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 text-muted">{body}</p>
      <div className="mt-6">{children}</div>
    </li>
  );
}

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow={contact.eyebrow} title={contact.title} lead={contact.lead} />
      <section className="bg-paper py-20 sm:py-28">
        <ul className="container-site grid gap-5 md:grid-cols-3">
          <Card icon="mail" title="General questions" body="Press, feedback, or anything else about UniMark.">
            <ContactEmail email={site.contact.generalEmail} channel="general" placeholder="general contact email" />
          </Card>
          <Card icon="help" title="App help" body="Questions about using the UniMark app.">
            <ContactEmail email={site.contact.supportEmail} channel="support" placeholder="app support email" />
          </Card>
          <Card icon="handshake" title="Partnerships" body="Businesses that want to bring value to students.">
            <TrackedLink href="/partners/" ctaId="contact-partners" placement="contact" className="inline-flex items-center gap-2 font-bold text-teal-ink hover:underline">
              Partner with us <ArrowRight />
            </TrackedLink>
          </Card>
        </ul>
      </section>
    </>
  );
}
