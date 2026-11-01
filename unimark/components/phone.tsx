import type { ReactNode } from "react";
import { SCREEN_SIZE, SCREEN_WIDTHS, screens, type ScreenId } from "@/content/screens";

function screenSrcSet(screen: ScreenId) {
  return SCREEN_WIDTHS.map((w) => `/screens/${screen}-${w}.webp ${w}w`).join(", ");
}

/**
 * Device frame drawn in CSS so it stays sharp at any size. Proportions use
 * container units, so everything scales with the phone's width.
 */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`@container ${className}`}>
      <div className="relative rounded-[17.5cqw] bg-[linear-gradient(160deg,#3a3b4c,#14141c_45%,#232434)] p-[3.3cqw] shadow-phone ring-1 ring-white/15">
        <div className="pointer-events-none absolute inset-[1.1cqw] rounded-[16.5cqw] ring-1 ring-black/60" aria-hidden="true" />
        <div className="relative overflow-hidden rounded-[14.2cqw] bg-white">{children}</div>
      </div>
    </div>
  );
}

type ScreenImageProps = {
  screen: ScreenId;
  /** `sizes` attribute describing the rendered width, e.g. "(min-width: 1024px) 300px, 60vw". */
  sizes: string;
  priority?: boolean;
  /** Use an empty alt when the same screen is described in adjacent text. */
  decorative?: boolean;
  className?: string;
};

/** A real UniMark app screenshot (rounded corners are baked into the image). */
export function ScreenImage({ screen, sizes, priority = false, decorative = false, className = "" }: ScreenImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export: pre-sized responsive sources
    <img
      src={`/screens/${screen}-${SCREEN_WIDTHS[0]}.webp`}
      srcSet={screenSrcSet(screen)}
      sizes={sizes}
      width={SCREEN_SIZE.width}
      height={SCREEN_SIZE.height}
      alt={decorative ? "" : screens[screen].alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      draggable={false}
      className={`block h-auto w-full select-none ${className}`}
    />
  );
}

type PhoneProps = Omit<ScreenImageProps, "className"> & { className?: string };

export function Phone({ className, ...image }: PhoneProps) {
  return (
    <PhoneFrame className={className}>
      <ScreenImage {...image} />
    </PhoneFrame>
  );
}
