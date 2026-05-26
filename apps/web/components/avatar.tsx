type Size = "sm" | "md" | "lg" | "xl";

type Variant = "buyer" | "seller";

type Props = {
  alt?: string;
  className?: string;
  initials?: string;
  name: string;
  size?: Size;
  src?: string | null;
  variant?: Variant;
};

const sizeClass: Record<Size, string> = {
  sm: "",
  md: "",
  lg: "lg",
  xl: "xl",
};

export function Avatar({
  alt,
  className,
  initials,
  name,
  size = "md",
  src,
  variant = "buyer",
}: Props) {
  const fallback = (initials || name.trim().slice(0, 1) || "?").toUpperCase();
  const classes = [
    "avatar",
    variant === "seller" ? "seller" : "",
    sizeClass[size],
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span aria-label={alt || `${name} profile photo`} className={classes}>
      {src ? <img alt={alt || `${name} profile photo`} src={src} /> : fallback}
    </span>
  );
}
