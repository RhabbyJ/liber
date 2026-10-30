import { z } from "zod";

export const LOI_SCHEMA_VERSION = 1;
export const LOI_CALCULATION_VERSION = 6;
export const LOI_MAX_PRICE_CENTS = 10_000_000_000;
export const LOI_STANDARD_DEPOSIT_BPS = 300;
// Calculation v6 estimates used when the title or buyer misc closing-cost field is left blank.
export const LOI_TITLE_POLICY_RATE_BPS = 25;
export const LOI_MISC_CLOSING_COST_RATE_BPS = 20;
export const LOI_MAX_ESCROW_DAYS = 90;
export const LOI_RESPONSE_WINDOW_HOURS = 48;

const boundedText = (max: number) => z.string().trim().max(max).transform((value) => value.normalize("NFC"));
const requiredText = (max: number) => z.string().trim().min(1).max(max).transform((value) => value.normalize("NFC"));
const optionalText = (max: number) => boundedText(max).optional().default("");
const cents = z.number().int().min(0).max(LOI_MAX_PRICE_CENTS);
const bps = z.number().int().min(0).max(10_000);
const days = z.number().int().min(0).max(365);
const positiveDays = days.min(1);
const contact = z.object({
  company: optionalText(160),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
  name: optionalText(160),
  phone: optionalText(40),
}).strict();
const agentContact = contact.extend({
  license: optionalText(40),
}).strict();

const cashFunding = z.object({ type: z.literal("CASH") }).strict();
const standardFinancing = z.object({
  downPaymentCents: cents,
  lender: contact,
  loanType: z.enum(["CONVENTIONAL", "FHA", "REHAB", "OTHER"]),
  note: optionalText(500),
  type: z.literal("FINANCED"),
}).strict();
const sellerFinancing = z.object({
  amortizationMonths: z.number().int().min(1).max(600).nullable(),
  annualInterestBps: z.number().int().min(0).max(5_000),
  balloonMonth: z.number().int().min(1).max(600).nullable(),
  cashDownPaymentCents: cents,
  interestOnly: z.boolean(),
  note: optionalText(1000),
  principalCents: cents,
  termMonths: z.number().int().min(1).max(600),
  type: z.literal("SELLER_FINANCING"),
}).strict();

const percentDeposit = z.object({ basis: z.literal("PERCENT"), percentageBps: bps }).strict();
const fixedDeposit = z.object({ amountCents: cents, basis: z.literal("FIXED") }).strict();

const possession = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AT_CLOSING") }).strict(),
  z.object({ daysAfterClosing: positiveDays, type: z.literal("DAYS_AFTER_CLOSING") }).strict(),
  z.object({ amountCents: cents, days: positiveDays, frequency: z.enum(["THROUGH_ESCROW", "MONTHLY", "DAILY", "WEEKLY"]), type: z.literal("SELLER_RENT_BACK") }).strict(),
  z.object({ estoppelRequired: z.boolean(), note: requiredText(1000), type: z.literal("TENANT_REMAINS") }).strict(),
  z.object({ note: requiredText(1000), type: z.literal("OTHER") }).strict(),
]);

const feePayer = z.enum(["BUYER", "SELLER", "EACH_OWN"]).default("SELLER");
const titleFeePayer = z.enum(["BUYER", "SELLER", "EACH_OWN"]);
const titleProvider = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("LIBER_PREFERRED"), feePayer: titleFeePayer.optional() }).strict(),
  z.object({ choice: z.literal("CUSTOM"), company: contact, feePayer: titleFeePayer.optional() }).strict(),
]);
const escrowProvider = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("LIBER_PREFERRED"), feePayer }).strict(),
  z.object({ choice: z.literal("CUSTOM"), company: contact, feePayer }).strict(),
]);
const disclosures = z.object({
  condition: optionalText(2000),
  conditionsOfSale: optionalText(2000),
  deathOnProperty: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  deathOnPropertyProvidedBy: z.literal("SELLER").optional(),
}).strict().default({ condition: "", conditionsOfSale: "", deathOnProperty: "UNKNOWN" });
export const loiTransferTaxScheduleSchema = z.enum(["MANUAL", "LA_CITY_2026_2027"]);
const closingCostPayer = z.enum(["BUYER", "SELLER", "SPLIT_EQUALLY", "NOT_APPLICABLE"]);
const itemizedCostEstimate = z.object({
  amountCents: cents.nullable().optional(),
  buyerCents: cents.nullable().optional(),
  sellerCents: cents.nullable().optional(),
}).strict();
export const loiItemizedCostEstimatesSchema = z.object({
  transferTaxes: itemizedCostEstimate.optional(),
  governmentRetrofit: itemizedCostEstimate.optional(),
  hoaDocument: itemizedCostEstimate.optional(),
  hoaCertificate: itemizedCostEstimate.optional(),
  hoaTransfer: itemizedCostEstimate.optional(),
  personalProperty: itemizedCostEstimate.optional(),
}).strict();
// Blank estimates remain unknown; zero is an explicit estimate of no charge.
export const loiClosingCostEstimatesSchema = z.object({
  buyerEscrowCents: cents.nullable(),
  sellerEscrowCents: cents.nullable(),
  buyerTitleInsuranceCents: cents.nullable(),
  sellerTitleInsuranceCents: cents.nullable(),
  buyerOtherClosingCostsCents: cents.nullable(),
  sellerOtherClosingCostsCents: cents.nullable(),
  sellerAgentCommissionAmount: optionalText(80),
  note: optionalText(1000),
  itemizedCosts: loiItemizedCostEstimatesSchema.optional(),
  otherCostsExcludeItemized: z.boolean().optional(),
  // Quote mode only: Measure ULA (City of Los Angeles) is always the seller's cost,
  // so it is never folded into the transfer-tax quote that follows the base-tax payer.
  sellerMeasureUlaCents: cents.nullable().optional(),
}).strict();

