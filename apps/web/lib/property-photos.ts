import { propertySubtypeFromSeekingPropertyType, type PropertySubtype } from "./property-types";

/**
 * Representative listing photography per property type. These are original
 * generated photographs of no real address; they illustrate what a buyer is
 * seeking or what kind of home a seller listed, never a specific property.
 */
const propertyPhotos: Record<PropertySubtype, readonly string[]> = {
  HOME: [
    "/images/homes/house-1.webp",
    "/images/homes/house-2.webp",
    "/images/homes/house-3.webp",
    "/images/homes/house-4.webp",
    "/images/homes/house-5.webp",
    "/images/homes/house-6.webp",
  ],
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

/**
 * Photos for a page of cards in display order: each card keeps its seeded photo unless an
 * earlier card of the same type already shows it, so a page never repeats a photo while the
 * type still has unused ones. Maps call this with the same list so pins match their cards.
 */
export function distinctPropertyPhotos(items: ReadonlyArray<{ seed: string; value: unknown }>) {
  const used = new Map<PropertySubtype, Set<number>>();
  return items.map(({ seed, value }) => {
    const subtype = propertySubtypeFromSeekingPropertyType(value);
    const photos = propertyPhotos[subtype];
    const taken = used.get(subtype) ?? new Set<number>();
    let index = seedIndex(seed, photos.length);
    if (taken.size < photos.length) while (taken.has(index)) index = (index + 1) % photos.length;
    taken.add(index);
    used.set(subtype, taken);
    return photos[index];
  });
}

function seedIndex(seed: string, count: number) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}
