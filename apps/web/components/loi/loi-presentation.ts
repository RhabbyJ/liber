import type { LoiComputedSummary, LoiTermsV1 } from "@liber/validators";
import type { LoiRole } from "./loi-types";
import { LOI_ITEMIZED_COST_FIELDS, loiItemizedCostPayer } from "./loi-editor-values";

export const LOI_PRESENTATION_VERSION = 1;

type Label = string | Record<LoiRole, string>;
type TermFieldDefinition = {
  format?: (value: unknown) => string;
  get: (terms: LoiTermsV1) => unknown;
  id: string;
  inputId?: string;
  label: Label;
  material: boolean;
  metadata?: boolean;
  section: string;
  visible?: (terms: LoiTermsV1) => boolean;
};

type SummaryFieldDefinition = {
  format: (value: unknown) => string;
  get: (summary: LoiComputedSummary) => unknown;
  id: string;
  label: string;
  metadata?: boolean;
  visible?: (summary: LoiComputedSummary) => boolean;
};

export type LoiPresentationRow = {
  fieldId: string;
  formattedValue: string;
  label: string;
  material: boolean;
  rawValue: unknown;
};

export type LoiPresentationSection = {
  id: string;
  rows: LoiPresentationRow[];
  title: string;
};

export type LoiSemanticDiff = {
  fieldId: string;
  from: string;
  label: string;
  material: boolean;
  section: string;
  to: string;
};

export type LoiPropertyIdentity = {
  identityVersion: number | null;
  location: string;
  title: string;
};

const SECTION_IDS = new Map([
  ["Parties", "parties"],
  ["Purchase and funding", "purchase-funding"],
  ["Earnest-money deposit", "deposit"],
  ["Timing and contingencies", "timing"],
  ["Possession", "possession"],
  ["Buyer agent", "buyer-agent"],
  ["Providers, warranty, and costs", "providers-costs"],
  ["Closing-cost estimates", "closing-cost-estimates"],
  ["HOA and personal property", "hoa-personal-property"],
  ["Disclosures", "disclosures"],
  ["Additional terms", "additional-terms"],
]);

const ENUM_LABELS: Record<string, string> = {
  AT_CLOSING: "At closing",
  BUYER: "Buyer",
  CASH: "Cash",
  CONVENTIONAL: "Conventional",
  CUSTOM: "Custom company",
  DAILY: "Daily",
  DAYS_AFTER_CLOSING: "Days after closing",
  EACH_OWN: "Each pays their own",
  FHA: "FHA",
  FINANCED: "Financed",
  FIXED: "Fixed amount",
  LIBER_PREFERRED: "Liber-preferred option",
  MONTHLY: "Paid monthly",
  NO: "No",
  NOT_APPLICABLE: "Not applicable",
  OTHER: "Other",
  PERCENT: "Percentage",
  REHAB: "Rehab",
  SELLER: "Seller",
  SPLIT_EQUALLY: "Split equally",
  SELLER_FINANCING: "Seller financing",
  SELLER_RENT_BACK: "Seller rent-back",
  TENANT_REMAINS: "Tenant remains",
  THROUGH_ESCROW: "Paid through escrow",
  UNKNOWN: "Not specified",
  WEEKLY: "Weekly",
  YES: "Yes",
};

const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "Not specified";
const yesNo = (value: unknown) => value === true ? "Yes" : "No";
const enumValue = (value: unknown) => typeof value === "string" ? ENUM_LABELS[value] ?? value : "Not specified";
const days = (value: unknown) => typeof value === "number" ? `${value} ${value === 1 ? "day" : "days"}` : "Not included";
const months = (value: unknown) => typeof value === "number" ? `${value} ${value === 1 ? "month" : "months"}` : "Not included";
const list = (value: unknown) => Array.isArray(value) && value.length ? value.join(", ") : "None";

export function formatLoiMoney(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "currency",
      }).format(value / 100)
    : "Not specified";
}

export function formatLoiPercentage(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: "percent",
      }).format(value / 10_000)
    : "Not specified";
}

// Sellers meet the first submitted version as the buyer's offer; later versions keep their number.
export function loiRevisionHeading(revision: { sequence: number; terms: Pick<LoiTermsV1, "parties"> }, role: LoiRole) {
  return role === "SELLER" && revision.sequence === 1
    ? `Offer from ${revision.terms.parties.buyerLegalName.trim() || "buyer"}`
    : `Submitted version ${revision.sequence}`;
}

export function formatLoiDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "long",
        timeZone: "America/Los_Angeles",
        timeZoneName: "short",
        year: "numeric",
      }).format(date);
}