export const loiTermsV1Schema = z.object({
  additionalTerms: z.object({ exclusions: optionalText(4000), proposedTerms: optionalText(4000) }).strict(),
  disclosures,
  costsAndCredits: z.object({
    transferTaxSchedule: loiTransferTaxScheduleSchema.optional(),
    alternateClosingCostAllocation: optionalText(1000),
    customaryClosingCosts: z.boolean(),
    closingCostEstimates: loiClosingCostEstimatesSchema.optional(),
    closingCostPayers: z.object({
      transferTaxes: closingCostPayer.nullable(),
      governmentRetrofitItems: closingCostPayer.nullable(),
    }).strict().optional(),
    homeWarranty: z.object({
      company: optionalText(160),
      included: z.boolean(),
      maximumCents: cents,
      buyerShareCents: cents.nullable().optional(),
      sellerShareCents: cents.nullable().optional(),
      payer: z.enum(["BUYER", "SELLER", "EACH_OWN", "OTHER"]),
      payerNote: optionalText(500),
      specialInclusions: optionalText(1000),
    }).strict(),
    sellerCreditCents: cents,
    sellerCreditIncluded: z.boolean().optional(),
    sellerCreditNote: optionalText(500),
  }).strict(),
  deposit: z.discriminatedUnion("basis", [percentDeposit, fixedDeposit]),
  funding: z.discriminatedUnion("type", [cashFunding, standardFinancing, sellerFinancing]),
  hoa: z.object({ certificateFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]), documentFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]), transferFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]) }).strict(),
  parties: z.object({ buyerLegalName: requiredText(200), buyerContact: contact, vestingNote: optionalText(500) }).strict(),
  personalProperty: z.object({
    excludedItems: optionalText(2000),
    included: z.boolean(),
    includedItems: z.array(requiredText(120)).max(50),
    payer: z.enum(["BUYER", "SELLER"]).default("SELLER"),
  }).strict(),
  possession,
  providers: z.object({ escrow: escrowProvider, title: titleProvider }).strict(),
  purchasePriceCents: cents.min(1, "Enter a positive offer price before submitting this LOI."),
  representation: z.object({
    agent: agentContact,
    buyerRepresented: z.boolean(),
    commissionAmount: optionalText(80).default(""),
    commissionPayer: z.enum(["BUYER", "SELLER"]).nullable().default(null),
  }).strict(),
  schemaVersion: z.literal(LOI_SCHEMA_VERSION),
  timing: z.object({
    appraisalContingencyDays: days.nullable(),
    closingDays: days.min(1),
    inspectionContingencyDays: days,
    loanContingencyDays: days.nullable(),
    sellerDisclosureReviewDays: days,
    titleReviewDays: days,
  }).strict(),
}).strict().superRefine((terms, context) => {
  if (terms.purchasePriceCents > 0 && terms.funding.type === "FINANCED" && terms.funding.downPaymentCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Down payment cannot exceed purchase price.", path: ["funding", "downPaymentCents"] });
  }
  if (terms.funding.type === "FINANCED" && !terms.funding.lender.name && !terms.funding.lender.company) {
    context.addIssue({ code: "custom", message: "A lender name or company is required.", path: ["funding", "lender"] });
  }
  if (terms.funding.type === "FINANCED" && terms.funding.loanType === "OTHER" && !terms.funding.note) {
    context.addIssue({ code: "custom", message: "Describe the other loan type.", path: ["funding", "note"] });
  }
  if (terms.funding.type === "SELLER_FINANCING") {
    if (terms.purchasePriceCents > 0 && terms.funding.cashDownPaymentCents >= terms.purchasePriceCents) context.addIssue({ code: "custom", message: "Seller-financing cash down payment must be less than purchase price.", path: ["funding", "cashDownPaymentCents"] });
    if (terms.purchasePriceCents > 0 && terms.funding.principalCents + terms.funding.cashDownPaymentCents !== terms.purchasePriceCents) context.addIssue({ code: "custom", message: "Seller-financing principal and down payment must equal purchase price.", path: ["funding", "principalCents"] });
    if (terms.purchasePriceCents > 0 && terms.funding.principalCents === 0) context.addIssue({ code: "custom", message: "Seller-financing principal must be positive.", path: ["funding", "principalCents"] });
    if (terms.funding.amortizationMonths !== null && terms.funding.amortizationMonths < terms.funding.termMonths) context.addIssue({ code: "custom", message: "Amortization cannot be shorter than the term.", path: ["funding", "amortizationMonths"] });
    if (terms.funding.balloonMonth !== null && terms.funding.balloonMonth > terms.funding.termMonths) context.addIssue({ code: "custom", message: "Balloon month cannot exceed the term.", path: ["funding", "balloonMonth"] });
    if (terms.funding.interestOnly && terms.funding.amortizationMonths !== null) context.addIssue({ code: "custom", message: "Interest-only terms cannot also specify amortization.", path: ["funding", "amortizationMonths"] });
  }
  if (terms.purchasePriceCents > 0 && terms.deposit.basis === "FIXED" && terms.deposit.amountCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Earnest money cannot exceed purchase price.", path: ["deposit", "amountCents"] });
  }
  if (terms.purchasePriceCents > 0 && terms.costsAndCredits.sellerCreditCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Seller credit cannot exceed purchase price.", path: ["costsAndCredits", "sellerCreditCents"] });
  }
  if (terms.costsAndCredits.homeWarranty.included && !terms.costsAndCredits.homeWarranty.company) {
    context.addIssue({ code: "custom", message: "An included home warranty needs a company.", path: ["costsAndCredits", "homeWarranty", "company"] });
  }
  if (terms.costsAndCredits.homeWarranty.included && terms.costsAndCredits.homeWarranty.maximumCents === 0) {
    context.addIssue({ code: "custom", message: "An included home warranty needs a positive maximum.", path: ["costsAndCredits", "homeWarranty", "maximumCents"] });
  }
  if (terms.costsAndCredits.homeWarranty.included && terms.costsAndCredits.homeWarranty.payer === "OTHER" && !terms.costsAndCredits.homeWarranty.payerNote) {
    context.addIssue({ code: "custom", message: "Describe the proposed warranty cost allocation.", path: ["costsAndCredits", "homeWarranty", "payerNote"] });
  }
  if (terms.costsAndCredits.homeWarranty.included && terms.costsAndCredits.homeWarranty.payer !== "OTHER" && terms.costsAndCredits.homeWarranty.payerNote) {
    context.addIssue({ code: "custom", message: "A warranty payer note is allowed only when the payer is Other.", path: ["costsAndCredits", "homeWarranty", "payerNote"] });
  }
  if (!terms.costsAndCredits.homeWarranty.included && (
    terms.costsAndCredits.homeWarranty.company
    || terms.costsAndCredits.homeWarranty.maximumCents !== 0
    || terms.costsAndCredits.homeWarranty.payer !== "SELLER"
    || terms.costsAndCredits.homeWarranty.payerNote
    || terms.costsAndCredits.homeWarranty.specialInclusions
  )) {
    context.addIssue({ code: "custom", message: "Clear warranty details when no warranty is proposed.", path: ["costsAndCredits", "homeWarranty", "included"] });
  }
  if (!terms.costsAndCredits.customaryClosingCosts && !terms.costsAndCredits.alternateClosingCostAllocation && !terms.costsAndCredits.closingCostPayers) {
    context.addIssue({ code: "custom", message: "Describe the alternate closing-cost allocation.", path: ["costsAndCredits", "alternateClosingCostAllocation"] });
  }
  if (terms.costsAndCredits.customaryClosingCosts && terms.costsAndCredits.alternateClosingCostAllocation) {
    context.addIssue({ code: "custom", message: "Clear the alternate allocation when customary costs are selected.", path: ["costsAndCredits", "alternateClosingCostAllocation"] });
  }
  if (terms.funding.type === "CASH" && terms.timing.loanContingencyDays !== null) {
    context.addIssue({ code: "custom", message: "Cash funding cannot include a loan contingency.", path: ["timing", "loanContingencyDays"] });
  }
  if (terms.representation.buyerRepresented && !terms.representation.agent.name) {
    context.addIssue({ code: "custom", message: "A represented buyer needs an agent name.", path: ["representation", "agent", "name"] });
  }
  if (terms.representation.buyerRepresented && !terms.representation.agent.email && !terms.representation.agent.phone) {
    context.addIssue({ code: "custom", message: "Provide an agent email or phone.", path: ["representation", "agent", "email"] });
  }
  if (!terms.representation.buyerRepresented && Object.values(terms.representation.agent).some(Boolean)) {
    context.addIssue({ code: "custom", message: "Clear agent details when the buyer is not represented.", path: ["representation", "buyerRepresented"] });
  }
  for (const key of ["escrow", "title"] as const) {
    const providerValue = terms.providers[key];
    if (providerValue.choice === "CUSTOM" && !providerValue.company.name && !providerValue.company.company) context.addIssue({ code: "custom", message: "A custom provider needs a name or company.", path: ["providers", key] });
  }
  if (terms.personalProperty.included && terms.personalProperty.includedItems.length === 0) {
    context.addIssue({ code: "custom", message: "List at least one included item.", path: ["personalProperty", "includedItems"] });
  }
  if (!terms.personalProperty.included && terms.personalProperty.includedItems.length > 0) {
    context.addIssue({ code: "custom", message: "Clear included items when personal property is not proposed.", path: ["personalProperty", "includedItems"] });
  }
});

