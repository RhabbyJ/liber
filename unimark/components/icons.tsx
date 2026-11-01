import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  community: (
    <>
      <path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0113 0c0 5.6-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  income: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0111 0" />
      <path d="M15.5 5.8a3 3 0 010 5.4M17.5 14.2a5.5 5.5 0 013 4.8" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.8v5.4c0 4.4-3 8-7 9.8-4-1.8-7-5.4-7-9.8V5.8z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  discount: (
    <>
      <path d="M3.5 12.6V5.5a2 2 0 012-2h7.1l8 8a2 2 0 010 2.8l-7.1 7.1a2 2 0 01-2.8 0z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v7.5a1 1 0 001 1h12a1 1 0 001-1V12M12 8v12.5" />
      <path d="M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.5l1.5-5h13l1.5 5" />
      <path d="M4 9.5a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0" />
      <path d="M5.5 11.5v8h13v-8M10 19.5v-4.5h4v4.5" />
    </>
  ),
  campus: (
    <>
      <path d="M3 9l9-5 9 5-9 5z" />
      <path d="M7 11.2V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.8M21 9v5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17v.01" />
    </>
  ),
  handshake: (
    <>
      <path d="M11 6.5L8.5 5 3 8v7l2 1M13 6.5L15.5 5 21 8v7l-5.5 3.5L9 13.8" />
      <path d="M13 6.5l-4 3.2a1.5 1.5 0 001.9 2.3L13 10.5l5 4" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function ArrowRight({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" />
    </svg>
  );
}
