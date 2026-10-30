import { calculateLoiEscrowFees, type LoiTermsV1 } from "@liber/validators";

export function updateLoiEscrowProvider(terms: LoiTermsV1, escrow: LoiTermsV1["providers"]["escrow"]): LoiTermsV1 {
  const estimates = terms.costsAndCredits.closingCostEstimates;
  if (!estimates || escrow.feePayer === terms.providers.escrow.feePayer || escrow.feePayer === "EACH_OWN") {
    return { ...terms, providers: { ...terms.providers, escrow } };
  }
  const hasQuote = terms.providers.escrow.feePayer === "EACH_OWN"
    ? estimates.buyerEscrowCents !== null || estimates.sellerEscrowCents !== null
    : (terms.providers.escrow.feePayer === "BUYER" ? estimates.buyerEscrowCents : estimates.sellerEscrowCents) !== null;
  if (!hasQuote) return { ...terms, providers: { ...terms.providers, escrow } };
  // A supplied quote moves with the resolved fee total. With no quote, keep
  // blank fields automatic so subsequent price edits update both side fees.
  const fees = calculateLoiEscrowFees(terms.purchasePriceCents, terms.providers.escrow.feePayer, estimates);
  const total = fees.buyerCents === null || fees.sellerCents === null ? null : fees.buyerCents + fees.sellerCents;

  return {
    ...terms,
    providers: { ...terms.providers, escrow },
    costsAndCredits: {
      ...terms.costsAndCredits,
      closingCostEstimates: { ...estimates, buyerEscrowCents: escrow.feePayer === "BUYER" ? total : null, sellerEscrowCents: escrow.feePayer === "SELLER" ? total : null },
    },
  };
}

export function updateLoiCustomaryAllocation(terms: LoiTermsV1, customaryClosingCosts: boolean): LoiTermsV1 {
  return {
    ...terms,
    costsAndCredits: {
      ...terms.costsAndCredits,
      alternateClosingCostAllocation: customaryClosingCosts ? "" : terms.costsAndCredits.alternateClosingCostAllocation,
      closingCostPayers: customaryClosingCosts ? undefined : terms.costsAndCredits.closingCostPayers ?? { transferTaxes: "SELLER", governmentRetrofitItems: "SELLER" },
      customaryClosingCosts,
    },
  };
}

export function loiTitleFeePayer(terms: LoiTermsV1): "BUYER" | "SELLER" | "EACH_OWN" {
  // Historical drafts with buyer title fees keep their original allocation.
  return terms.providers.title.feePayer ?? (terms.costsAndCredits.closingCostEstimates?.buyerTitleInsuranceCents ? "EACH_OWN" : "SELLER");
}

export function updateLoiTitleFeePayer(terms: LoiTermsV1, feePayer: "BUYER" | "SELLER" | "EACH_OWN"): LoiTermsV1 {
  const title = { ...terms.providers.title, feePayer };
  const estimates = terms.costsAndCredits.closingCostEstimates;
  if (!estimates || terms.providers.title.feePayer === feePayer || feePayer === "EACH_OWN") {
    return { ...terms, providers: { ...terms.providers, title } };
  }
  // A partial each-own quote does not establish the combined title fee.
  const total = (terms.providers.title.feePayer === "EACH_OWN" && (estimates.buyerTitleInsuranceCents === null || estimates.sellerTitleInsuranceCents === null))
    || (estimates.buyerTitleInsuranceCents === null && estimates.sellerTitleInsuranceCents === null)
    ? null : (estimates.buyerTitleInsuranceCents ?? 0) + (estimates.sellerTitleInsuranceCents ?? 0);
  return {
    ...terms,
    providers: { ...terms.providers, title },
    costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: { ...estimates, buyerTitleInsuranceCents: feePayer === "BUYER" ? total : null, sellerTitleInsuranceCents: feePayer === "SELLER" ? total : null } },
  };
}

export const LOI_ITEMIZED_COST_FIELDS = [
  { key: "transferTaxes", id: "loi-estimate-transfer-taxes", label: "City and county transfer taxes" },
  { key: "governmentRetrofit", id: "loi-estimate-government-retrofit", label: "Government-required retrofit items" },
  { key: "hoaDocument", id: "loi-estimate-hoa-document", label: "HOA document fees" },
  { key: "hoaCertificate", id: "loi-estimate-hoa-certificate", label: "HOA certificate fees" },
  { key: "hoaTransfer", id: "loi-estimate-hoa-transfer", label: "HOA transfer fees" },
  { key: "personalProperty", id: "loi-estimate-personal-property", label: "Included personal property" },
] as const;