export type LoiTermsV1 = z.infer<typeof loiTermsV1Schema>;

function refineEditableTerms(terms: LoiTermsV1, context: z.RefinementCtx, preserveHistoricalFunding: boolean) {
  const estimates = terms.costsAndCredits.closingCostEstimates;
  const warranty = terms.costsAndCredits.homeWarranty;
  if (warranty.included && warranty.payer === "EACH_OWN") {
    context.addIssue({ code: "custom", message: "Choose Buyer, Seller, or Other for the home warranty payer.", path: ["costsAndCredits", "homeWarranty", "payer"] });
  }
  if (warranty.included && (warranty.payer === "EACH_OWN" || warranty.payer === "OTHER")
    && (warranty.buyerShareCents ?? 0) + (warranty.sellerShareCents ?? 0) > warranty.maximumCents) {
    context.addIssue({ code: "custom", message: "The buyer and seller warranty shares cannot exceed the warranty maximum.", path: ["costsAndCredits", "homeWarranty", "buyerShareCents"] });
  }
  const separatelyCounted = calculateAdditionalCosts(terms);
  if (estimates && ((estimates.buyerOtherClosingCostsCents ?? 0) > 0 || (estimates.sellerOtherClosingCostsCents ?? 0) > 0)
    && separatelyCounted.buyerTotalCents + separatelyCounted.sellerTotalCents + separatelyCounted.monthlyRentBackCents > 0 && estimates.otherCostsExcludeItemized !== true) {
    context.addIssue({ code: "custom", message: "Confirm that Other closing costs exclude warranty, itemized fees, and rent-back amounts calculated separately.", path: ["costsAndCredits", "closingCostEstimates", "otherCostsExcludeItemized"] });
  }
  if (estimates?.sellerAgentCommissionAmount && !validLoiCommissionAmount(estimates.sellerAgentCommissionAmount)) {
    context.addIssue({ code: "custom", message: "Enter a dollar amount or a percentage from 0% to 100%, with up to two decimal places.", path: ["costsAndCredits", "closingCostEstimates", "sellerAgentCommissionAmount"] });
  }
  if (estimates && terms.providers.escrow.feePayer !== "EACH_OWN") {
    const excluded = terms.providers.escrow.feePayer === "SELLER" ? "buyerEscrowCents" : "sellerEscrowCents";
    if (estimates[excluded] !== null && estimates[excluded] !== 0) context.addIssue({ code: "custom", message: "Clear this estimate because the other party pays escrow.", path: ["costsAndCredits", "closingCostEstimates", excluded] });
  }
  if (estimates && terms.providers.title.feePayer && terms.providers.title.feePayer !== "EACH_OWN") {
    const excluded = terms.providers.title.feePayer === "SELLER" ? "buyerTitleInsuranceCents" : "sellerTitleInsuranceCents";
    if (estimates[excluded] !== null && estimates[excluded] !== 0) context.addIssue({ code: "custom", message: "Clear this estimate because the other party pays title insurance.", path: ["costsAndCredits", "closingCostEstimates", excluded] });
  }
  if (!preserveHistoricalFunding && terms.funding.type === "SELLER_FINANCING" && !terms.funding.interestOnly && terms.funding.amortizationMonths === null) {
    context.addIssue({ code: "custom", message: "Enter the amortization schedule in years for fully amortized financing.", path: ["funding", "amortizationMonths"] });
  }
  if (!terms.costsAndCredits.customaryClosingCosts) {
    for (const key of ["transferTaxes", "governmentRetrofitItems"] as const) {
      if (!terms.costsAndCredits.closingCostPayers?.[key]) context.addIssue({ code: "custom", message: "Choose who pays this closing cost.", path: ["costsAndCredits", "closingCostPayers", key] });
    }
  } else if (terms.costsAndCredits.closingCostPayers) {
    context.addIssue({ code: "custom", message: "Clear specific cost payers when customary costs are selected.", path: ["costsAndCredits", "customaryClosingCosts"] });
  }
  if (terms.costsAndCredits.transferTaxSchedule === "LA_CITY_2026_2027" && !terms.costsAndCredits.customaryClosingCosts && terms.costsAndCredits.closingCostPayers?.transferTaxes === "NOT_APPLICABLE") {
    context.addIssue({ code: "custom", message: "Use an entered tax quote for an exempt transfer, or choose who pays the taxable LA City base taxes.", path: ["costsAndCredits", "transferTaxSchedule"] });
  }
  const sellerCreditIncluded = terms.costsAndCredits.sellerCreditIncluded ?? (terms.costsAndCredits.sellerCreditCents > 0 || Boolean(terms.costsAndCredits.sellerCreditNote));
  if (sellerCreditIncluded && terms.costsAndCredits.sellerCreditCents === 0) {
    context.addIssue({ code: "custom", message: "Enter a positive seller credit amount, or choose No.", path: ["costsAndCredits", "sellerCreditCents"] });
  }
  if (terms.costsAndCredits.sellerCreditIncluded === false && (terms.costsAndCredits.sellerCreditCents !== 0 || terms.costsAndCredits.sellerCreditNote)) {
    context.addIssue({ code: "custom", message: "Clear the credit amount and reason when no seller credit is proposed.", path: ["costsAndCredits", "sellerCreditCents"] });
  }
  if (terms.deposit.basis !== "PERCENT" || terms.deposit.percentageBps !== LOI_STANDARD_DEPOSIT_BPS) {
    context.addIssue({ code: "custom", message: "Earnest money is set at 3% of the offer price.", path: ["deposit"] });
  }
  if (terms.timing.closingDays > LOI_MAX_ESCROW_DAYS) {
    context.addIssue({ code: "custom", message: "Escrow cannot exceed 90 days.", path: ["timing", "closingDays"] });
  }
  if (terms.possession.type === "SELLER_RENT_BACK" && (terms.possession.frequency === "DAILY" || terms.possession.frequency === "WEEKLY")) {
    context.addIssue({ code: "custom", message: "Rent-back is paid through escrow or monthly.", path: ["possession", "frequency"] });
  }
  if (terms.hoa.documentFeePayer === "EACH_OWN") {
    context.addIssue({ code: "custom", message: "Choose buyer or seller for the HOA document fee.", path: ["hoa", "documentFeePayer"] });
  }
  if (terms.representation.buyerRepresented && !terms.representation.commissionAmount) {
    context.addIssue({ code: "custom", message: "Provide a commission amount ($ or % of sales price).", path: ["representation", "commissionAmount"] });
  }
  if (terms.representation.buyerRepresented && terms.representation.commissionAmount && !validLoiCommissionAmount(terms.representation.commissionAmount)) {
    context.addIssue({ code: "custom", message: "Enter a dollar amount such as $10,000 or a percentage from 0% to 100%, with up to two decimal places.", path: ["representation", "commissionAmount"] });
  }
  if (terms.representation.buyerRepresented && !terms.representation.commissionPayer) {
    context.addIssue({ code: "custom", message: "Choose who pays the agent commission.", path: ["representation", "commissionPayer"] });
  }
  if (!terms.representation.buyerRepresented && (terms.representation.commissionAmount || terms.representation.commissionPayer)) {
    context.addIssue({ code: "custom", message: "Clear commission details when the buyer is not represented.", path: ["representation", "commissionAmount"] });
  }
}

