import Link from "next/link";
import { site } from "@/content/site";
import { Logo } from "./brand/logo";
import { StoreButtons } from "./store-buttons";

type FooterLink = { label: string; href: string };

export function SiteFooter() {
  const legal: FooterLink[] = [
    site.legal.privacy && { label: "Privacy Policy", href: site.legal.privacy },
    site.legal.terms && { label: "Terms of Service", href: site.legal.terms },
    site.legal.communityGuidelines && { label: "Community Guidelines", href: site.legal.communityGuidelines },
  ].filter((l): l is FooterLink => Boolean(l));

  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Explore",
      links: [
        { label: "How it works", href: "/#how-it-works" },
        { label: "For students", href: "/#for-students" },
        { label: "Get the app", href: "/get/" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about/" },
        { label: "Partner with us", href: "/partners/" },
        { label: "Contact", href: "/contact/" },
      ],
    },
    ...(legal.length ? [{ title: "Legal", links: legal }] : []),
  ];

  return (
    <footer className="border-t border-line-dark bg-ink text-white">
      <div className="container-site pb-10 pt-16 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
          <div className="max-w-sm">
            <Link href="/" aria-label="UniMark home" className="inline-block rounded-lg">
              <Logo tone="light" className="h-8 w-auto" />
            </Link>
            <p className="mt-5 text-[0.95rem] leading-relaxed text-muted-dark">
              The student-to-student services marketplace. Find help from students around you, or earn from what you do best.
            </p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-white/50">{col.title}</h2>
              <ul className="mt-5 flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[0.95rem] font-medium text-white/85 transition-colors hover:text-teal">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-white/50">Get the app</h2>
            <StoreButtons placement="footer" variant="ghost-light" size="sm" className="mt-5 flex-col items-start" />
            {site.socials.length ? (
              <ul className="mt-8 flex gap-3" aria-label="UniMark on social media">
                {site.socials.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} className="text-sm font-semibold text-white/85 hover:text-teal" rel="me noopener" target="_blank">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-line-dark pt-8 text-[0.85rem] text-muted-dark md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </p>
          <p className="max-w-xl md:text-right">{site.independenceNote}</p>
        </div>
      </div>
    </footer>
  );
}
