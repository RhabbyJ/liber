import Image from "next/image";
import { propertyPhotoSrc } from "../lib/property-photos";
import { propertySubtypeFromSeekingPropertyType } from "../lib/property-types";

export type ArtworkMotion = "float" | "lift" | "none" | "pulse";

export function propertyArtworkSrc(value: unknown, seed = "") {
  return propertyPhotoSrc(value, seed);
}

/** Listing-style media for a property type: a representative photo, stable per seed. */
export function PropertyTypeArtwork({
  className,
  motion = "none",
  priority = false,
  seed = "",
  sizes = "64px",
  value,
}: {
  className?: string;
  motion?: ArtworkMotion;
  priority?: boolean;
  /** Spreads cards of the same type across that type's photos (buyer or property id). */
  seed?: string;
  sizes?: string;
  value?: unknown;
}) {
  return (
    <span
      aria-hidden="true"
      className={`property-type-artwork${className ? ` ${className}` : ""}`}
      data-artwork-motion={motion}
      data-property-type={propertySubtypeFromSeekingPropertyType(value)}
    >
      <Image
        alt=""
        className="property-type-artwork-image"
        fill
        priority={priority}
        sizes={sizes}
        src={propertyPhotoSrc(value, seed)}
      />
    </span>
  );
}