export const loiEditableTermsV1Schema = loiTermsV1Schema.superRefine((terms, context) => refineEditableTerms(terms, context, false));
// Counter funding is copied from the immutable base revision by the server.
export const loiCounterEditableTermsV1Schema = loiTermsV1Schema.superRefine((terms, context) => refineEditableTerms(terms, context, true));

// Zero is a missing-price marker only in owner-private drafts. Submitted terms
// and financial calculations retain the positive-price schema above.
export const loiDraftTermsV1Schema = loiTermsV1Schema.safeExtend({ purchasePriceCents: cents });
export const loiEditableDraftTermsV1Schema = loiDraftTermsV1Schema.superRefine((terms, context) => refineEditableTerms(terms, context, false));
export const loiCounterEditableDraftTermsV1Schema = loiDraftTermsV1Schema.superRefine((terms, context) => refineEditableTerms(terms, context, true));
export function parseLoiDraftTerms(value: unknown, counter = false) {
  return (counter ? loiCounterEditableDraftTermsV1Schema : loiEditableDraftTermsV1Schema).parse(value);
}

// The supplied schedule is proportional to price, rounded half-up to cents
// separately for each side. Blank quoted estimates use the schedule; zero is
// an explicit no-charge override. One payer covers both side fees.
export function calculateLoiEscrowFees(purchasePriceCents: number, payer: "BUYER" | "SELLER" | "EACH_OWN", estimates?: { buyerEscrowCents: number | null; sellerEscrowCents: number | null }) {
  const perSideCents = Number.isSafeInteger(purchasePriceCents) && purchasePriceCents > 0 && purchasePriceCents <= LOI_MAX_PRICE_CENTS
    ? 30_000 + roundHalfUp(purchasePriceCents * 175, 100_000) : null;
  const totalCents = perSideCents === null ? null : perSideCents * 2;
  return {
    perSideCents,
    buyerCents: payer === "SELLER" ? 0 : estimates?.buyerEscrowCents ?? (payer === "BUYER" ? totalCents : perSideCents),
    sellerCents: payer === "BUYER" ? 0 : estimates?.sellerEscrowCents ?? (payer === "SELLER" ? totalCents : perSideCents),
  };
}

// Blank title fields use one policy at 0.25% of price for the title payer; Each pays own
// splits it, with the indivisible cent on the buyer. Blank buyer misc costs use 0.2% of price.
// Entered amounts override the schedule; zero means no charge. Seller misc costs stay as entered.
export function calculateLoiScheduledClosingCosts(purchasePriceCents: number, titlePayer: "BUYER" | "SELLER" | "EACH_OWN", estimates?: { buyerTitleInsuranceCents: number | null; sellerTitleInsuranceCents: number | null; buyerOtherClosingCostsCents: number | null }) {
  if (!Number.isSafeInteger(purchasePriceCents) || purchasePriceCents <= 0 || purchasePriceCents > LOI_MAX_PRICE_CENTS) return null;
  const titlePolicyCents = roundHalfUp(purchasePriceCents * LOI_TITLE_POLICY_RATE_BPS, 10_000);
  const miscCents = roundHalfUp(purchasePriceCents * LOI_MISC_CLOSING_COST_RATE_BPS, 10_000);
  const titleShare = (side: "BUYER" | "SELLER") => titlePayer === side ? titlePolicyCents
    : titlePayer === "EACH_OWN" ? (side === "BUYER" ? Math.ceil(titlePolicyCents / 2) : Math.floor(titlePolicyCents / 2)) : 0;
  return {
    titlePolicyCents,
    miscCents,
    buyerTitleCents: titlePayer === "SELLER" ? 0 : estimates?.buyerTitleInsuranceCents ?? titleShare("BUYER"),
    sellerTitleCents: titlePayer === "BUYER" ? 0 : estimates?.sellerTitleInsuranceCents ?? titleShare("SELLER"),
    buyerOtherCents: estimates?.buyerOtherClosingCostsCents ?? miscCents,
  };
}

export function validLoiCommissionAmount(value: string) {
  const amount = value.trim();
  if (/^\d+(?:\.\d{1,2})?\s*%$/.test(amount)) return Number(amount.replace(/\s*%$/, "")) <= 100;
  if (!/^(?:\$\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount)) return false;
  return Number(amount.replace(/[$,\s]/g, "")) <= LOI_MAX_PRICE_CENTS / 100;
}

