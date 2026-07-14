import Image from "next/image";
import {
  propertySubtypeFromSeekingPropertyType,
  type PropertySubtype,
} from "../lib/property-types";

const propertyArtwork: Record<PropertySubtype, string> = {
  HOME: "/images/property-types/house-2d.webp",
  CONDO: "/images/property-types/condo-2d.webp",
  TOWNHOUSE: "/images/property-types/townhouse-2d.webp",
  MANUFACTURED: "/images/property-types/manufactured-2d.webp",
  LAND: "/images/property-types/land-2d.webp",
};

const propertyEmoji: Record<PropertySubtype, string> = {
  HOME: "/images/property-types/house-emoji.webp",
  CONDO: "/images/property-types/condo-emoji.webp",
  TOWNHOUSE: "/images/property-types/townhouse-emoji.webp",
  MANUFACTURED: "/images/property-types/manufactured-emoji.webp",
  LAND: "/images/property-types/land-emoji.webp",
};

export type ArtworkMotion = "float" | "lift" | "none" | "pulse";
export type PropertyArtworkVariant = "emoji" | "illustration";

export function PropertyTypeArtwork({
  className,
  motion = "lift",
  sizes = "64px",
  value,
  variant = "illustration",
}: {
  className?: string;
  motion?: ArtworkMotion;
  sizes?: string;
  value?: unknown;
  variant?: PropertyArtworkVariant;
}) {
  const subtype = propertySubtypeFromSeekingPropertyType(value);
  const source = variant === "emoji" ? propertyEmoji[subtype] : propertyArtwork[subtype];

  return (
    <span
      aria-hidden="true"
      className={`property-type-artwork${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      data-artwork-variant={variant}
      data-property-type={subtype}
    >
      <Image
        alt=""
        className="property-type-artwork-image"
        fill
        sizes={sizes}
        src={source}
      />
    </span>
  );
}
