export type Badge = {
  id: string;
  type:
    | "PRE_APPROVED"
    | "EARNEST_MONEY_DEPOSITED"
    | "CASH_BUYER"
    | "NON_CONTINGENT"
    | "VERIFIED_IDENTITY"
    | "VERIFIED_FUNDS"
    | "COMPLETED_TRANSACTION";
  label: string;
  status: "active" | "pending" | "expired";
  expiresInDays?: number;
};

// V1 is residential-only; expand alongside the Prisma enums when commercial/land returns.
export type PropertySubtype = "HOME";

export type BuyerCriteriaDetail = {
  id?: string;
  propertyCategory: "HOME";
  propertySubtype: PropertySubtype;
  bedroomsMin?: number;
  bathroomsMin?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  lotSizeMin?: number;
  lotSizeMax?: number;
  priceMin?: number;
  priceMax?: number;
  yearBuiltMin?: number;
  condition?: string;
  features?: string[];
};

export type Buyer = {
  id: string;
  avatarVariant?: string;
  userId?: string;
  name: string;
  location: string;
  city: string;
  neighborhood?: string;
  postalCode?: string;
  state: string;
  type: string;
  purpose: string;
  visibility: "active" | "draft" | "hidden";
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  bio: string;
  needs: string[];
  wants: string[];
  badges: Badge[];
  criteria: string[];
  criteriaDetails: BuyerCriteriaDetail[];
  propertySubtypes: PropertySubtype[];
  refreshedAt: string;
  lat: number;
  lng: number;
};

export const buyers: Buyer[] = [
  {
    id: "julie-p",
    userId: "fixture-user-julie",
    name: "Maple Haven",
    location: "Northridge, CA",
    city: "Northridge",
    neighborhood: "Northridge",
    postalCode: "91325",
    state: "CA",
    type: "Conventional financing",
    purpose: "House",
    visibility: "active",
    budgetMin: 780000,
    budgetMax: 960000,
    downPaymentMin: 190000,
    downPaymentMax: 260000,
    bio: "Looking to simplify life in a quiet, comfortable home with low maintenance and good access to family.",
    needs: ["4 bedrooms", "2 bathrooms", "Garage", "Quiet street", "No major remodel"],
    wants: ["Single story", "No pool", "Low-maintenance yard", "Near Northridge"],
    criteria: ["Home", "Northridge", "Up to $960k", "No pool", "Garage"],
    criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME", bedroomsMin: 4, bathroomsMin: 2 }],
    propertySubtypes: ["HOME"],
    refreshedAt: "2026-05-18",
    lat: 34.2381,
    lng: -118.5301,
    badges: [
      { id: "badge-julie-pre-approved", type: "PRE_APPROVED", label: "Admin-verified pre-approval", status: "active", expiresInDays: 71 },
      { id: "badge-julie-earnest", type: "EARNEST_MONEY_DEPOSITED", label: "Earnest money review", status: "pending" },
      { id: "badge-julie-completed", type: "COMPLETED_TRANSACTION", label: "Completed transaction", status: "active" },
    ],
  },
  {
    id: "marcus-r",
    userId: "user-marcus",
    name: "Cedar Key",
    location: "Sherman Oaks, CA",
    city: "Sherman Oaks",
    postalCode: "91423",
    state: "CA",
    type: "Cash",
    purpose: "House",
    visibility: "active",
    budgetMin: 700000,
    budgetMax: 1200000,
    downPaymentMin: 300000,
    downPaymentMax: 500000,
    bio: "Cash buyer looking for light rehab homes with clear upside and fast closing potential.",
    needs: ["Fixer or dated home", "Clear title", "Price below ARV"],
    wants: ["Non-contingent", "Quick inspection", "Valley locations"],
    criteria: ["Home", "Cash buyer", "Non-contingent"],
    criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME" }],
    propertySubtypes: ["HOME"],
    refreshedAt: "2026-05-17",
    lat: 34.1486,
    lng: -118.4484,
    badges: [
      { id: "badge-marcus-cash", type: "CASH_BUYER", label: "Cash buyer", status: "active" },
      { id: "badge-marcus-non-contingent", type: "NON_CONTINGENT", label: "Non-contingent", status: "active" },
      { id: "badge-marcus-funds", type: "VERIFIED_FUNDS", label: "Verified funds", status: "active" },
    ],
  },
  {
    id: "asha-k",
    userId: "user-asha",
    name: "Willow Nest",
    location: "Los Angeles, CA",
    city: "Los Angeles",
    state: "CA",
    type: "Conventional financing",
    purpose: "House",
    visibility: "active",
    budgetMin: 1800000,
    budgetMax: 4200000,
    downPaymentMin: 600000,
    downPaymentMax: 1200000,
    bio: "Searching for a spacious family home with room to grow in LA County.",
    needs: ["5 bedrooms", "3 bathrooms", "Large lot"],
    wants: ["Pool", "Parking", "Built after 1970"],
    criteria: ["Home", "5+ bedrooms", "Pool", "LA County"],
    criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME", bedroomsMin: 5, bathroomsMin: 3 }],
    propertySubtypes: ["HOME"],
    refreshedAt: "2026-05-16",
    lat: 34.0522,
    lng: -118.2437,
    badges: [
      { id: "badge-asha-pre-approved", type: "PRE_APPROVED", label: "Admin-verified pre-approval", status: "active", expiresInDays: 42 },
      { id: "badge-asha-funds", type: "VERIFIED_FUNDS", label: "Verified funds", status: "active" },
    ],
  },
  {
    id: "draft-buyer",
    userId: "user-draft",
    name: "Quiet Courtyard",
    location: "Pasadena, CA",
    city: "Pasadena",
    state: "CA",
    type: "Other",
    purpose: "House",
    visibility: "draft",
    budgetMin: 500000,
    budgetMax: 800000,
    downPaymentMin: 100000,
    downPaymentMax: 200000,
    bio: "This profile proves draft visibility filtering.",
    needs: ["Draft profile"],
    wants: ["Activation"],
    criteria: ["Home"],
    criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME" }],
    propertySubtypes: ["HOME"],
    refreshedAt: "2026-05-15",
    lat: 34.1478,
    lng: -118.1445,
    badges: [{ id: "badge-draft-pre-approved", type: "PRE_APPROVED", label: "Admin-verified pre-approval", status: "expired", expiresInDays: -1 }],
  },
];