export function parseLoiEditableTerms(value: unknown, counter = false) {
  return (counter ? loiCounterEditableTermsV1Schema : loiEditableTermsV1Schema).parse(value);
}

export const loiComputedSummaryV1Schema = z.object({
  calculationVersion: z.literal(1),
  earnestMoneyBps: bps,
  earnestMoneyCents: cents,
  effectivePriceAfterSellerCreditCents: cents,
  loanAmountCents: cents,
  loanToValueBps: bps,
  remainingDownPaymentAfterDepositCents: cents,
}).strict();
const summaryMoney = z.number().int().min(-LOI_MAX_PRICE_CENTS * 8).max(LOI_MAX_PRICE_CENTS * 8);
export const loiComputedSummaryV2Schema = loiComputedSummaryV1Schema.extend({
  calculationVersion: z.literal(2),
  buyerAgentCommissionCents: cents.nullable(),
  sellerAgentCommissionCents: cents.nullable(),
  buyerClosingCostsCents: summaryMoney,
  sellerClosingCostsCents: summaryMoney,
  buyerCashDueAtClosingCents: summaryMoney,
  sellerCashBeforePayoffsCents: summaryMoney,
  closingCostEstimateComplete: z.boolean(),
}).strict();
const summaryMoneyV3 = z.number().int().min(-LOI_MAX_PRICE_CENTS * 32).max(LOI_MAX_PRICE_CENTS * 32);
export const loiComputedSummaryV3Schema = loiComputedSummaryV2Schema.extend({
  calculationVersion: z.literal(3),
  buyerClosingCostsCents: summaryMoneyV3,
  sellerClosingCostsCents: summaryMoneyV3,
  buyerCashDueAtClosingCents: summaryMoneyV3,
  sellerCashBeforePayoffsCents: summaryMoneyV3,
  buyerHomeWarrantyCents: cents.nullable(),
  sellerHomeWarrantyCents: cents.nullable(),
  buyerItemizedCostsCents: summaryMoneyV3,
  sellerItemizedCostsCents: summaryMoneyV3,
  rentBackAtClosingCents: cents,
  monthlyRentBackCents: cents,
}).strict();
export const loiComputedSummaryV4Schema = loiComputedSummaryV3Schema.extend({
  calculationVersion: z.literal(4),
  escrowFeePerSideCents: cents,
  buyerEscrowCents: cents,
  sellerEscrowCents: cents,
}).strict();
export const loiComputedSummaryV5Schema = loiComputedSummaryV4Schema.extend({
  calculationVersion: z.literal(5),
  transferTaxSchedule: loiTransferTaxScheduleSchema,
  laCountyTransferTaxCents: cents.nullable(),
  laCityTransferTaxCents: cents.nullable(),
  measureUlaCents: cents.nullable(),
  measureUlaRateBps: bps.nullable(),
  buyerTransferTaxCents: summaryMoneyV3.nullable(),
  sellerTransferTaxCents: summaryMoneyV3.nullable(),
}).strict();
// V6 freezes the resolved title and misc amounts, including scheduled defaults,
// and reports completeness per side so each party sees only its own gaps.
export const loiComputedSummaryV6Schema = loiComputedSummaryV5Schema.extend({
  calculationVersion: z.literal(6),
  titlePolicyEstimateCents: cents,
  miscClosingCostEstimateCents: cents,
  buyerTitleInsuranceCents: cents,
  sellerTitleInsuranceCents: cents,
  buyerOtherClosingCostsCents: cents,
  sellerOtherClosingCostsCents: cents.nullable(),
  buyerClosingCostEstimateComplete: z.boolean(),
  sellerClosingCostEstimateComplete: z.boolean(),
}).strict();
export type LoiComputedSummaryV6 = z.infer<typeof loiComputedSummaryV6Schema>;
export type LoiComputedSummary = z.infer<typeof loiComputedSummaryV1Schema> | z.infer<typeof loiComputedSummaryV2Schema> | z.infer<typeof loiComputedSummaryV3Schema> | z.infer<typeof loiComputedSummaryV4Schema> | z.infer<typeof loiComputedSummaryV5Schema> | LoiComputedSummaryV6;
type LoiCalculationVersionsFrom = { 2: 2 | 3 | 4 | 5 | 6; 3: 3 | 4 | 5 | 6; 4: 4 | 5 | 6; 5: 5 | 6; 6: 6 };
// Each summary version extends the previous one, so a newer summary carries every older field.
export function loiSummaryFromVersion<V extends keyof LoiCalculationVersionsFrom>(summary: LoiComputedSummary, version: V): summary is Extract<LoiComputedSummary, { calculationVersion: LoiCalculationVersionsFrom[V] }> {
  return summary.calculationVersion >= version;
}
// V6 tracks each side separately; older versions only stored the combined flag.
export function loiSideEstimateComplete(summary: LoiComputedSummary, side: "BUYER" | "SELLER") {
  if (summary.calculationVersion === 1) return false;
  if (summary.calculationVersion === 6) return side === "BUYER" ? summary.buyerClosingCostEstimateComplete : summary.sellerClosingCostEstimateComplete;
  return summary.closingCostEstimateComplete;
}

const calculationWarranty = z.object({
  included: z.boolean().default(false), maximumCents: cents.default(0),
  payer: z.enum(["BUYER", "SELLER", "EACH_OWN", "OTHER"]).default("SELLER"),
  buyerShareCents: cents.nullable().optional(), sellerShareCents: cents.nullable().optional(),
});
const calculationHoaPayer = z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]);

const loiCalculationInputSchema = z.object({
  costsAndCredits: z.object({
    transferTaxSchedule: loiTransferTaxScheduleSchema.optional(),
    sellerCreditCents: cents, closingCostEstimates: loiClosingCostEstimatesSchema.optional(),
    customaryClosingCosts: z.boolean().optional(),
    closingCostPayers: z.object({ transferTaxes: closingCostPayer.nullable(), governmentRetrofitItems: closingCostPayer.nullable() }).optional(),
    homeWarranty: calculationWarranty.optional(),
  }),
  hoa: z.object({ certificateFeePayer: calculationHoaPayer, documentFeePayer: calculationHoaPayer, transferFeePayer: calculationHoaPayer }).optional(),
  personalProperty: z.object({ included: z.boolean(), payer: z.enum(["BUYER", "SELLER"]).default("SELLER") }).optional(),
  possession: z.object({
    type: z.enum(["AT_CLOSING", "DAYS_AFTER_CLOSING", "SELLER_RENT_BACK", "TENANT_REMAINS", "OTHER"]),
    amountCents: cents.optional(), frequency: z.enum(["THROUGH_ESCROW", "MONTHLY", "DAILY", "WEEKLY"]).optional(),
  }).optional(),
  providers: z.object({ escrow: z.object({ feePayer }), title: z.object({ feePayer: titleFeePayer.optional() }).optional() }),
  representation: z.object({ buyerRepresented: z.boolean(), commissionAmount: z.string(), commissionPayer: z.enum(["BUYER", "SELLER"]).nullable() }),
  deposit: z.discriminatedUnion("basis", [percentDeposit, fixedDeposit]),
  funding: z.discriminatedUnion("type", [
    z.object({ type: z.literal("CASH") }),
    z.object({ downPaymentCents: cents, type: z.literal("FINANCED") }),
    z.object({ cashDownPaymentCents: cents, principalCents: cents, type: z.literal("SELLER_FINANCING") }),
  ]),
  purchasePriceCents: cents.min(1),
});
type LoiCalculationInput = z.infer<typeof loiCalculationInputSchema>;