const TERM_FIELDS: readonly TermFieldDefinition[] = [
  { get: (value) => value.schemaVersion, id: "schemaVersion", label: "Schema version", material: false, metadata: true, section: "Metadata" },

  { get: (value) => value.parties.buyerLegalName, id: "parties.buyerLegalName", inputId: "loi-legal-name", label: { BUYER: "Your legal or entity name", SELLER: "Buyer legal or entity name" }, material: true, section: "Parties" },
  { get: (value) => value.parties.buyerContact.name, id: "parties.buyerContact.name", inputId: "loi-buyer-name", label: "Buyer contact name", material: true, section: "Parties" },
  { get: (value) => value.parties.buyerContact.company, id: "parties.buyerContact.company", inputId: "loi-buyer-company", label: "Buyer contact company", material: true, section: "Parties" },
  { get: (value) => value.parties.buyerContact.email, id: "parties.buyerContact.email", inputId: "loi-buyer-email", label: "Buyer contact email", material: true, section: "Parties" },
  { get: (value) => value.parties.buyerContact.phone, id: "parties.buyerContact.phone", inputId: "loi-buyer-phone", label: "Buyer contact phone", material: true, section: "Parties" },
  { get: (value) => value.parties.vestingNote, id: "parties.vestingNote", inputId: "loi-vesting", label: "Vesting or taking-title note", material: true, section: "Parties" },

  { format: formatLoiMoney, get: (value) => value.purchasePriceCents, id: "purchasePriceCents", inputId: "loi-price", label: "Offer price", material: true, section: "Purchase and funding" },
  { format: enumValue, get: (value) => value.funding.type, id: "funding.type", inputId: "loi-funding", label: "Funding", material: true, section: "Purchase and funding" },
  { format: formatLoiMoney, get: (value) => value.funding.type === "FINANCED" ? value.funding.downPaymentCents : null, id: "funding.downPaymentCents", inputId: "loi-down-payment", label: "Down payment", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { format: enumValue, get: (value) => value.funding.type === "FINANCED" ? value.funding.loanType : null, id: "funding.loanType", inputId: "loi-loan-type", label: "Loan type", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { get: (value) => value.funding.type === "FINANCED" ? value.funding.lender.name : null, id: "funding.lender.name", inputId: "loi-lender-name", label: "Lender contact name", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { get: (value) => value.funding.type === "FINANCED" ? value.funding.lender.company : null, id: "funding.lender.company", inputId: "loi-lender-company", label: "Lender company", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { get: (value) => value.funding.type === "FINANCED" ? value.funding.lender.email : null, id: "funding.lender.email", inputId: "loi-lender-email", label: "Lender email", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { get: (value) => value.funding.type === "FINANCED" ? value.funding.lender.phone : null, id: "funding.lender.phone", inputId: "loi-lender-phone", label: "Lender phone", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { get: (value) => value.funding.type === "FINANCED" ? value.funding.note : null, id: "funding.financingNote", inputId: "loi-loan-note", label: "Financing note", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "FINANCED" },
  { format: formatLoiMoney, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.cashDownPaymentCents : null, id: "funding.cashDownPaymentCents", inputId: "loi-sf-down", label: "Cash down payment", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: formatLoiMoney, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.principalCents : null, id: "funding.principalCents", inputId: "loi-sf-principal", label: "Seller-financed principal", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: formatLoiPercentage, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.annualInterestBps : null, id: "funding.annualInterestBps", inputId: "loi-sf-rate", label: "Annual interest rate", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: months, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.termMonths : null, id: "funding.termMonths", inputId: "loi-sf-term", label: "Seller-financing term", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: months, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.amortizationMonths : null, id: "funding.amortizationMonths", inputId: "loi-sf-amortization", label: "Amortization period", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: months, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.balloonMonth : null, id: "funding.balloonMonth", inputId: "loi-sf-balloon", label: "Balloon payment month", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { format: yesNo, get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.interestOnly : null, id: "funding.interestOnly", inputId: "loi-sf-interest-only", label: "Interest-only treatment", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },
  { get: (value) => value.funding.type === "SELLER_FINANCING" ? value.funding.note : null, id: "funding.sellerFinancingNote", inputId: "loi-sf-note", label: "Seller-financing note", material: true, section: "Purchase and funding", visible: (value) => value.funding.type === "SELLER_FINANCING" },

  { format: (value) => value === "LA_CITY_2026_2027" ? "City of Los Angeles — July 2026–June 2027 rates" : "Entered transfer-tax quote", get: (value) => value.costsAndCredits.transferTaxSchedule ?? "MANUAL", id: "costsAndCredits.transferTaxSchedule", inputId: "loi-transfer-tax-schedule", label: "Transfer-tax estimate source", material: true, section: "Closing costs and credits" },
  { format: enumValue, get: (value) => value.deposit.basis, id: "deposit.basis", label: "Earnest-money basis", material: true, section: "Earnest-money deposit" },
  { format: formatLoiPercentage, get: (value) => value.deposit.basis === "PERCENT" ? value.deposit.percentageBps : null, id: "deposit.percentageBps", inputId: "loi-deposit-percent", label: "Earnest-money percentage", material: true, section: "Earnest-money deposit", visible: (value) => value.deposit.basis === "PERCENT" },
  { format: formatLoiMoney, get: (value) => value.deposit.basis === "FIXED" ? value.deposit.amountCents : null, id: "deposit.amountCents", label: "Earnest-money amount", material: true, section: "Earnest-money deposit", visible: (value) => value.deposit.basis === "FIXED" },

  { format: days, get: (value) => value.timing.closingDays, id: "timing.closingDays", inputId: "loi-closing", label: "Escrow / closing days", material: true, section: "Timing and contingencies" },
  { format: days, get: (value) => value.timing.inspectionContingencyDays, id: "timing.inspectionContingencyDays", inputId: "loi-inspection", label: "Physical inspection days", material: true, section: "Timing and contingencies" },
  { format: days, get: (value) => value.timing.sellerDisclosureReviewDays, id: "timing.sellerDisclosureReviewDays", inputId: "loi-disclosure", label: "Disclosure review days", material: true, section: "Timing and contingencies" },
  { format: days, get: (value) => value.timing.titleReviewDays, id: "timing.titleReviewDays", inputId: "loi-title-review", label: "Title review days", material: true, section: "Timing and contingencies" },
  { format: days, get: (value) => value.timing.appraisalContingencyDays, id: "timing.appraisalContingencyDays", inputId: "loi-appraisal", label: "Appraisal contingency", material: true, section: "Timing and contingencies" },
  { format: days, get: (value) => value.timing.loanContingencyDays, id: "timing.loanContingencyDays", inputId: "loi-loan-contingency", label: "Loan contingency", material: true, section: "Timing and contingencies" },

  { format: enumValue, get: (value) => value.possession.type, id: "possession.type", inputId: "loi-possession", label: "Possession", material: true, section: "Possession" },
  { format: days, get: (value) => value.possession.type === "DAYS_AFTER_CLOSING" ? value.possession.daysAfterClosing : null, id: "possession.daysAfterClosing", inputId: "loi-possession-days", label: "Possession after closing", material: true, section: "Possession", visible: (value) => value.possession.type === "DAYS_AFTER_CLOSING" },
  { format: days, get: (value) => value.possession.type === "SELLER_RENT_BACK" ? value.possession.days : null, id: "possession.days", inputId: "loi-rentback-days", label: "Rent-back duration", material: true, section: "Possession", visible: (value) => value.possession.type === "SELLER_RENT_BACK" },
  { format: formatLoiMoney, get: (value) => value.possession.type === "SELLER_RENT_BACK" ? value.possession.amountCents : null, id: "possession.amountCents", inputId: "loi-rentback-amount", label: "Rent-back amount", material: true, section: "Possession", visible: (value) => value.possession.type === "SELLER_RENT_BACK" },
  { format: enumValue, get: (value) => value.possession.type === "SELLER_RENT_BACK" ? value.possession.frequency : null, id: "possession.frequency", inputId: "loi-rentback-frequency", label: "Rent-back payment frequency", material: true, section: "Possession", visible: (value) => value.possession.type === "SELLER_RENT_BACK" },
  { format: yesNo, get: (value) => value.possession.type === "TENANT_REMAINS" ? value.possession.estoppelRequired : null, id: "possession.estoppelRequired", inputId: "loi-estoppel", label: "Estoppel certificate required", material: true, section: "Possession", visible: (value) => value.possession.type === "TENANT_REMAINS" },
  { get: (value) => value.possession.type === "TENANT_REMAINS" ? value.possession.note : null, id: "possession.tenantNote", inputId: "loi-tenant-note", label: "Tenant possession details", material: true, section: "Possession", visible: (value) => value.possession.type === "TENANT_REMAINS" },
  { get: (value) => value.possession.type === "OTHER" ? value.possession.note : null, id: "possession.otherNote", inputId: "loi-possession-note", label: "Other possession terms", material: true, section: "Possession", visible: (value) => value.possession.type === "OTHER" },
  { format: yesNo, get: (value) => value.representation.buyerRepresented, id: "representation.buyerRepresented", inputId: "loi-buyer-represented", label: "Buyer using an agent", material: true, section: "Buyer agent" },
  { get: (value) => value.representation.agent.name, id: "representation.agent.name", inputId: "loi-agent-name", label: "Agent name", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { get: (value) => value.representation.agent.license, id: "representation.agent.license", inputId: "loi-agent-license", label: "Agent license #", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { get: (value) => value.representation.agent.company, id: "representation.agent.company", inputId: "loi-agent-company", label: "Agent company", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { get: (value) => value.representation.agent.email, id: "representation.agent.email", inputId: "loi-agent-email", label: "Agent email", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { get: (value) => value.representation.agent.phone, id: "representation.agent.phone", inputId: "loi-agent-phone", label: "Agent phone", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { get: (value) => value.representation.commissionAmount, id: "representation.commissionAmount", inputId: "loi-agent-commission", label: "Agent commission", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },
  { format: enumValue, get: (value) => value.representation.commissionPayer, id: "representation.commissionPayer", inputId: "loi-agent-commission-payer", label: "Who pays agent commission", material: true, section: "Buyer agent", visible: (value) => value.representation.buyerRepresented },

  { format: enumValue, get: (value) => value.providers.escrow.choice, id: "providers.escrow.choice", inputId: "proposed-escrow-provider-choice", label: "Proposed escrow provider", material: true, section: "Providers, warranty, and costs" },
  { format: enumValue, get: (value) => value.providers.escrow.feePayer, id: "providers.escrow.feePayer", inputId: "loi-escrow-fee-payer", label: "Who pays escrow", material: true, section: "Providers, warranty, and costs" },
  { get: (value) => value.providers.escrow.choice === "CUSTOM" ? value.providers.escrow.company.name : null, id: "providers.escrow.company.name", inputId: "proposed-escrow-provider-choice-name", label: "Escrow contact name", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.escrow.choice === "CUSTOM" },
  { get: (value) => value.providers.escrow.choice === "CUSTOM" ? value.providers.escrow.company.company : null, id: "providers.escrow.company.company", inputId: "proposed-escrow-provider-choice-company", label: "Escrow company", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.escrow.choice === "CUSTOM" },
  { get: (value) => value.providers.escrow.choice === "CUSTOM" ? value.providers.escrow.company.email : null, id: "providers.escrow.company.email", inputId: "proposed-escrow-provider-choice-email", label: "Escrow email", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.escrow.choice === "CUSTOM" },
  { get: (value) => value.providers.escrow.choice === "CUSTOM" ? value.providers.escrow.company.phone : null, id: "providers.escrow.company.phone", inputId: "proposed-escrow-provider-choice-phone", label: "Escrow phone", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.escrow.choice === "CUSTOM" },
  { format: enumValue, get: (value) => value.providers.title.choice, id: "providers.title.choice", inputId: "proposed-title-provider-choice", label: "Proposed title provider", material: true, section: "Providers, warranty, and costs" },
  { format: enumValue, get: (value) => value.providers.title.feePayer, id: "providers.title.feePayer", inputId: "loi-title-fee-payer", label: "Who pays title insurance", material: true, section: "Providers, warranty, and costs", visible: (value) => Boolean(value.providers.title.feePayer) },
  { get: (value) => value.providers.title.choice === "CUSTOM" ? value.providers.title.company.name : null, id: "providers.title.company.name", inputId: "proposed-title-provider-choice-name", label: "Title contact name", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.title.choice === "CUSTOM" },
  { get: (value) => value.providers.title.choice === "CUSTOM" ? value.providers.title.company.company : null, id: "providers.title.company.company", inputId: "proposed-title-provider-choice-company", label: "Title company", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.title.choice === "CUSTOM" },
  { get: (value) => value.providers.title.choice === "CUSTOM" ? value.providers.title.company.email : null, id: "providers.title.company.email", inputId: "proposed-title-provider-choice-email", label: "Title email", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.title.choice === "CUSTOM" },
  { get: (value) => value.providers.title.choice === "CUSTOM" ? value.providers.title.company.phone : null, id: "providers.title.company.phone", inputId: "proposed-title-provider-choice-phone", label: "Title phone", material: true, section: "Providers, warranty, and costs", visible: (value) => value.providers.title.choice === "CUSTOM" },
  { format: yesNo, get: (value) => value.costsAndCredits.sellerCreditIncluded, id: "costsAndCredits.sellerCreditIncluded", inputId: "loi-credit-included", label: "Seller credit proposed", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.sellerCreditIncluded !== undefined },
  { format: enumValue, get: (value) => value.costsAndCredits.closingCostPayers?.transferTaxes, id: "costsAndCredits.closingCostPayers.transferTaxes", inputId: "loi-transfer-tax-payer", label: "Who pays city and county transfer taxes", material: true, section: "Providers, warranty, and costs", visible: (value) => Boolean(value.costsAndCredits.closingCostPayers) },
  { format: enumValue, get: (value) => value.costsAndCredits.closingCostPayers?.governmentRetrofitItems, id: "costsAndCredits.closingCostPayers.governmentRetrofitItems", inputId: "loi-retrofit-payer", label: "Who pays government retrofit items, smoke detectors, and CO detectors", material: true, section: "Providers, warranty, and costs", visible: (value) => Boolean(value.costsAndCredits.closingCostPayers) },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.sellerCreditCents, id: "costsAndCredits.sellerCreditCents", inputId: "loi-credit", label: "Seller credit", material: true, section: "Providers, warranty, and costs" },
  { get: (value) => value.costsAndCredits.sellerCreditNote, id: "costsAndCredits.sellerCreditNote", inputId: "loi-credit-note", label: "Seller credit note", material: true, section: "Providers, warranty, and costs" },
  { format: yesNo, get: (value) => value.costsAndCredits.customaryClosingCosts, id: "costsAndCredits.customaryClosingCosts", inputId: "loi-customary-costs", label: "Customary closing-cost allocation", material: true, section: "Providers, warranty, and costs" },
  { get: (value) => value.costsAndCredits.alternateClosingCostAllocation, id: "costsAndCredits.alternateClosingCostAllocation", inputId: "loi-alternate-costs", label: "Alternate closing-cost allocation", material: true, section: "Providers, warranty, and costs", visible: (value) => !value.costsAndCredits.customaryClosingCosts },
  { format: yesNo, get: (value) => value.costsAndCredits.homeWarranty.included, id: "costsAndCredits.homeWarranty.included", inputId: "loi-warranty-included", label: "Home warranty proposed", material: true, section: "Providers, warranty, and costs" },
  { get: (value) => value.costsAndCredits.homeWarranty.company, id: "costsAndCredits.homeWarranty.company", inputId: "loi-warranty-company", label: "Warranty company", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.homeWarranty.maximumCents, id: "costsAndCredits.homeWarranty.maximumCents", inputId: "loi-warranty-max", label: "Warranty maximum", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included },
  { format: enumValue, get: (value) => value.costsAndCredits.homeWarranty.payer, id: "costsAndCredits.homeWarranty.payer", inputId: "loi-warranty-payer", label: "Warranty payer", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included },
  ...(["buyer", "seller"] as const).map((party): TermFieldDefinition => ({ format: formatLoiMoney, get: (value) => value.costsAndCredits.homeWarranty[`${party}ShareCents`], id: `costsAndCredits.homeWarranty.${party}ShareCents`, inputId: `loi-warranty-${party}-share`, label: `${party === "buyer" ? "Buyer" : "Seller"} warranty share`, material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included && (value.costsAndCredits.homeWarranty.payer === "EACH_OWN" || value.costsAndCredits.homeWarranty.payer === "OTHER") })),
  { get: (value) => value.costsAndCredits.homeWarranty.specialInclusions, id: "costsAndCredits.homeWarranty.specialInclusions", inputId: "loi-warranty-inclusions", label: "Warranty special inclusions", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included },
  { get: (value) => value.costsAndCredits.homeWarranty.payerNote, id: "costsAndCredits.homeWarranty.payerNote", inputId: "loi-warranty-payer-note", label: "Warranty cost-allocation note", material: true, section: "Providers, warranty, and costs", visible: (value) => value.costsAndCredits.homeWarranty.included && value.costsAndCredits.homeWarranty.payer === "OTHER" },

  { format: enumValue, get: (value) => value.hoa.documentFeePayer, id: "hoa.documentFeePayer", inputId: "hoa-document-fee-payer", label: "HOA document fee", material: true, section: "HOA and personal property" },
  { format: enumValue, get: (value) => value.hoa.certificateFeePayer, id: "hoa.certificateFeePayer", inputId: "hoa-certificate-fee-payer", label: "HOA certificate fee", material: true, section: "HOA and personal property" },
  { format: enumValue, get: (value) => value.hoa.transferFeePayer, id: "hoa.transferFeePayer", inputId: "hoa-transfer-fee-payer", label: "HOA transfer fee", material: true, section: "HOA and personal property" },
  { format: yesNo, get: (value) => value.personalProperty.included, id: "personalProperty.included", inputId: "loi-personal-property", label: "Personal property included", material: true, section: "HOA and personal property" },
  { format: list, get: (value) => value.personalProperty.includedItems, id: "personalProperty.includedItems", inputId: "loi-items", label: "Requested personal-property items", material: true, section: "HOA and personal property", visible: (value) => value.personalProperty.included },
  { format: enumValue, get: (value) => value.personalProperty.payer, id: "personalProperty.payer", inputId: "loi-personal-property-payer", label: "Who pays for included items", material: true, section: "HOA and personal property", visible: (value) => value.personalProperty.included },
  { get: (value) => value.personalProperty.excludedItems, id: "personalProperty.excludedItems", inputId: "loi-excluded-items", label: "Excluded personal-property items", material: true, section: "HOA and personal property" },

  { format: enumValue, get: (value) => value.disclosures.deathOnProperty, id: "disclosures.deathOnProperty", inputId: "loi-disclosure-death", label: "Death on the property", material: true, section: "Disclosures" },
  { format: (value) => value === "SELLER" ? "Seller" : "Source not recorded", get: (value) => value.disclosures.deathOnPropertyProvidedBy, id: "disclosures.deathOnPropertyProvidedBy", label: "Death disclosure provided by", material: true, section: "Disclosures", visible: (value) => value.disclosures.deathOnProperty !== "UNKNOWN" || value.disclosures.deathOnPropertyProvidedBy === "SELLER" },
  { get: (value) => value.disclosures.condition, id: "disclosures.condition", inputId: "loi-disclosure-condition", label: "Property condition", material: true, section: "Disclosures" },
  { get: (value) => value.disclosures.conditionsOfSale, id: "disclosures.conditionsOfSale", inputId: "loi-disclosure-sale", label: "Conditions of sale", material: true, section: "Disclosures" },

  { get: (value) => value.additionalTerms.proposedTerms, id: "additionalTerms.proposedTerms", inputId: "loi-additional", label: "Additional proposed terms", material: true, section: "Additional terms" },
  { get: (value) => value.additionalTerms.exclusions, id: "additionalTerms.exclusions", inputId: "loi-exclusions", label: "Explicit exclusions", material: true, section: "Additional terms" },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.buyerEscrowCents, id: "costsAndCredits.closingCostEstimates.buyerEscrowCents", inputId: "loi-estimate-buyer-escrow", label: "Estimated buyer escrow fees", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) && value.providers.escrow.feePayer !== "SELLER" },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.sellerEscrowCents, id: "costsAndCredits.closingCostEstimates.sellerEscrowCents", inputId: "loi-estimate-seller-escrow", label: "Estimated seller escrow fees", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) && value.providers.escrow.feePayer !== "BUYER" },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.buyerTitleInsuranceCents, id: "costsAndCredits.closingCostEstimates.buyerTitleInsuranceCents", inputId: "loi-estimate-buyer-title", label: "Estimated buyer title insurance", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.sellerTitleInsuranceCents, id: "costsAndCredits.closingCostEstimates.sellerTitleInsuranceCents", inputId: "loi-estimate-seller-title", label: "Estimated seller title insurance", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.buyerOtherClosingCostsCents, id: "costsAndCredits.closingCostEstimates.buyerOtherClosingCostsCents", inputId: "loi-estimate-buyer-other", label: "Estimated other buyer closing costs", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  { format: formatLoiMoney, get: (value) => value.costsAndCredits.closingCostEstimates?.sellerOtherClosingCostsCents, id: "costsAndCredits.closingCostEstimates.sellerOtherClosingCostsCents", inputId: "loi-estimate-seller-other", label: "Estimated other seller closing costs", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  { get: (value) => value.costsAndCredits.closingCostEstimates?.sellerAgentCommissionAmount, id: "costsAndCredits.closingCostEstimates.sellerAgentCommissionAmount", inputId: "loi-estimate-seller-commission", label: "Seller agent commission estimate", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  { get: (value) => value.costsAndCredits.closingCostEstimates?.note, id: "costsAndCredits.closingCostEstimates.note", inputId: "loi-estimate-note", label: "Estimate source and included fees", material: true, section: "Closing-cost estimates", visible: (value) => Boolean(value.costsAndCredits.closingCostEstimates) },
  ...LOI_ITEMIZED_COST_FIELDS.flatMap((field): TermFieldDefinition[] => (["amountCents", "buyerCents", "sellerCents"] as const).map((part) => ({
    format: formatLoiMoney,
    get: (value) => value.costsAndCredits.closingCostEstimates?.itemizedCosts?.[field.key]?.[part],
    id: `costsAndCredits.closingCostEstimates.itemizedCosts.${field.key}.${part}`,
    inputId: part === "amountCents" ? field.id : `${field.id}-${part === "buyerCents" ? "buyer" : "seller"}`,
    label: `${part === "amountCents" ? "" : part === "buyerCents" ? "Buyer " : "Seller "}${field.label} estimate`, material: true, section: "Closing-cost estimates",
    visible: (value) => {
      const payer = loiItemizedCostPayer(value, field.key);
      if (field.key === "transferTaxes" && value.costsAndCredits.transferTaxSchedule === "LA_CITY_2026_2027") return false;
      return Boolean(value.costsAndCredits.closingCostEstimates?.itemizedCosts?.[field.key]) && Boolean(payer) && payer !== "NOT_APPLICABLE" && (part === "amountCents" ? payer !== "EACH_OWN" : payer === "EACH_OWN");
    },
  }))),
  { format: yesNo, get: (value) => value.costsAndCredits.closingCostEstimates?.otherCostsExcludeItemized, id: "costsAndCredits.closingCostEstimates.otherCostsExcludeItemized", inputId: "loi-estimate-other-excludes-itemized", label: "Other closing costs exclude separately calculated expenses", material: true, section: "Closing-cost estimates", visible: (value) => value.costsAndCredits.closingCostEstimates?.otherCostsExcludeItemized !== undefined },
];

const SUMMARY_FIELDS: readonly SummaryFieldDefinition[] = [
  { format: String, get: (value) => value.calculationVersion, id: "calculationVersion", label: "Calculation version", metadata: true },
  { format: formatLoiMoney, get: (value) => value.earnestMoneyCents, id: "earnestMoneyCents", label: "Earnest money" },
  { format: formatLoiPercentage, get: (value) => value.earnestMoneyBps, id: "earnestMoneyBps", label: "Earnest-money percentage" },
  { format: formatLoiMoney, get: (value) => value.loanAmountCents, id: "loanAmountCents", label: "Loan amount" },
  { format: formatLoiPercentage, get: (value) => value.loanToValueBps, id: "loanToValueBps", label: "Loan-to-value ratio" },
  { format: formatLoiMoney, get: (value) => value.remainingDownPaymentAfterDepositCents, id: "remainingDownPaymentAfterDepositCents", label: "Down payment remaining after deposit" },
  { format: formatLoiMoney, get: (value) => value.effectivePriceAfterSellerCreditCents, id: "effectivePriceAfterSellerCreditCents", label: "Effective price after seller credit" },
  ...([
    ["buyerAgentCommissionCents", "Calculated buyer agent commission"],
    ["sellerAgentCommissionCents", "Estimated seller agent commission"],
    ["buyerClosingCostsCents", "Buyer closing costs (provided estimates)"],
    ["sellerClosingCostsCents", "Seller closing costs (provided estimates)"],
    ["buyerCashDueAtClosingCents", "Expected cash to close (provided estimates)"],
    ["sellerCashBeforePayoffsCents", "Seller cash before mortgage payoffs (provided estimates)"],
  ] as const).map(([id, label]) => ({ format: formatLoiMoney, get: (value: LoiComputedSummary) => value.calculationVersion !== 1 ? value[id] : undefined, id, label, visible: (value: LoiComputedSummary) => value.calculationVersion !== 1 })),
  ...([
    ["buyerHomeWarrantyCents", "Buyer warranty estimate (included in closing costs)"], ["sellerHomeWarrantyCents", "Seller warranty estimate (included in closing costs)"],
    ["buyerItemizedCostsCents", "Buyer itemized expenses (included in closing costs)"], ["sellerItemizedCostsCents", "Seller itemized expenses (included in closing costs)"],
    ["rentBackAtClosingCents", "Seller rent-back paid to buyer at closing"], ["monthlyRentBackCents", "Monthly rent-back payment (separate from closing cash)"],
  ] as const).map(([id, label]) => ({ format: formatLoiMoney, get: (value: LoiComputedSummary) => (value.calculationVersion === 3 || value.calculationVersion === 4 || value.calculationVersion === 5) ? value[id] : undefined, id, label, visible: (value: LoiComputedSummary) => (value.calculationVersion === 3 || value.calculationVersion === 4 || value.calculationVersion === 5) })),
  ...([ ["buyerEscrowCents", "Buyer escrow fees (included in closing costs)"], ["sellerEscrowCents", "Seller escrow fees (included in closing costs)"] ] as const).map(([id, label]) => ({ format: formatLoiMoney, get: (value: LoiComputedSummary) => (value.calculationVersion === 4 || value.calculationVersion === 5) ? value[id] : undefined, id, label, visible: (value: LoiComputedSummary) => value.calculationVersion === 4 || value.calculationVersion === 5 })),
  { format: (value) => value === true ? "All estimate fields provided; actual charges may differ" : "Incomplete — missing fees are excluded from the subtotals", get: (value) => value.calculationVersion !== 1 ? value.closingCostEstimateComplete : undefined, id: "closingCostEstimateComplete", label: "Estimate completeness", visible: (value) => value.calculationVersion !== 1 },
  { format: String, get: () => "Buyer cash subtracts deposit and seller credit; seller cash subtracts seller costs, credit, and any seller-financed principal. Negative buyer cash is a modeled credit balance, subject to lender and escrow approval. Other costs include manually entered loan, tax, HOA, warranty, and recording fees; mortgage payoffs and prorations are excluded. This is not a lender Loan Estimate or Closing Disclosure.", id: "closingCostEstimateBasis", label: "Estimate assumptions", visible: (value) => value.calculationVersion === 2 },
  { format: String, get: () => "Provided warranty and itemized expenses are included once for the selected payer. Through-escrow rent-back reduces seller cash and credits buyer cash at closing; monthly rent-back is shown separately. Other closing costs include only additional expenses. Blank estimates remain unknown; no equal split is assumed for Each pays own. Mortgage payoffs and prorations are excluded.", id: "closingCostEstimateBasisV3", label: "Estimate assumptions", visible: (value) => value.calculationVersion === 3 },
  { format: String, get: () => "Escrow defaults to $300 + $1.75 per $1,000 of offer price for each side, rounded to cents per side. A single escrow payer covers both fees. Entered fee quotes override the schedule; zero means no charge. Other blank fees remain unknown. Mortgage payoffs and prorations are excluded.", id: "closingCostEstimateBasisV4", label: "Estimate assumptions", visible: (value) => value.calculationVersion === 4 },
  ...([ ["laCountyTransferTaxCents", "LA County transfer tax"], ["laCityTransferTaxCents", "LA City base transfer tax"], ["measureUlaCents", "Measure ULA — seller" ] ] as const).map(([id, label]) => ({format: formatLoiMoney, get: (value: LoiComputedSummary) => value.calculationVersion === 5 ? value[id] : undefined, id, label, visible: (value: LoiComputedSummary) => value.calculationVersion === 5 && value.transferTaxSchedule === "LA_CITY_2026_2027"})),
  {format: String, get: () => "Escrow uses $300 + $1.75 per $1,000 per side unless quoted. LA City tax mode assumes a taxable full-price transfer inside city limits: county $0.55 and city $2.25 per $500, rounded up; seller ULA is 4% above $5.4M and below $10.9M, or 5.5% at/above $10.9M, on the entire price. Rates apply July 2026–June 2027. Quoted mode uses the entered combined transfer taxes. Mortgage payoffs and prorations are excluded. Exemption determinations are excluded.", id: "closingCostEstimateBasisV5", label: "Estimate assumptions", visible: (value) => value.calculationVersion === 5},
];

function displayLabel(label: Label, role: LoiRole) {
  return typeof label === "string" ? label : label[role];
}

function displayTermValue(definition: TermFieldDefinition, value: unknown) {
  return definition.format ? definition.format(value) : text(value);
}

export function loiTermSections(terms: LoiTermsV1, role: LoiRole): LoiPresentationSection[] {
  const sections = new Map<string, LoiPresentationRow[]>();
  for (const definition of TERM_FIELDS) {
    if (definition.metadata || definition.visible?.(terms) === false) continue;
    const rawValue = definition.get(terms);
    const rows = sections.get(definition.section) ?? [];
    rows.push({
      fieldId: definition.id,
      formattedValue: displayTermValue(definition, rawValue),
      label: displayLabel(definition.label, role),
      material: definition.material,
      rawValue,
    });
    sections.set(definition.section, rows);
  }
  return [...sections].map(([title, rows]) => ({ id: SECTION_IDS.get(title) ?? title.toLowerCase().replaceAll(" ", "-"), rows, title }));
}

export function loiSummaryRows(summary: LoiComputedSummary): LoiPresentationRow[] {
  return SUMMARY_FIELDS.filter((definition) => !definition.metadata && definition.visible?.(summary) !== false).map((definition) => {
    const rawValue = definition.get(summary);
    return {
      fieldId: definition.id,
      formattedValue: definition.format(rawValue),
      label: definition.label,
      material: false,
      rawValue,
    };
  });
}

export function loiPresentationInputIds(terms: LoiTermsV1) {
  return TERM_FIELDS.filter((definition) => definition.inputId && definition.visible?.(terms) !== false)
    .map((definition) => ({ fieldId: definition.id, inputId: definition.inputId! }));
}

export function semanticTermDiffs(previous: LoiTermsV1, current: LoiTermsV1, role: LoiRole): LoiSemanticDiff[] {
  return TERM_FIELDS.flatMap((definition) => {
    if (definition.metadata) return [];
    const previousVisible = definition.visible?.(previous) !== false;
    const currentVisible = definition.visible?.(current) !== false;
    if (!previousVisible && !currentVisible) return [];
    const previousRaw = previousVisible ? definition.get(previous) : undefined;
    const currentRaw = currentVisible ? definition.get(current) : undefined;
    if (previousVisible === currentVisible && JSON.stringify(previousRaw) === JSON.stringify(currentRaw)) return [];
    return [{
      fieldId: definition.id,
      from: previousVisible ? displayTermValue(definition, previousRaw) : "Not applicable",
      label: displayLabel(definition.label, role),
      material: definition.material,
      section: definition.section,
      to: currentVisible ? displayTermValue(definition, currentRaw) : "Not applicable",
    }];
  });
}

export function recalculatedDiffs(previous: LoiComputedSummary, current: LoiComputedSummary): LoiSemanticDiff[] {
  return SUMMARY_FIELDS.flatMap((definition) => {
    if (definition.metadata || (definition.visible?.(previous) === false && definition.visible?.(current) === false)) return [];
    const previousRaw = definition.get(previous);
    const currentRaw = definition.get(current);
    if (JSON.stringify(previousRaw) === JSON.stringify(currentRaw)) return [];
    return [{
      fieldId: definition.id,
      from: definition.visible?.(previous) === false ? "Not calculated in this version" : definition.format(previousRaw),
      label: definition.label,
      material: false,
      section: "Recalculated values",
      to: definition.visible?.(current) === false ? "Not calculated in this version" : definition.format(currentRaw),
    }];
  });
}

export function normalizePropertyIdentity(value: unknown): LoiPropertyIdentity {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const title = source.contextUnavailable === true
    ? "Property context unavailable"
    : typeof source.addressLine1 === "string" && source.addressLine1.trim()
      ? source.addressLine1.trim()
      : typeof source.title === "string" && source.title.trim() ? source.title.trim() : "Seller's property";
  const identityVersion = typeof source.propertyIdentityVersion === "number"
    ? source.propertyIdentityVersion
    : typeof source.identityVersion === "number" ? source.identityVersion : null;
  return {
    identityVersion,
    location: typeof source.location === "string" ? source.location.trim() : "",
    title,
  };
}

const ERROR_PATH_TARGETS: Record<string, string> = {
  "funding.lender": "funding.lender.name",
  "providers.escrow": "providers.escrow.company.name",
  "providers.title": "providers.title.company.name",
};

function cleanErrorPath(path: string) {
  return path.replace(/^terms\./, "").replace(/\.\d+(?=\.|$)/g, "");
}

function definitionForErrorPath(path: string, terms?: LoiTermsV1) {
  let candidate = cleanErrorPath(path);
  if (candidate.startsWith("costsAndCredits.sellerCredit") && terms && !(terms.costsAndCredits.sellerCreditIncluded ?? (terms.costsAndCredits.sellerCreditCents > 0 || Boolean(terms.costsAndCredits.sellerCreditNote)))) candidate = "costsAndCredits.sellerCreditIncluded";
  if (candidate === "timing.appraisalContingencyDays" && terms?.timing.appraisalContingencyDays === null) {
    return { get: () => null, id: candidate, inputId: "loi-appraisal-included", label: "Appraisal contingency", material: true, section: "Timing and contingencies" } satisfies TermFieldDefinition;
  }
  if (candidate === "costsAndCredits.homeWarranty") {
    const target = !terms?.costsAndCredits.homeWarranty.included
      ? "costsAndCredits.homeWarranty.included"
      : !terms.costsAndCredits.homeWarranty.company
        ? "costsAndCredits.homeWarranty.company"
        : terms.costsAndCredits.homeWarranty.maximumCents === 0
          ? "costsAndCredits.homeWarranty.maximumCents"
          : terms.costsAndCredits.homeWarranty.payer === "OTHER" && !terms.costsAndCredits.homeWarranty.payerNote
            ? "costsAndCredits.homeWarranty.payerNote"
            : "costsAndCredits.homeWarranty.included";
    return TERM_FIELDS.find((item) => item.id === target && item.inputId) ?? null;
  }
  if (candidate === "representation.agent") {
    const target = !terms?.representation.buyerRepresented
      ? "representation.buyerRepresented"
      : !terms.representation.agent.name
        ? "representation.agent.name"
        : !terms.representation.agent.email && !terms.representation.agent.phone
          ? "representation.agent.email"
          : "representation.buyerRepresented";
    return TERM_FIELDS.find((item) => item.id === target && item.inputId) ?? null;
  }
  if (candidate === "personalProperty.includedItems" && !terms?.personalProperty.included) {
    return TERM_FIELDS.find((item) => item.id === "personalProperty.included" && item.inputId) ?? null;
  }
  if (candidate === "funding.note") {
    const sellerFinancing = terms?.funding.type === "SELLER_FINANCING";
    return {
      get: () => null,
      id: "funding.note",
      inputId: sellerFinancing ? "loi-sf-note" : "loi-loan-note",
      label: "Financing note",
      material: true,
      section: "Purchase and funding",
    } satisfies TermFieldDefinition;
  }
  if (candidate === "possession.note") {
    const otherPossession = terms?.possession.type === "OTHER";
    return {
      get: () => null,
      id: "possession.note",
      inputId: otherPossession ? "loi-possession-note" : "loi-tenant-note",
      label: "Possession details",
      material: true,
      section: "Possession",
    } satisfies TermFieldDefinition;
  }
  while (candidate) {
    const target = ERROR_PATH_TARGETS[candidate] ?? candidate;
    const definition = TERM_FIELDS.find((item) => item.id === target && item.inputId);
    if (definition) return definition;
    const separator = candidate.lastIndexOf(".");
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
  return null;
}

export function normalizeLoiFieldErrors(value: unknown, terms?: LoiTermsV1): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, string> = {};
  for (const [rawPath, rawMessage] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rawMessage !== "string") continue;
    const definition = definitionForErrorPath(rawPath, terms);
    if (!definition) continue;
    const message = rawMessage.trim().slice(0, 240);
    if (message && !normalized[definition.id]) normalized[definition.id] = message;
  }
  return normalized;
}

export function loiInputIdForErrorPath(path: string, terms?: LoiTermsV1) {
  return definitionForErrorPath(path, terms)?.inputId ?? null;
}

export function loiInputIdForNormalizedErrors(errors: Record<string, string>, terms?: LoiTermsV1) {
  if (errors["funding.note"]) return terms?.funding.type === "SELLER_FINANCING" ? "loi-sf-note" : "loi-loan-note";
  if (errors["possession.note"]) return terms?.possession.type === "OTHER" ? "loi-possession-note" : "loi-tenant-note";
  for (const definition of TERM_FIELDS) {
    if (definition.inputId && errors[definition.id]) return definitionForErrorPath(definition.id, terms)?.inputId ?? definition.inputId;
  }
  return null;
}
