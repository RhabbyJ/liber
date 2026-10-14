type CoverCandidate = { id: string; propertyIdentityVersion: number };

/**
 * The owner's cover photo: the first image (already ordered by sort order, then upload)
 * of the current property identity. Photos from an earlier identity never represent it.
 */
export function currentCoverImageId(property: { identityVersion: number; images?: CoverCandidate[] }) {
  return property.images?.find((image) => image.propertyIdentityVersion === property.identityVersion)?.id;
}
