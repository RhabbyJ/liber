import { avatarColorIndex, avatarInitials } from "../lib/avatar-variant";
import { Icon } from "./icon";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  alt?: string;
  className?: string;
  /** Hide from assistive tech when a visible name or a labelled control already names the avatar. */
  decorative?: boolean;
  name: string | null | undefined;
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

/** Initials on a palette color chosen by the persisted avatar token (or a seed hash). */
export function GeneratedAvatar({ alt, className, decorative = false, name, seed, size = "md", variant }: Props) {
  const initials = avatarInitials(name);
  const classes = ["generated-avatar", sizeClass[size], className || ""].filter(Boolean).join(" ");
  const accessibility = decorative
    ? { "aria-hidden": true as const }
    : { "aria-label": alt || (initials ? `${initials} initials avatar` : "Avatar"), role: "img" as const };

  return (
    <span className={classes} data-avatar-color={avatarColorIndex(variant, seed)} {...accessibility}>
      {initials ? (
        <span aria-hidden="true" className="generated-avatar-initials">{initials}</span>
      ) : (
        <Icon aria-hidden="true" name="user" />
      )}
    </span>
  );
}
