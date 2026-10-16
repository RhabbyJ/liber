// Fields that show their validation message next to their own control.
export const SELLER_PROPERTY_INLINE_FIELDS = [
  "addressLine1",
  "addressLine2",
  "bathrooms",
  "bedrooms",
  "city",
  "description",
  "lotSize",
  "ownershipConfirmed",
  "price",
  "squareFeet",
  "state",
  "zip",
] as const;

export type SellerPropertyFormField = (typeof SELLER_PROPERTY_INLINE_FIELDS)[number];

export type SellerPropertyFormState = {
  message: string;
  fieldErrors?: Partial<Record<SellerPropertyFormField, string>>;
};

export const initialSellerPropertyFormState: SellerPropertyFormState = { message: "" };
