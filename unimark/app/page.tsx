import { DownloadCta } from "@/components/download-cta";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { PartnerTeaser } from "@/components/home/partner-teaser";
import { Showcase } from "@/components/home/showcase";
import { TwoSides } from "@/components/home/two-sides";
import { Why } from "@/components/home/why";
import { site } from "@/content/site";

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    description: site.description,
    ...(site.url ? { url: site.url, logo: `${site.url}/icon-512.png` } : {}),
    ...(site.socials.length ? { sameAs: site.socials.map((s) => s.url) } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero />
      <TwoSides />
      <HowItWorks />
      <Showcase />
      <Why />
      <PartnerTeaser />
      <DownloadCta placement="home" />
    </>
  );
}
