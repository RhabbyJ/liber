import { ICON_PATHS, ICON_VIEWBOX, LOGO_VIEWBOX, WORDMARK_PATHS } from "./logo-paths";

type LogoProps = {
  className?: string;
  /** Color of the "Unimark" wordmark. The cart icon is always Warm Teal unless `mono` is set. */
  tone?: "ink" | "light";
  /** Render the whole lockup in a single color (e.g. light on a teal background). */
  mono?: boolean;
  title?: string;
};

const TONES = { ink: "#1B1C28", light: "#F7F7F7" } as const;

/** Official UniMark lockup (cart icon + wordmark), drawn from the brand guide artwork. */
export function Logo({ className, tone = "ink", mono = false, title = "UniMark" }: LogoProps) {
  const word = TONES[tone];
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} role="img" aria-label={title}>
      <g fill={mono ? word : "#00AAB2"}>
        {ICON_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </g>
      <g fill={word} style={{ transition: "fill 0.3s ease" }}>
        {WORDMARK_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function LogoIcon({ className, color = "#00AAB2" }: { className?: string; color?: string }) {
  return (
    <svg viewBox={ICON_VIEWBOX} className={className} aria-hidden="true">
      <g fill={color}>
        {ICON_PATHS.map((d) => (
          <path key={d.slice(0, 24)} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** The two cart "wheels" from the icon, used as a small brand motif. */
export function WheelDots({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="15 68.6 57 20.2" className={className} aria-hidden="true">
      <g fill={color}>
        <path d={ICON_PATHS[1]} />
        <path d={ICON_PATHS[2]} />
      </g>
    </svg>
  );
}