export type Property = {
  id: string;
  ownerUserId: string;
  title: string;
  location: string;
  price: number;
  beds?: number;
  baths?: number;
  area?: number;
  lotSize?: number;
  garageArea?: number;
  propertyType: PropertySubtype;
  condition: string;
  features: string[];
  description: string;
  status: string;
};

export const properties: Property[] = [
  {
    id: "northridge-garden-home",
    ownerUserId: "seller-fixture",
    title: "Northridge garden home",
    location: "Northridge, CA 91324",
    price: 925000,
    beds: 4,
    baths: 2,
    area: 2140,
    lotSize: 7200,
    garageArea: 420,
    propertyType: "HOME",
    condition: "Well maintained",
    features: ["Single story", "No pool", "Attached garage", "Low-maintenance yard"],
    description: "A quiet single-story home that fits Maple Haven's stated criteria.",
    status: "Ownership pending",
  },
];

export type Invite = {
  id: string;
  sellerId: string;
  buyerProfileId: string;
  propertyId: string;
  buyer: string;
  property: string;
  propertyStatus?: string;
  status: "Sent" | "Viewed" | "Accepted" | "Declined" | "Expired";
  sentAt: string;
  sentAtDate: string;
  expiresAt?: string;
  title: string;
  message: string;
};

export const invites: Invite[] = [
  {
    id: "invite-1",
    sellerId: "seller-fixture",
    buyerProfileId: "julie-p",
    propertyId: "northridge-garden-home",
    buyer: "Maple Haven",
    property: "Northridge garden home",
    status: "Sent",
    sentAt: "Today",
    sentAtDate: "2026-05-20",
    title: "Your Northridge criteria match this home",
    message: "The house is single story, low maintenance, and inside your stated budget range.",
  },
];

export const notifications = [
  {
    id: "notification-1",
    userId: "fixture-user-julie",
    type: "invite_received",
    title: "New property invite",
    body: "A seller invited you to review Northridge garden home.",
    readAt: null,
    createdAt: "Today",
  },
  {
    id: "notification-2",
    userId: "fixture-user-julie",
    type: "badge_expiration",
    title: "Pre-approval expires in 71 days",
    body: "Refresh the badge before it expires to keep it active in seller search.",
    readAt: "Yesterday",
    createdAt: "Yesterday",
  },
];

export const adminDocuments = [
  {
    id: "doc-1",
    owner: "Seller Fixture",
    subject: "Northridge garden home",
    type: "Ownership",
    status: "Pending",
    storage: "private/ownership/northridge-garden-home.pdf",
  },
  {
    id: "doc-2",
    owner: "Maple Haven",
    subject: "Pre-approval badge",
    type: "Pre-approval",
    status: "Approved",
    storage: "private/buyer/julie-preapproval.pdf",
  },
];

export const auditLogs = [
  {
    id: "audit-1",
    actor: "Admin Fixture",
    action: "grant_badge",
    target: "Maple Haven",
    createdAt: "Today",
  },
  {
    id: "audit-2",
    actor: "Admin Fixture",
    action: "review_document",
    target: "Northridge garden home",
    createdAt: "Yesterday",
  },
];

export function getBuyerById(id: string) {
  return buyers.find((buyer) => buyer.id === id);
}

export function getPropertyById(id: string) {
  return properties.find((property) => property.id === id);
}
