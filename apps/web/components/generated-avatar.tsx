import type { CSSProperties, ReactElement } from "react";
import { resolveAvatarVariant, type AvatarShape } from "../lib/avatar-variant";

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

const saltTransforms = [
  "translateY(0) rotate(0deg) scale(1)",
  "translateY(-1px) rotate(-8deg) scale(0.95)",
  "translateY(1px) rotate(8deg) scale(0.97)",
  "translateY(0) rotate(0deg) scale(0.9)",
];

const shapePaths: Record<AvatarShape, ReactElement> = {
  cat: (
    <>
      <path d="M7.2 18.4c-1.6-1.4-2.5-3.4-2.5-5.6 0-1.9.7-3.6 1.9-4.9L5.8 4.4c-.1-.6.5-1 1-.7l3.1 1.8a8 8 0 0 1 4.2 0l3.1-1.8c.5-.3 1.1.1 1 .7l-.8 3.5a7.3 7.3 0 0 1 1.9 4.9c0 2.2-.9 4.2-2.5 5.6H7.2z" />
      <circle cx="9.2" cy="12.8" r="1.1" />
      <circle cx="14.8" cy="12.8" r="1.1" />
    </>
  ),
  dog: (
    <>
      <path d="M7.3 18.5c-1.5-1.3-2.4-3.1-2.4-5.2 0-3.6 2.9-6.5 6.6-6.5h1c3.7 0 6.6 2.9 6.6 6.5 0 2.1-.9 3.9-2.4 5.2H7.3z" />
      <path d="M5.7 8.3c-1.2-.7-2.5.1-2.5 1.5 0 1.9 1.2 3.5 2.9 4.2.2-2.1.7-4.1-.4-5.7z" />
      <path d="M18.3 8.3c1.2-.7 2.5.1 2.5 1.5 0 1.9-1.2 3.5-2.9 4.2-.2-2.1-.7-4.1.4-5.7z" />
      <circle cx="14.5" cy="12.4" r="1" />
    </>
  ),
  house: (
    <>
      <path d="M4 11.6 12 5l8 6.6v7.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 18.8v-7.2z" />
      <path d="M9 20v-5.4h6V20" />
    </>
  ),
  key: (
    <>
      <path d="M8.7 14.6a4.3 4.3 0 1 1 3.5-3.5H21v3h-2.2v2.2h-3V14h-3.6a4.3 4.3 0 0 1-3.5.6z" />
      <circle cx="8.2" cy="10.8" r="1.4" />
    </>
  ),
  leaf: (
    <>
      <path d="M19.8 4.4C12.8 4 6.1 7.2 4.5 13.2c-.9 3.4 1.4 6 4.6 6.1 6.1.2 10.3-6 10.7-14.9z" />
      <path d="M6.8 17.4c3.8-1 6.9-3.3 9.2-7" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6-4.8 2.6.9-5.5-4-3.9 5.5-.8L12 3.5z" />
  ),
};

export function GeneratedAvatar({ alt, className, seed, size = "md", variant }: Props) {
  const resolved = resolveAvatarVariant(variant, seed);
  const classes = [
    "generated-avatar",
    sizeClass[size],
    className || "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    background: resolved.colorHex,
  } satisfies CSSProperties;
  const markStyle = {
    transform: saltTransforms[resolved.salt % saltTransforms.length],
  } satisfies CSSProperties;

  return (
    <span aria-label={alt || "Generated buyer avatar"} className={classes} role="img" style={style}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <g style={markStyle}>{shapePaths[resolved.shape]}</g>
      </svg>
    </span>
  );
}
