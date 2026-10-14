/**
 * Liber's footer street: single-weight line art of Los Angeles homes, palms and a condo
 * tower on one ground line, drawn in the hairline colour. Decorative only.
 */
export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 1440 140"
    >
      <path d="M0 132h1440" />
      {/* Spanish bungalow */}
      <path d="M50 132V93h120v39M44 95l36-22h60l36 22M150 78V66h10v15M100 132v-18a10 10 0 0 1 20 0v18M62 104h22v14H62zM136 104h22v14h-22z" />
      {/* Palm */}
      <path d="M214 132c0-22 2-42 8-62M222 70c-14-4-26 2-32 12M222 70c12-8 26-6 34 4M222 70c-4-12-16-18-26-16M222 70c6-12 20-16 30-10M222 70c-10 4-16 14-16 24M222 70c10 4 16 12 18 22" />
      {/* Two-story contemporary */}
      <path d="M272 72h156M280 72v60M420 72v60M296 84h50v24h-50zM360 84h44v24h-44zM300 132v-24h18v24M330 112h74v14h-74z" />
      {/* Oak */}
      <path d="M460 132v-12M460 120a16 16 0 1 0-0.1 0" />
      {/* Mid-century post-and-beam */}
      <path d="M484 98l156-8M500 97v35M630 91v41M520 97v35M540 96v36M560 95v37M580 94v38M600 132v-24h14v24" />
      {/* Condo tower */}
      <path d="M684 40h102M690 40v92M780 40v92M690 56h90M690 72h90M690 88h90M690 104h90M690 120h90M712 40v92M735 40v92M758 40v92" />
      {/* Tall palm */}
      <path d="M812 132c0-28 3-56 10-84M822 48c-14-4-26 2-32 12M822 48c12-8 26-6 34 4M822 48c-4-12-16-18-26-16M822 48c6-12 20-16 30-10M822 48c-10 4-16 14-16 24M822 48c10 4 16 12 18 22" />
      {/* Townhomes */}
      <path d="M860 132V86h192v46M856 88l36-24 32 22 32-22 32 22 32-22 36 24M924 86v46M988 86v46M870 132v-20h12v20M934 132v-20h12v20M998 132v-20h12v20M892 96h20v14h-20zM956 96h20v14h-20zM1020 96h20v14h-20z" />
      {/* Twin trees */}
      <path d="M1096 132v-12M1096 120a20 20 0 1 1 8-38a14 14 0 1 1 6 30M1110 132v-8" />
      {/* Craftsman */}
      <path d="M1150 132V95h140v37M1138 97l82-32 82 32M1150 108h140M1170 108v24M1270 108v24M1210 132v-20h16v20M1240 114h22v12h-22zM1176 114h22v12h-22zM1210 84h20" />
      {/* Short palm */}
      <path d="M1330 132c0-16 1-30 5-44M1335 88c-11-3-20 2-25 10M1335 88c9-6 20-5 26 3M1335 88c-3-9-12-14-20-12M1335 88c5-9 15-12 23-8" />
      {/* Cottage */}
      <path d="M1370 132v-28h60v28M1364 106l36-22 36 22M1394 132v-14h12v14" />
    </svg>
  );
}
