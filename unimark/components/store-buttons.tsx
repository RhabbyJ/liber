"use client";

import { site, type StoreId } from "@/content/site";
import { track } from "@/lib/track";

type Variant = "dark" | "light" | "ghost-light";

type StoreButtonsProps = {
  /** Where the buttons appear, reported with each download click. */
  placement: string;
  variant?: Variant;
  size?: "md" | "sm";
  className?: string;
  stores?: StoreId[];
};

const VARIANT_CLASS: Record<Variant, string> = {
  dark: "btn-dark",
  light: "btn-light",
  "ghost-light": "btn-ghost-light",
};

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16.5h12" />
    </svg>
  );
}

/**
 * App download links. Uses the official store badges once their files are
 * configured in `site.badges`; until then shows neutral text buttons (Apple and
 * Google do not allow recreated or modified badges).
 */
export function StoreButtons({ placement, variant = "dark", size = "md", className = "", stores = ["ios", "android"] }: StoreButtonsProps) {
  return (
    <ul className={`flex flex-wrap gap-3 ${className}`} aria-label="Download UniMark">
      {stores.map((id) => {
        const store = site.stores[id];
        const badge = site.badges[id];
        const onClick = () => track({ name: "download_click", props: { store: id, placement } });
        return (
          <li key={id}>
            {badge ? (
              <a href={store.url} onClick={onClick} className="inline-block rounded-[10px] transition-transform duration-200 hover:-translate-y-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- official badge artwork */}
                <img src={badge} alt={store.cta} className={size === "sm" ? "h-10 w-auto" : "h-[3.25rem] w-auto"} />
              </a>
            ) : (
              <a href={store.url} onClick={onClick} className={`btn ${size === "sm" ? "btn-sm" : ""} ${VARIANT_CLASS[variant]}`}>
                <DownloadIcon />
                <span>
                  Download for <span className="font-extrabold">{store.device}</span>
                  <span className="sr-only"> from {store.label}</span>
                </span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
