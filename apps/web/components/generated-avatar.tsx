import { createInitialsAvatar } from "../lib/initials-avatar";
import { publicIdentityInitials } from "../lib/public-identity";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  alt?: string;
  className?: string;
  name?: string | null;
  seed: string;
  size?: Size;
  variant?: string | null;
};

const sizeClass: Record<Size, string> = {
  sm: "sm",
  md: "",
  lg: "lg",
  xl: "xl",
};

export function GeneratedAvatar({ alt, className, name, seed, size = "md", variant }: Props) {
  const letters = publicIdentityInitials(name);
  const svg = createInitialsAvatar(name, seed, variant);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const classes = [
    "generated-avatar",
    sizeClass[size],
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span aria-label={alt || `${letters} initials avatar`} className={classes} role="img">
      {/* This generated data URI has no remote image for Next.js to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" aria-hidden="true" src={src} />
    </span>
  );
}
