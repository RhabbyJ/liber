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

export type PropertySubtype =
  | "HOME"
  | "MULTIFAMILY"
  | "RETAIL"
  | "STNL"
  | "INDUSTRIAL"
  | "LAND"
  | "OFFICE"
  | "OTHER";

export type BuyerCriteriaDetail = {
  propertyCategory: "HOME" | "LAND" | "COMMERCIAL";
  propertySubtype: PropertySubtype;
  bedroomsMin?: number;
  bathroomsMin?: number;
  squareFeetMin?: number;
  squareFeetMax?: number;
  lotSizeMin?: number;
  lotSizeMax?: number;
  capRateMin?: number;
  capRateMax?: number;
  unitsMin?: number;
  unitsMax?: number;
};

export type Buyer = {
  id: string;
  avatarUrl?: string;
  userId: string;
  name: string;
  location: string;
  city: string;
  state: string;
  type: string;
  purpose: string;
  visibility: "active" | "draft" | "hidden";
  budgetMin: number;
  budgetMax: number;
  downPaymentMin: number;
  downPaymentMax: number;
  rating: number;
  reviewCount: number;
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
    name: "Julie P.",
    location: "Northridge, CA",
    city: "Northridge",
    state: "CA",
    type: "Home Buyer",
    purpose: "Downsizing home",
    visibility: "active",
    budgetMin: 780000,
    budgetMax: 960000,
    downPaymentMin: 190000,
    downPaymentMax: 260000,
    rating: 5,
    reviewCount: 1,
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
      { id: "badge-julie-pre-approved", type: "PRE_APPROVED", label: "Pre-approved", status: "active", expiresInDays: 71 },
      { id: "badge-julie-earnest", type: "EARNEST_MONEY_DEPOSITED", label: "Earnest money review", status: "pending" },
      { id: "badge-julie-completed", type: "COMPLETED_TRANSACTION", label: "Completed transaction", status: "active" },
    ],
  },
  {
    id: "marcus-r",
    userId: "user-marcus",
    name: "Marcus R.",
    location: "Sherman Oaks, CA",
    city: "Sherman Oaks",
    state: "CA",
    type: "Investor",
    purpose: "Light rehab residential",
    visibility: "active",
    budgetMin: 700000,
    budgetMax: 1200000,
    downPaymentMin: 300000,
    downPaymentMax: 500000,
    rating: 4.8,
    reviewCount: 7,
    bio: "Cash-heavy investor looking for light rehab homes with clear upside and fast closing potential.",
    needs: ["Fixer or dated home", "Clear title", "Price below ARV"],
    wants: ["Non-contingent", "Quick inspection", "Valley locations"],
    criteria: ["Home", "Investor", "Cash buyer", "Non-contingent"],
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
    name: "Asha K.",
    location: "Los Angeles, CA",
    city: "Los Angeles",
    state: "CA",
    type: "Commercial Buyer",
    purpose: "Small multifamily acquisition",
    visibility: "active",
    budgetMin: 1800000,
    budgetMax: 4200000,
    downPaymentMin: 600000,
    downPaymentMax: 1200000,
    rating: 4.9,
    reviewCount: 3,
    bio: "Seeking stable multifamily assets with durable rent growth and clean operating history.",
    needs: ["Multifamily", "6+ units", "5%+ cap rate"],
    wants: ["Value-add", "Parking", "Built after 1970"],
    criteria: ["Multifamily", "6+ units", "5%+ cap", "LA County"],
    criteriaDetails: [{ propertyCategory: "COMMERCIAL", propertySubtype: "MULTIFAMILY", capRateMin: 5, unitsMin: 6 }],
    propertySubtypes: ["MULTIFAMILY"],
    refreshedAt: "2026-05-16",
    lat: 34.0522,
    lng: -118.2437,
    badges: [
      { id: "badge-asha-pre-approved", type: "PRE_APPROVED", label: "Pre-approved", status: "active", expiresInDays: 42 },
      { id: "badge-asha-funds", type: "VERIFIED_FUNDS", label: "Verified funds", status: "active" },
    ],
  },
  {
    id: "draft-buyer",
    userId: "user-draft",
    name: "Draft Buyer",
    location: "Pasadena, CA",
    city: "Pasadena",
    state: "CA",
    type: "Draft",
    purpose: "Not searchable yet",
    visibility: "draft",
    budgetMin: 500000,
    budgetMax: 800000,
    downPaymentMin: 100000,
    downPaymentMax: 200000,
    rating: 0,
    reviewCount: 0,
    bio: "This profile proves draft visibility filtering.",
    needs: ["Draft profile"],
    wants: ["Activation"],
    criteria: ["Home"],
    criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME" }],
    propertySubtypes: ["HOME"],
    refreshedAt: "2026-05-15",
    lat: 34.1478,
    lng: -118.1445,
    badges: [{ id: "badge-draft-pre-approved", type: "PRE_APPROVED", label: "Pre-approved", status: "expired", expiresInDays: -1 }],
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
    description: "A quiet single-story home that fits Julie's stated criteria.",
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
    buyer: "Julie P.",
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
    owner: "Julie P.",
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
    target: "Julie P.",
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
