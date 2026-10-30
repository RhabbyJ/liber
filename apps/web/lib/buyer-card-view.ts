import type { IconName } from "../components/icon";
import type { PublicBuyerPreviewDTO, SellerBadgeDTO, SellerBuyerCriteriaDTO, SellerBuyerSummaryDTO } from "./buyer-dtos";
import { compactBudgetRange } from "./listing-format";
import { TEST_PREAPPROVAL_LABEL } from "./test-preapproval";

/** One line in the card's trust column. Only "verified" lines may use the verified shield. */
export type BuyerCardSignal = {
  icon: IconName;
  label: string;
  tone: "verified" | "test" | "neutral" | "unverified";
};

export type BuyerCardChip = { icon: IconName; label: string };

/** Everything a buyer card shows, built only from the DTO the viewer is allowed to receive. */
export type BuyerCardView = {
  ariaLabel: string;
  area: string;
  avatar: { name: string; seed: string; variant?: string };
  budget: string;
  code?: string;
  href?: string;
  isDemo: boolean;
  name: string;
  needs: BuyerCardChip[];
  seeking: BuyerCardChip;
  signals: BuyerCardSignal[];
  updated?: string;
  wants: BuyerCardChip[];
};

export const DEMO_BUYER_LABEL = "Demo buyer";

type NeedsLike = Pick<SellerBuyerCriteriaDTO, "bathroomsMin" | "bedroomsMin" | "lotSizeMin" | "squareFeetMin">;

const propertyTypes: Record<string, { icon: IconName; seeking: string }> = {
  house: { icon: "home", seeking: "Seeking a house" },
  condo: { icon: "condo", seeking: "Seeking a condo" },
  townhouse: { icon: "townhouse", seeking: "Seeking a townhouse" },
  manufactured: { icon: "manufactured", seeking: "Seeking a manufactured home" },
  land: { icon: "land", seeking: "Seeking land" },
};

const wantIcons: Record<string, IconName> = {
  "move-in ready": "sparkle",
  "mild fixer": "wrench",
  fixer: "wrench",
  pool: "pool",
  parking: "car",
  garage: "car",
  adu: "adu",
  yard: "tree",
};