export type LoiCalculationIssue = { message: string; path: string };

// Cross-field conflicts are reported beside the live figures rather than
// blanking the calculator; full terms validation still blocks save and submit.
function loiCalculationIssues(terms: LoiCalculationInput): LoiCalculationIssue[] {
  const issues: LoiCalculationIssue[] = [];
  if (terms.funding.type === "FINANCED" && terms.funding.downPaymentCents > terms.purchasePriceCents) {
    issues.push({ message: "Down payment cannot exceed purchase price.", path: "funding.downPaymentCents" });
  }
  if (terms.funding.type === "SELLER_FINANCING" && (terms.funding.principalCents === 0 || terms.funding.principalCents + terms.funding.cashDownPaymentCents !== terms.purchasePriceCents)) {
    issues.push({ message: "Seller-financing principal and cash down payment must equal the purchase price.", path: "funding.principalCents" });
  }
  if (terms.deposit.basis === "FIXED" && terms.deposit.amountCents > terms.purchasePriceCents) {
    issues.push({ message: "Earnest money cannot exceed purchase price.", path: "deposit.amountCents" });
  }
  if (terms.costsAndCredits.sellerCreditCents > terms.purchasePriceCents) {
    issues.push({ message: "Seller credit cannot exceed purchase price.", path: "costsAndCredits.sellerCreditCents" });
  }
  const warranty = terms.costsAndCredits.homeWarranty;
  if (warranty?.included && (warranty.payer === "EACH_OWN" || warranty.payer === "OTHER")
    && (warranty.buyerShareCents ?? 0) + (warranty.sellerShareCents ?? 0) > warranty.maximumCents) {
    issues.push({ message: "Warranty shares cannot exceed the warranty maximum.", path: "costsAndCredits.homeWarranty.buyerShareCents" });
  }
  return issues;
}

function roundHalfUp(numerator: number, denominator: number) {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateLoiSummary(input: LoiTermsV1): LoiComputedSummaryV6 {
  const terms = loiTermsV1Schema.parse(input);
  return calculateValidatedLoiSummary(terms);
}

export type LoiLivePreview = { issues: LoiCalculationIssue[]; summary: LoiComputedSummaryV6 };

// Live editor preview. Only the financial projection must be well formed; the
// figures follow the entered amounts even while `issues` reports a conflict.
export function previewLoiCalculation(input: unknown): LoiLivePreview | null {
  const parsed = loiCalculationInputSchema.safeParse(input);
  return parsed.success ? { issues: loiCalculationIssues(parsed.data), summary: calculateValidatedLoiSummary(parsed.data) } : null;
}

export function calculateLoiPreview(input: unknown): LoiComputedSummary | null {
  return previewLoiCalculation(input)?.summary ?? null;
}

export function calculateLoiCommissionCents(value: string, purchasePriceCents: number): number | null {
  if (!validLoiCommissionAmount(value) || !Number.isSafeInteger(purchasePriceCents) || purchasePriceCents <= 0 || purchasePriceCents > LOI_MAX_PRICE_CENTS) return null;
  const normalized = value.trim().replace(/[$,\s]/g, "");
  const percent = normalized.endsWith("%");
  const [whole, decimals = ""] = normalized.replace(/%$/, "").split(".");
  const scaled = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return percent ? roundHalfUp(purchasePriceCents * scaled, 10_000) : scaled;
}

type CostAllocation = { buyerCents: number | null; sellerCents: number | null; complete: boolean };
type ItemizedCostEstimate = z.infer<typeof itemizedCostEstimate>;
export { allocateCost as calculateLoiCostAllocation };
function allocateCost(payer: string | null | undefined, estimate?: ItemizedCostEstimate): CostAllocation {
  if (payer === "NOT_APPLICABLE") return { buyerCents: 0, sellerCents: 0, complete: true };
  if (payer === "BUYER" || payer === "SELLER") {
    const amount = estimate?.amountCents ?? null;
    return { buyerCents: payer === "BUYER" ? amount : 0, sellerCents: payer === "SELLER" ? amount : 0, complete: amount !== null };
  }
  if (payer === "SPLIT_EQUALLY") {
    const amount = estimate?.amountCents ?? null;
    // Assign the indivisible final cent to the buyer, keeping the combined total exact.
    return { buyerCents: amount === null ? null : Math.ceil(amount / 2), sellerCents: amount === null ? null : Math.floor(amount / 2), complete: amount !== null };
  }
  if (payer === "EACH_OWN" || payer === "OTHER") {
    const buyerCents = estimate?.buyerCents ?? null;
    const sellerCents = estimate?.sellerCents ?? null;
    return { buyerCents, sellerCents, complete: buyerCents !== null && sellerCents !== null };
  }
  return { buyerCents: null, sellerCents: null, complete: false };
}

// LA City schedule effective July 1, 2026 through June 30, 2027. Base taxes
// round up to each $500. Measure ULA (City of Los Angeles only, charged to the seller):
// 4.0% on sales above $5,400,000 and below $10,900,000, 5.5% at $10,900,000 or above,
// on the full price; a sale of exactly $5,400,000 owes none.
// Sources: finance.lacity.gov/faq/measure-ula and lavote.gov documentary transfer taxes.
export function calculateLoiLaCityTransferTaxes(priceCents: number) {
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0 || priceCents > LOI_MAX_PRICE_CENTS) return null;
  const increments = priceCents > 10_000 ? Math.ceil(priceCents / 50_000) : 0;
  const measureUlaRateBps = priceCents >= 1_090_000_000 ? 550 : priceCents > 540_000_000 ? 400 : 0;
  return { laCountyTransferTaxCents: increments * 55, laCityTransferTaxCents: increments * 225,
    measureUlaCents: roundHalfUp(priceCents * measureUlaRateBps, 10_000), measureUlaRateBps };
}

