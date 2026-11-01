import type { Metadata } from "next";
import { AppRedirect } from "@/components/app-redirect";
import { Phone } from "@/components/phone";
import { QrCodes } from "@/components/qr-codes";
import { StoreButtons } from "@/components/store-buttons";
import { Eyebrow } from "@/components/ui";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/metadata";

// A smart link for bios, posters and QR codes: phones go straight to their store.
export const metadata: Metadata = pageMetadata({
  title: "Get the app",
  description: "Download UniMark for iPhone or Android.",
  path: "/get/",
  noIndex: true,
});

export default function GetAppPage() {
  return (
    <section aria-labelledby="page-title" className="relative isolate overflow-hidden bg-ink text-white">
      <div className="bg-dots absolute inset-0 -z-10" aria-hidden="true" />
      <div className="absolute bottom-[-12rem] left-1/2 -z-10 h-[32rem] w-[50rem] -translate-x-1/2 rounded-full bg-teal/20 blur-[120px]" aria-hidden="true" />
      <div className="container-site grid items-center gap-14 pb-0 pt-32 sm:pt-40 lg:grid-cols-[1.2fr_1fr] lg:pb-0">
        <div className="text-center lg:pb-28 lg:text-left">
          <div className="animate-rise">
            <Eyebrow tone="dark">Get the app</Eyebrow>
          </div>
          <h1 id="page-title" className="text-h1 mt-6 animate-lift [animation-delay:80ms]">
            Get {site.name}.
          </h1>
          <p className="text-lead mx-auto mt-6 max-w-lg text-white/75 animate-lift [animation-delay:160ms] lg:mx-0">
            Find services from students around you, or start offering your own.
          </p>
          <AppRedirect />
          <div className="mt-9 animate-rise [animation-delay:240ms]">
            <StoreButtons placement="get-page" variant="light" className="justify-center max-sm:flex-col max-sm:[&_a]:w-full lg:justify-start" />
          </div>
          <div className="mt-10 hidden items-center gap-6 lg:flex">
            <QrCodes />
            <p className="max-w-[10rem] text-[0.9rem] font-semibold leading-snug text-white/75">On a computer? Scan with your phone’s camera.</p>
          </div>
        </div>
        <div className="relative mx-auto h-[20rem] w-[min(64vw,19rem)] sm:h-[26rem] lg:h-[34rem]" aria-hidden="true">
          <div className="absolute inset-x-0 top-0">
            <Phone screen="discover" decorative sizes="(min-width: 1024px) 304px, 64vw" />
          </div>
        </div>
      </div>
    </section>
  );
}