export type LoiItemizedCostKey = typeof LOI_ITEMIZED_COST_FIELDS[number]["key"];
export function loiItemizedCostPayer(terms: LoiTermsV1, key: LoiItemizedCostKey) {
  if (key === "transferTaxes" || key === "governmentRetrofit") {
    return terms.costsAndCredits.customaryClosingCosts ? "SELLER" : terms.costsAndCredits.closingCostPayers?.[key === "transferTaxes" ? "transferTaxes" : "governmentRetrofitItems"] ?? null;
  }
  if (key === "personalProperty") return terms.personalProperty.included ? terms.personalProperty.payer : "NOT_APPLICABLE";
  return terms.hoa[key === "hoaDocument" ? "documentFeePayer" : key === "hoaCertificate" ? "certificateFeePayer" : "transferFeePayer"];
}

export function normalizeLoiItemizedCostPayers(previous: LoiTermsV1, next: LoiTermsV1): LoiTermsV1 {
  const estimates = next.costsAndCredits.closingCostEstimates;
  if (!estimates?.itemizedCosts) return next;
  let itemizedCosts = estimates.itemizedCosts;
  for (const { key } of LOI_ITEMIZED_COST_FIELDS) {
    const before = loiItemizedCostPayer(previous, key);
    const after = loiItemizedCostPayer(next, key);
    const estimate = itemizedCosts[key];
    if (!estimate || before === after || !after || after === "NOT_APPLICABLE") continue;
    if (after === "EACH_OWN") {
      // A combined total does not establish either party's separate obligation.
      itemizedCosts = { ...itemizedCosts, [key]: { amountCents: null, buyerCents: before === "BUYER" ? estimate.amountCents ?? null : null, sellerCents: before === "SELLER" ? estimate.amountCents ?? null : null } };
    } else if (before === "EACH_OWN") {
      const amountCents = estimate.buyerCents == null || estimate.sellerCents == null ? null : estimate.buyerCents + estimate.sellerCents;
      itemizedCosts = { ...itemizedCosts, [key]: { amountCents } };
    }
  }
  return itemizedCosts === estimates.itemizedCosts ? next : { ...next, costsAndCredits: { ...next.costsAndCredits, closingCostEstimates: { ...estimates, itemizedCosts } } };
}

export const COMMON_LOI_PROPERTY_ITEMS = [
  "Video doorbell", "Surveillance cameras", "Stove", "Oven", "Washer", "Dryer",
  "Dishwasher", "Microwave", "Above-ground pool", "Above-ground spa", "Electric car charger",
  "Potted trees or shrubs", "Bathroom mirrors",
] as const;

export function parseLoiPropertyItems(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function formatLoiYears(months: number | null) {
  return months === null ? "" : String(Number((months / 12).toFixed(4)));
}

export function parseLoiYears(value: string): number | null {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value.trim())) return null;
  const years = Number(value);
  if (years <= 0 || years > 50) return null;
  const months = Math.round(years * 12);
  return months >= 1 && months <= 600 ? months : null;
}

// Shown wherever buyer or seller closing-cost totals appear.
export const LOI_CLOSING_COST_EXCLUSIONS = "Closing costs do not include property tax, homeowners insurance, or lender fees.";

// Plain-language transfer-tax line: what the amount is and who pays it.
export function loiTransferTaxDescription(terms: LoiTermsV1) {
  const payer = terms.costsAndCredits.customaryClosingCosts ? "SELLER" : terms.costsAndCredits.closingCostPayers?.transferTaxes ?? null;
  const who = payer === "SELLER" ? "seller pays" : payer === "BUYER" ? "buyer pays" : payer === "SPLIT_EQUALLY" ? "split equally" : payer === "NOT_APPLICABLE" ? "not applicable" : "payer not chosen";
  return terms.costsAndCredits.transferTaxSchedule === "LA_CITY_2026_2027"
    ? `County and city tax on the sale price, at City of Los Angeles rates · ${who}`
    : `County and city tax on the sale price, from an escrow quote · ${who}`;
}