function calculateAdditionalCosts(terms: LoiCalculationInput) {
  const itemized = terms.costsAndCredits.closingCostEstimates?.itemizedCosts;
  const customary = terms.costsAndCredits.customaryClosingCosts === true;
  const scheduled = terms.costsAndCredits.transferTaxSchedule === "LA_CITY_2026_2027";
  const taxes = scheduled ? calculateLoiLaCityTransferTaxes(terms.purchasePriceCents) : null;
  const taxAllocation = allocateCost(customary ? "SELLER" : terms.costsAndCredits.closingCostPayers?.transferTaxes,
    scheduled ? { amountCents: taxes ? taxes.laCountyTransferTaxCents + taxes.laCityTransferTaxCents : null } : itemized?.transferTaxes);
  // ULA is the seller's alone in both modes: scheduled from the price, or the seller-only quote.
  const quotedUla = scheduled ? null : terms.costsAndCredits.closingCostEstimates?.sellerMeasureUlaCents ?? null;
  const measureUlaCents = scheduled ? taxes?.measureUlaCents ?? null : quotedUla;
  const ula = measureUlaCents ?? 0;
  const allocations = [
    taxAllocation,
    allocateCost(customary ? "SELLER" : terms.costsAndCredits.closingCostPayers?.governmentRetrofitItems, itemized?.governmentRetrofit),
    allocateCost(terms.hoa?.documentFeePayer ?? "NOT_APPLICABLE", itemized?.hoaDocument),
    allocateCost(terms.hoa?.certificateFeePayer ?? "NOT_APPLICABLE", itemized?.hoaCertificate),
    allocateCost(terms.hoa?.transferFeePayer ?? "NOT_APPLICABLE", itemized?.hoaTransfer),
    allocateCost(terms.personalProperty?.included ? terms.personalProperty.payer : "NOT_APPLICABLE", itemized?.personalProperty),
  ];
  const buyerItemizedCostsCents = allocations.reduce((sum, allocation) => sum + (allocation.buyerCents ?? 0), 0);
  const sellerItemizedCostsCents = allocations.reduce((sum, allocation) => sum + (allocation.sellerCents ?? 0), 0) + ula;
  const warranty = terms.costsAndCredits.homeWarranty;
  const warrantyAllocation = warranty?.included
    ? allocateCost(warranty.payer, { amountCents: warranty.maximumCents, buyerCents: warranty.buyerShareCents, sellerCents: warranty.sellerShareCents })
    : allocateCost("NOT_APPLICABLE");
  const rentBack = terms.possession?.type === "SELLER_RENT_BACK" ? terms.possession : null;
  const rentBackAtClosingCents = rentBack?.frequency === "THROUGH_ESCROW" ? rentBack.amountCents ?? 0 : 0;
  const monthlyRentBackCents = rentBack?.frequency === "MONTHLY" ? rentBack.amountCents ?? 0 : 0;
  const rentBackComplete = !rentBack || ((rentBack.frequency === "THROUGH_ESCROW" || rentBack.frequency === "MONTHLY") && rentBack.amountCents !== undefined);
  return {
    transferTaxSchedule: scheduled ? "LA_CITY_2026_2027" as const : "MANUAL" as const,
    laCountyTransferTaxCents: taxes?.laCountyTransferTaxCents ?? null,
    laCityTransferTaxCents: taxes?.laCityTransferTaxCents ?? null,
    measureUlaCents,
    measureUlaRateBps: scheduled ? taxes?.measureUlaRateBps ?? null : null,
    buyerTransferTaxCents: taxAllocation.buyerCents,
    sellerTransferTaxCents: taxAllocation.sellerCents === null ? null : taxAllocation.sellerCents + ula,
    buyerHomeWarrantyCents: warrantyAllocation.buyerCents,
    sellerHomeWarrantyCents: warrantyAllocation.sellerCents,
    buyerItemizedCostsCents, sellerItemizedCostsCents, rentBackAtClosingCents, monthlyRentBackCents,
    buyerTotalCents: buyerItemizedCostsCents + (warrantyAllocation.buyerCents ?? 0),
    sellerTotalCents: sellerItemizedCostsCents + (warrantyAllocation.sellerCents ?? 0) + rentBackAtClosingCents,
    buyerComplete: allocations.every((allocation) => allocation.buyerCents !== null) && warrantyAllocation.buyerCents !== null
      && (!warranty?.included || warranty.maximumCents > 0) && rentBackComplete,
    sellerComplete: allocations.every((allocation) => allocation.sellerCents !== null) && warrantyAllocation.sellerCents !== null
      && (!warranty?.included || warranty.maximumCents > 0) && rentBackComplete,
  };
}

