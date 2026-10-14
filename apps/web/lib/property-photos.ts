import { propertySubtypeFromSeekingPropertyType, type PropertySubtype } from "./property-types";

/**
 * Representative listing photography per property type. These are original
 * generated photographs of no real address; they illustrate what a buyer is
 * seeking or what kind of home a seller listed, never a specific property.
 */
const propertyPhotos: Record<PropertySubtype, readonly string[]> = {
  HOME: ["/images/homes/house-1.webp", "/images/homes/house-2.webp", "/images/homes/house-3.webp"],
  CONDO: ["/images/homes/condo-1.webp", "/images/homes/condo-2.webp"],
  TOWNHOUSE: ["/images/homes/townhouse-1.webp", "/images/homes/townhouse-2.webp"],
  MANUFACTURED: ["/images/homes/manufactured-1.webp", "/images/homes/manufactured-2.webp"],
  LAND: ["/images/homes/land-1.webp", "/images/homes/land-2.webp"],
};

/** Stable photo for a property type; the seed spreads cards of one type across its photos. */
export function propertyPhotoSrc(value: unknown, seed = "") {
  const photos = propertyPhotos[propertySubtypeFromSeekingPropertyType(value)];
  return photos[seedIndex(seed, photos.length)];
}

function seedIndex(seed: string, count: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}
