import { avatarColorIndex, avatarInitials } from "../lib/avatar-variant";
import { Icon } from "./icon";

type Size = "sm" | "md" | "lg" | "xl";

type Props = {
  alt?: string;
  className?: string;
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
export function GeneratedAvatar({ alt, className, name, seed, size = "md", variant }: Props) {
  const initials = avatarInitials(name);
  const classes = ["generated-avatar", sizeClass[size], className || ""].filter(Boolean).join(" ");

  return (
    <span
      aria-label={alt || name || "Avatar"}
      className={classes}
      data-avatar-color={avatarColorIndex(variant, seed)}
      role="img"
    >
      {initials ? (
        <span aria-hidden="true" className="generated-avatar-initials">{initials}</span>
      ) : (
        <Icon aria-hidden="true" name="user" />
      )}
    </span>
  );
}