/** "Julie P. #7C4E2A91B6D0" -> name and account code; legacy labels keep the whole string. */
export function splitPublicIdentity(label: string) {
  const match = label.match(/^(.+) #([A-F0-9]{12})$/u);
  return match ? { name: match[1], code: `#${match[2]}` } : { name: label, code: undefined };
}

export function seekingChip(propertyType?: string | null): BuyerCardChip {
  const known = propertyTypes[(propertyType ?? "").trim().toLowerCase()];
  return known ? { icon: known.icon, label: known.seeking } : { icon: "home", label: "Buyer demand" };
}

export function needChips(criteria?: NeedsLike | null): BuyerCardChip[] {
  if (!criteria) return [];
  const chips: BuyerCardChip[] = [];
  if (criteria.bedroomsMin) chips.push({ icon: "bed", label: `${criteria.bedroomsMin}+ ${criteria.bedroomsMin === 1 ? "bed" : "beds"}` });
  if (criteria.bathroomsMin) chips.push({ icon: "bath", label: `${criteria.bathroomsMin}+ ${criteria.bathroomsMin === 1 ? "bath" : "baths"}` });
  if (criteria.squareFeetMin) chips.push({ icon: "ruler", label: `${criteria.squareFeetMin.toLocaleString("en-US")}+ sqft` });
  else if (criteria.lotSizeMin) chips.push({ icon: "land", label: `${criteria.lotSizeMin.toLocaleString("en-US")}+ sqft lot` });
  return chips;
}

/** Condition first, then amenities, each with a feature icon; unknown values keep a neutral tag. */
export function wantChips(condition: string | undefined, features: readonly string[] = []): BuyerCardChip[] {
  const seen = new Set<string>();
  return [condition, ...features]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((label) => ({ icon: wantIcons[label.toLowerCase()] ?? "tag", label }));
}

/** Trust column for the public preview, from its display-safe badge labels only. */
export function previewSignals(badges: readonly string[]): BuyerCardSignal[] {
  const signals: BuyerCardSignal[] = [];
  if (badges.includes("Pre-approved")) signals.push({ icon: "check-shield", label: "Pre-approval verified", tone: "verified" });
  if (badges.includes("Cash buyer")) signals.push({ icon: "check-shield", label: "Cash buyer · funds verified", tone: "verified" });
  else if (badges.includes("Verified funds")) signals.push({ icon: "check-shield", label: "Funds verified", tone: "verified" });
  if (badges.includes("ID verified")) signals.push({ icon: "check-shield", label: "ID verified", tone: "verified" });
  if (badges.includes(TEST_PREAPPROVAL_LABEL)) signals.push({ icon: "info", label: TEST_PREAPPROVAL_LABEL, tone: "test" });
  if (signals.length === 0) signals.push({ icon: "shield", label: "Not verified yet", tone: "unverified" });
  return signals;
}

/** Trust column for approved sellers: financing method and down payment, then each active badge. */
export function sellerSignals(
  buyer: Pick<SellerBuyerSummaryDTO, "badges" | "downPaymentMax" | "downPaymentMin" | "type">,
): BuyerCardSignal[] {
  const active = buyer.badges.filter((badge) => badge.status === "active");
  const has = (type: SellerBadgeDTO["type"]) => active.find((badge) => badge.type === type);
  const signals: BuyerCardSignal[] = [];
  const financed = buyer.type === "Conventional financing";
  const downPayment = compactRange(buyer.downPaymentMin, buyer.downPaymentMax);

  if (buyer.type === "Cash") signals.push({ icon: "money", label: "Cash purchase", tone: "neutral" });
  else if (financed) signals.push({ icon: "doc", label: downPayment ? `Financed · ${downPayment} down` : "Financed", tone: "neutral" });
  else if (buyer.type === "Other") signals.push({ icon: "doc", label: "Other financing", tone: "neutral" });

  const preApproval = has("PRE_APPROVED");
  if (preApproval) {
    const expiry = typeof preApproval.expiresInDays === "number"
      ? ` · expires in ${preApproval.expiresInDays} ${preApproval.expiresInDays === 1 ? "day" : "days"}`
      : "";
    signals.push({ icon: "check-shield", label: `Pre-approved${expiry}`, tone: "verified" });
  }
  if (has("CASH_BUYER")) signals.push({ icon: "check-shield", label: "Cash buyer · funds verified", tone: "verified" });
  else if (has("VERIFIED_FUNDS")) signals.push({ icon: "check-shield", label: "Funds verified", tone: "verified" });
  if (has("VERIFIED_IDENTITY")) signals.push({ icon: "check-shield", label: "ID verified", tone: "verified" });
  if (has("TEST_PRE_APPROVED")) signals.push({ icon: "info", label: TEST_PREAPPROVAL_LABEL, tone: "test" });
  if (!signals.some((signal) => signal.tone === "verified" || signal.tone === "test")) {
    signals.push({ icon: "shield", label: financed ? "Not pre-approved" : "Not verified yet", tone: "unverified" });
  }
  return signals;
}

/** "2026-10-26" -> "Updated 3 days ago", using calendar days in UTC; unknown dates are omitted. */
export function updatedLabel(dateKey: string, now = new Date()) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const then = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days < 0) return undefined;
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 14) return `Updated ${days} days ago`;
  if (days < 60) return `Updated ${Math.floor(days / 7)} weeks ago`;
  return `Updated ${Math.floor(days / 30)} months ago`;
}

export function previewCardView(preview: PublicBuyerPreviewDTO): BuyerCardView {
  const { code, name } = splitPublicIdentity(preview.alias);
  const isDemo = preview.badges.includes(DEMO_BUYER_LABEL);
  const seeking = seekingChip(preview.label);
  return {
    ariaLabel: `${isDemo ? "Demo buyer " : ""}${preview.alias}: ${seeking.label.toLowerCase()} near ${preview.area}`,
    area: preview.area,
    avatar: { name: preview.alias, seed: preview.alias, variant: preview.avatarVariant },
    budget: preview.budgetLabel,
    code,
    isDemo,
    name,
    needs: needChips(preview),
    seeking,
    signals: previewSignals(preview.badges),
    wants: wantChips(preview.condition, preview.amenities),
  };
}

export function sellerCardView(buyer: SellerBuyerSummaryDTO, now = new Date()): BuyerCardView {
  const { code, name } = splitPublicIdentity(buyer.name);
  const criteria = buyer.criteriaDetails[0];
  const seeking = seekingChip(buyer.purpose);
  const area = buyer.location || "Liber service area";
  return {
    ariaLabel: `View ${buyer.isDemo ? "demo buyer " : ""}${buyer.name} buyer profile`,
    area,
    avatar: { name: buyer.name, seed: buyer.avatarSeed, variant: buyer.avatarVariant },
    budget: compactBudgetRange(buyer.budgetMin, buyer.budgetMax),
    code,
    href: `/buyers/${buyer.id}`,
    isDemo: buyer.isDemo,
    name,
    needs: needChips(criteria),
    seeking,
    signals: sellerSignals(buyer),
    updated: updatedLabel(buyer.refreshedAt, now),
    wants: wantChips(criteria?.condition, criteria?.features),
  };
}

function compactRange(min: number, max: number) {
  const range = compactBudgetRange(min, max);
  return range === "Budget not set" ? "" : range;
}
