import { randomAvatar } from "avatarka";
import { resolveAvatarVariant } from "../lib/avatar-variant";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  alt?: string;
  className?: string;
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

export function GeneratedAvatar({ alt, className, seed, size = "md", variant }: Props) {
  const resolved = resolveAvatarVariant(variant, seed);
  const svg = randomAvatar("animals", resolved.seed);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  const classes = [
    "generated-avatar",
    sizeClass[size],
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span aria-label={alt || "Generated buyer avatar"} className={classes} role="img">
      <img alt="" aria-hidden="true" src={src} />
    </span>
  );
}