function calculateValidatedLoiSummary(terms: LoiCalculationInput): LoiComputedSummaryV6 {
  const downPaymentCents = terms.funding.type === "FINANCED"
    ? terms.funding.downPaymentCents
    : terms.funding.type === "SELLER_FINANCING" ? terms.funding.cashDownPaymentCents : terms.purchasePriceCents;
  // Valid terms never clamp here; a live preview with an oversized down payment shows no loan.
  const loanAmountCents = terms.funding.type === "FINANCED"
    ? Math.max(terms.purchasePriceCents - downPaymentCents, 0)
    : terms.funding.type === "SELLER_FINANCING" ? terms.funding.principalCents : 0;
  const earnestMoneyCents = terms.deposit.basis === "PERCENT"
    ? roundHalfUp(terms.purchasePriceCents * terms.deposit.percentageBps, 10_000)
    : terms.deposit.amountCents;
  const earnestMoneyBps = terms.deposit.basis === "PERCENT"
    ? terms.deposit.percentageBps
    : roundHalfUp(earnestMoneyCents * 10_000, terms.purchasePriceCents);
  const estimates = terms.costsAndCredits.closingCostEstimates;
  const additionalCosts = calculateAdditionalCosts(terms);
  const buyerAgentCommissionCents = terms.representation.buyerRepresented
    ? calculateLoiCommissionCents(terms.representation.commissionAmount, terms.purchasePriceCents) : 0;
  const sellerAgentCommissionCents = calculateLoiCommissionCents(estimates?.sellerAgentCommissionAmount ?? "", terms.purchasePriceCents);
  const escrow = calculateLoiEscrowFees(terms.purchasePriceCents, terms.providers.escrow.feePayer, estimates);
  const buyerEscrowCents = escrow.buyerCents, sellerEscrowCents = escrow.sellerCents;
  if (escrow.perSideCents === null || buyerEscrowCents === null || sellerEscrowCents === null) throw new Error("A positive price is required for escrow calculation.");
  // Historical terms without a title payer keep the editor's inferred allocation.
  const titlePayer = terms.providers.title?.feePayer ?? (estimates?.buyerTitleInsuranceCents ? "EACH_OWN" : "SELLER");
  const scheduled = calculateLoiScheduledClosingCosts(terms.purchasePriceCents, titlePayer, estimates);
  if (!scheduled) throw new Error("A positive price is required for title and closing-cost estimates.");
  const buyerTitleInsuranceCents = scheduled.buyerTitleCents, sellerTitleInsuranceCents = scheduled.sellerTitleCents;
  const buyerOtherClosingCostsCents = scheduled.buyerOtherCents, sellerOtherClosingCostsCents = estimates?.sellerOtherClosingCostsCents ?? null;
  const commissionPayer = terms.representation.commissionPayer;
  const buyerClosingCostsCents = buyerEscrowCents + buyerTitleInsuranceCents + buyerOtherClosingCostsCents
    + (commissionPayer === "BUYER" ? buyerAgentCommissionCents ?? 0 : 0) + additionalCosts.buyerTotalCents;
  const sellerClosingCostsCents = sellerEscrowCents + sellerTitleInsuranceCents
    + (sellerOtherClosingCostsCents ?? 0) + (sellerAgentCommissionCents ?? 0)
    + (commissionPayer === "SELLER" ? buyerAgentCommissionCents ?? 0 : 0) + additionalCosts.sellerTotalCents;
  // An entered "other" amount must confirm it excludes separately calculated expenses.
  const otherCostsConfirmed = !estimates || ((estimates.buyerOtherClosingCostsCents ?? 0) === 0 && (estimates.sellerOtherClosingCostsCents ?? 0) === 0)
    || additionalCosts.buyerTotalCents + additionalCosts.sellerTotalCents + additionalCosts.monthlyRentBackCents === 0 || estimates.otherCostsExcludeItemized === true;
  // An unknown commission, or an unchosen payer, leaves both sides incomplete.
  const commissionKnown = buyerAgentCommissionCents !== null && (!terms.representation.buyerRepresented || commissionPayer !== null);
  const buyerClosingCostEstimateComplete = additionalCosts.buyerComplete && otherCostsConfirmed && (commissionKnown || commissionPayer === "SELLER");
  const sellerClosingCostEstimateComplete = additionalCosts.sellerComplete && otherCostsConfirmed && (commissionKnown || commissionPayer === "BUYER")
    && sellerOtherClosingCostsCents !== null && sellerAgentCommissionCents !== null;
  return {
    calculationVersion: LOI_CALCULATION_VERSION,
    titlePolicyEstimateCents: scheduled.titlePolicyCents,
    miscClosingCostEstimateCents: scheduled.miscCents,
    buyerTitleInsuranceCents,
    sellerTitleInsuranceCents,
    buyerOtherClosingCostsCents,
    sellerOtherClosingCostsCents,
    buyerClosingCostEstimateComplete,
    sellerClosingCostEstimateComplete,
    escrowFeePerSideCents: escrow.perSideCents,
    buyerEscrowCents,
    sellerEscrowCents,
    earnestMoneyBps,
    earnestMoneyCents,
    effectivePriceAfterSellerCreditCents: Math.max(terms.purchasePriceCents - terms.costsAndCredits.sellerCreditCents, 0),
    loanAmountCents,
    loanToValueBps: roundHalfUp(loanAmountCents * 10_000, terms.purchasePriceCents),
    remainingDownPaymentAfterDepositCents: Math.max(downPaymentCents - earnestMoneyCents, 0),
    buyerAgentCommissionCents,
    sellerAgentCommissionCents,
    transferTaxSchedule: additionalCosts.transferTaxSchedule,
    laCountyTransferTaxCents: additionalCosts.laCountyTransferTaxCents,
    laCityTransferTaxCents: additionalCosts.laCityTransferTaxCents,
    measureUlaCents: additionalCosts.measureUlaCents,
    measureUlaRateBps: additionalCosts.measureUlaRateBps,
    buyerTransferTaxCents: additionalCosts.buyerTransferTaxCents,
    sellerTransferTaxCents: additionalCosts.sellerTransferTaxCents,
    buyerHomeWarrantyCents: additionalCosts.buyerHomeWarrantyCents,
    sellerHomeWarrantyCents: additionalCosts.sellerHomeWarrantyCents,
    buyerItemizedCostsCents: additionalCosts.buyerItemizedCostsCents,
    sellerItemizedCostsCents: additionalCosts.sellerItemizedCostsCents,
    rentBackAtClosingCents: additionalCosts.rentBackAtClosingCents,
    monthlyRentBackCents: additionalCosts.monthlyRentBackCents,
    buyerClosingCostsCents,
    sellerClosingCostsCents,
    buyerCashDueAtClosingCents: downPaymentCents - earnestMoneyCents + buyerClosingCostsCents - terms.costsAndCredits.sellerCreditCents - additionalCosts.rentBackAtClosingCents,
    sellerCashBeforePayoffsCents: terms.purchasePriceCents - (terms.funding.type === "SELLER_FINANCING" ? loanAmountCents : 0) - sellerClosingCostsCents - terms.costsAndCredits.sellerCreditCents,
    closingCostEstimateComplete: buyerClosingCostEstimateComplete && sellerClosingCostEstimateComplete,
  };
}

const canonicalLoiUuidSchema = z.string().trim().uuid().transform((value) => value.toLowerCase());
export const loiNegotiationIdSchema = canonicalLoiUuidSchema;
export const loiRevisionIdSchema = canonicalLoiUuidSchema;
export const loiDraftIdSchema = canonicalLoiUuidSchema;
export const loiActionIdSchema = canonicalLoiUuidSchema;
export const loiRouteParamsSchema = z.object({ negotiationId: loiNegotiationIdSchema }).strict();
export const createLoiNegotiationSchema = z.object({ clientActionId: loiActionIdSchema, inviteId: z.string().trim().min(1).max(200) }).strict();
export const saveLoiDraftSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0), terms: loiDraftTermsV1Schema }).strict();
export const saveLoiDraftEnvelopeSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0), terms: z.unknown() }).strict();
export const discardLoiDraftSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0) }).strict();
// The optional timestamp only supports retries from clients predating server-set deadlines.
export const submitLoiRevisionSchema = z.object({ clientActionId: loiActionIdSchema, expectedDraftId: loiDraftIdSchema, expectedDraftVersion: z.number().int().min(1), expectedSequence: z.number().int().min(0), responseDeadline: z.string().datetime({ offset: true }).optional() }).strict();
export const decideLoiRevisionSchema = z.object({ clientActionId: loiActionIdSchema, expectedSequence: z.number().int().min(1), revisionId: loiRevisionIdSchema }).strict();
export const withdrawLoiNegotiationSchema = z.object({ clientActionId: loiActionIdSchema, expectedSequence: z.number().int().min(0), revisionId: loiRevisionIdSchema.nullable() }).strict();
export const loiRevisionPageQuerySchema = z.object({ beforeSequence: z.coerce.number().int().min(2) }).strict();
