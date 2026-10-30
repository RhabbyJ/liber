import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "adu"
  | "arrow-left"
  | "arrow-right"
  | "bath"
  | "bed"
  | "bell"
  | "bookmark"
  | "calendar"
  | "car"
  | "check"
  | "check-shield"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "close"
  | "compass"
  | "condo"
  | "diamond"
  | "doc"
  | "expand"
  | "eye"
  | "grid"
  | "home"
  | "info"
  | "key"
  | "land"
  | "list"
  | "lock"
  | "logout"
  | "manufactured"
  | "mail"
  | "map"
  | "map-pin"
  | "menu"
  | "message"
  | "minus"
  | "money"
  | "people"
  | "pencil"
  | "pool"
  | "plus"
  | "ruler"
  | "search"
  | "settings"
  | "shield"
  | "sliders"
  | "sparkle"
  | "star"
  | "tag"
  | "townhouse"
  | "tree"
  | "upload"
  | "user"
  | "wrench";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, ReactElement> = {
  "arrow-left": <path d="M20 12H5M12 5l-7 7 7 7" />,
  "arrow-right": <path d="M4 12h15M12 5l7 7-7 7" />,
  bath: (
    <>
      <path d="M3.5 12h17v2.5a4.5 4.5 0 0 1-4.5 4.5H8a4.5 4.5 0 0 1-4.5-4.5V12z" />
      <path d="M6 12V6.5A2.5 2.5 0 0 1 8.5 4h.2A2.3 2.3 0 0 1 11 6.3M7 19l-1 2M17 19l1 2" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18V6M3 14h18v4M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5" />
      <circle cx="7" cy="11" r="2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  bookmark: <path d="M6 4h12v17l-6-3.5L6 21z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  "check-shield": (
    <>
      <path d="M12 3.5 4.5 6v6.5c0 4.4 3 7.7 7.5 9 4.5-1.3 7.5-4.6 7.5-9V6L12 3.5z" />
      <path d="m8.5 12 2.5 2.5L15.5 10" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-1.5 4.5L9 15l1.5-4.5L15 9z" fill="currentColor" stroke="none" />
    </>
  ),
  condo: (
    <>
      <path d="M5 21V3.5h10V21M15 9h4v12M3 21h18" />
      <path d="M8.5 7.5h.5M11 7.5h.5M8.5 11h.5M11 11h.5M8.5 14.5h.5M11 14.5h.5M17 12.5h.01M17 16h.01" />
    </>
  ),
  diamond: <path d="M12 3 4 12l8 9 8-9-8-9z" />,
  doc: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M9 11h6M9 15h6M9 19h4" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </>
  ),
  home: <path d="M4 11 12 4l8 7v9h-5v-6h-6v6H4z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 8v.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21l-2 2-2-2 2-2" />
    </>
  ),
  land: <path d="M2.5 19.5c2.6-3.4 5.6-5.2 9.5-5.2s6.9 1.8 9.5 5.2M2.5 19.5h19M12 14.3V5l5 2.2-5 2.2" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5" />,
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
      <path d="m18 16 4-4-4-4M22 12H10" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  manufactured: <path d="M2.5 17.5h19M3.5 17.5V10h17v7.5M3.5 10l2-3h13l2 3M7 13h3M14 13h3M5.5 20.5v-3M18.5 20.5v-3" />,
  map: <path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2zM9 4.5v13M15 6.5v13" />,
  "map-pin": (
    <>
      <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  message: (
    <>
      <path d="M21 12a8 8 0 1 1-3.6-6.6L21 4l-1.6 4.4A7.9 7.9 0 0 1 21 12z" />
      <path d="M8 11h8M8 14h5" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  money: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.5M18 14.5v-.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M14.5 20c.5-2.6 2.3-4 4.5-4 1.2 0 2.3.4 3 1" />
    </>
  ),
  pencil: <path d="m4 20 1-4L17 4l3 3L8 19l-4 1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  ruler: (
    <>
      <path d="M3.5 15.5 15.5 3.5l5 5-12 12-5-5z" />
      <path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  shield: <path d="M12 3.5 4.5 6v6.5c0 4.4 3 7.7 7.5 9 4.5-1.3 7.5-4.6 7.5-9V6L12 3.5z" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6L3.3 9.5l6-.9L12 3z" />,
  tag: (
    <>
      <path d="M3.5 12 12 3.5h7v7L10.5 19l-7-7z" />
      <circle cx="14.5" cy="9" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  townhouse: <path d="M2 21h20M3.5 21V11L8 6.5l4.5 4.5M12.5 21V11L16 7.5l4.5 4.5V21M3.5 21V11M7 21v-4h2v4M15.5 21v-4h2v4" />,
  upload: (
    <>
      <path d="M12 4v12M7 9l5-5 5 5" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4.4 4.4-6.5 8-6.5s6.8 2.1 8 6.5" />
    </>
  ),
  // Feature icons for what buyers want on a home.
  adu: (
    <>
      <path d="M3.5 11.5 9 7l5.5 4.5V19h-11z" />
      <path d="M7.5 19v-3.5h3V19M18 8v6M15 11h6" />
    </>
  ),
  car: (
    <>
      <path d="M4.5 16.5v-4l1.8-4.6A1.5 1.5 0 0 1 7.7 7h8.6a1.5 1.5 0 0 1 1.4.9l1.8 4.6v4z" />
      <path d="M4.5 12.5h15M7 16.5V19M17 16.5V19M7.5 14.5h1M15.5 14.5h1" />
    </>
  ),
  pool: (
    <>
      <path d="M8 14V6a2 2 0 0 1 3.4-1.4M14 14V6a2 2 0 0 1 3.4-1.4M8 8.5h6M8 11.5h6" />
      <path d="M3 18c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
    </>
  ),
  tree: (
    <>
      <path d="M12 21v-5M9.5 18.5 12 16l2.5 2.5" />
      <path d="M12 3a5 5 0 0 0-4.7 6.7A3.8 3.8 0 0 0 8.2 17h7.6a3.8 3.8 0 0 0 .9-7.3A5 5 0 0 0 12 3z" />
    </>
  ),
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L4 16.5 7.5 20l5.3-5.3a4 4 0 0 0 4.9-5.4l-2.6 2.6-2.4-.5-.5-2.4z" />,
};

export function Icon({ name, size = 16, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`icon icon-${name}${props.className ? ` ${props.className}` : ""}`}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
