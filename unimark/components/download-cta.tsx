import { download } from "@/content/home";
import { Phone } from "./phone";
import { QrCodes } from "./qr-codes";
import { StoreButtons } from "./store-buttons";

/** Closing download band, shared by the homepage and supporting pages. */
export function DownloadCta({ placement, title = download.title, body = download.body }: { placement: string; title?: string; body?: string }) {
  return (
    <section id="download" aria-labelledby={`download-title-${placement}`} className="on-teal relative isolate overflow-hidden bg-teal text-ink">
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(27_28_40/0.10)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:linear-gradient(90deg,transparent,#000_70%)]"
        aria-hidden="true"
      />
      <div className="container-site grid items-center gap-12 pt-20 sm:pt-24 lg:grid-cols-[1.25fr_1fr] lg:pt-0">
        <div className="pb-20 sm:pb-24 lg:py-28">
          <h2 id={`download-title-${placement}`} className="text-h2 max-w-xl" data-reveal>
            {title}
          </h2>
          <p className="text-lead mt-5 max-w-lg" data-reveal style={{ "--reveal-delay": "80ms" } as React.CSSProperties}>
            {body}
          </p>
          <div data-reveal style={{ "--reveal-delay": "160ms" } as React.CSSProperties}>
            <StoreButtons placement={`download-${placement}`} variant="dark" className="mt-9 max-sm:flex-col max-sm:[&_a]:w-full" />
          </div>
          <div className="mt-10 hidden items-center gap-6 lg:flex" data-reveal style={{ "--reveal-delay": "240ms" } as React.CSSProperties}>
            <QrCodes />
            <p className="max-w-[10rem] text-[0.9rem] font-semibold leading-snug">On a computer? Scan with your phone’s camera.</p>
          </div>
        </div>
        <div className="relative hidden h-full min-h-[34rem] lg:block" aria-hidden="true">
          <div className="absolute -bottom-[26%] left-1/2 w-[20rem] -translate-x-1/2 rotate-[4deg]">
            <Phone screen="bookings" decorative sizes="304px" />
          </div>
        </div>
      </div>
    </section>
  );
}
