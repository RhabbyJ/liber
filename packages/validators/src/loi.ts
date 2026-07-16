import { z } from "zod";

export const LOI_SCHEMA_VERSION = 1;
export const LOI_CALCULATION_VERSION = 1;
export const LOI_MAX_PRICE_CENTS = 10_000_000_000;

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
  z.object({ amountCents: cents, days: positiveDays, frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]), type: z.literal("SELLER_RENT_BACK") }).strict(),
  z.object({ estoppelRequired: z.boolean(), note: requiredText(1000), type: z.literal("TENANT_REMAINS") }).strict(),
  z.object({ note: requiredText(1000), type: z.literal("OTHER") }).strict(),
]);

const provider = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("LIBER_PREFERRED") }).strict(),
  z.object({ choice: z.literal("CUSTOM"), company: contact }).strict(),
]);

export const loiTermsV1Schema = z.object({
  additionalTerms: z.object({ exclusions: optionalText(4000), proposedTerms: optionalText(4000) }).strict(),
  costsAndCredits: z.object({
    alternateClosingCostAllocation: optionalText(1000),
    customaryClosingCosts: z.boolean(),
    homeWarranty: z.object({ company: optionalText(160), included: z.boolean(), maximumCents: cents, payer: z.enum(["BUYER", "SELLER", "EACH_OWN", "OTHER"]), payerNote: optionalText(500) }).strict(),
    sellerCreditCents: cents,
    sellerCreditNote: optionalText(500),
  }).strict(),
  deposit: z.discriminatedUnion("basis", [percentDeposit, fixedDeposit]),
  funding: z.discriminatedUnion("type", [cashFunding, standardFinancing, sellerFinancing]),
  hoa: z.object({ certificateFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]), documentFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]), transferFeePayer: z.enum(["BUYER", "SELLER", "EACH_OWN", "NOT_APPLICABLE"]) }).strict(),
  parties: z.object({ buyerLegalName: requiredText(200), buyerContact: contact, vestingNote: optionalText(500) }).strict(),
  personalProperty: z.object({ excludedItems: optionalText(2000), included: z.boolean(), includedItems: z.array(requiredText(120)).max(50) }).strict(),
  possession,
  providers: z.object({ escrow: provider, title: provider }).strict(),
  purchasePriceCents: cents.min(1),
  representation: z.object({ agent: contact, buyerRepresented: z.boolean() }).strict(),
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
  if (terms.funding.type === "FINANCED" && terms.funding.downPaymentCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Down payment cannot exceed purchase price.", path: ["funding", "downPaymentCents"] });
  }
  if (terms.funding.type === "FINANCED" && !terms.funding.lender.name && !terms.funding.lender.company) {
    context.addIssue({ code: "custom", message: "A lender name or company is required.", path: ["funding", "lender"] });
  }
  if (terms.funding.type === "FINANCED" && terms.funding.loanType === "OTHER" && !terms.funding.note) {
    context.addIssue({ code: "custom", message: "Describe the other loan type.", path: ["funding", "note"] });
  }
  if (terms.funding.type === "SELLER_FINANCING") {
    if (terms.funding.cashDownPaymentCents >= terms.purchasePriceCents) context.addIssue({ code: "custom", message: "Seller-financing cash down payment must be less than purchase price.", path: ["funding", "cashDownPaymentCents"] });
    if (terms.funding.principalCents + terms.funding.cashDownPaymentCents !== terms.purchasePriceCents) context.addIssue({ code: "custom", message: "Seller-financing principal and down payment must equal purchase price.", path: ["funding", "principalCents"] });
    if (terms.funding.principalCents === 0) context.addIssue({ code: "custom", message: "Seller-financing principal must be positive.", path: ["funding", "principalCents"] });
    if (terms.funding.amortizationMonths !== null && terms.funding.amortizationMonths < terms.funding.termMonths) context.addIssue({ code: "custom", message: "Amortization cannot be shorter than the term.", path: ["funding", "amortizationMonths"] });
    if (terms.funding.balloonMonth !== null && terms.funding.balloonMonth > terms.funding.termMonths) context.addIssue({ code: "custom", message: "Balloon month cannot exceed the term.", path: ["funding", "balloonMonth"] });
    if (terms.funding.interestOnly && terms.funding.amortizationMonths !== null) context.addIssue({ code: "custom", message: "Interest-only terms cannot also specify amortization.", path: ["funding", "amortizationMonths"] });
  }
  if (terms.deposit.basis === "FIXED" && terms.deposit.amountCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Earnest money cannot exceed purchase price.", path: ["deposit", "amountCents"] });
  }
  if (terms.costsAndCredits.sellerCreditCents > terms.purchasePriceCents) {
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
  if (!terms.costsAndCredits.homeWarranty.included && (terms.costsAndCredits.homeWarranty.company || terms.costsAndCredits.homeWarranty.maximumCents !== 0 || terms.costsAndCredits.homeWarranty.payer !== "SELLER" || terms.costsAndCredits.homeWarranty.payerNote)) {
    context.addIssue({ code: "custom", message: "Clear warranty details when no warranty is proposed.", path: ["costsAndCredits", "homeWarranty", "included"] });
  }
  if (!terms.costsAndCredits.customaryClosingCosts && !terms.costsAndCredits.alternateClosingCostAllocation) {
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

export const loiComputedSummaryV1Schema = z.object({
  calculationVersion: z.literal(LOI_CALCULATION_VERSION),
  earnestMoneyBps: bps,
  earnestMoneyCents: cents,
  effectivePriceAfterSellerCreditCents: cents,
  loanAmountCents: cents,
  loanToValueBps: bps,
  remainingDownPaymentAfterDepositCents: cents,
}).strict();
export type LoiComputedSummary = z.infer<typeof loiComputedSummaryV1Schema>;

const loiCalculationInputSchema = z.object({
  costsAndCredits: z.object({ sellerCreditCents: cents }),
  deposit: z.discriminatedUnion("basis", [percentDeposit, fixedDeposit]),
  funding: z.discriminatedUnion("type", [
    z.object({ type: z.literal("CASH") }),
    z.object({ downPaymentCents: cents, type: z.literal("FINANCED") }),
    z.object({ cashDownPaymentCents: cents, principalCents: cents, type: z.literal("SELLER_FINANCING") }),
  ]),
  purchasePriceCents: cents.min(1),
}).superRefine((terms, context) => {
  if (terms.funding.type === "FINANCED" && terms.funding.downPaymentCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Down payment cannot exceed purchase price.", path: ["funding", "downPaymentCents"] });
  }
  if (terms.funding.type === "SELLER_FINANCING" && (terms.funding.principalCents === 0 || terms.funding.principalCents + terms.funding.cashDownPaymentCents !== terms.purchasePriceCents)) {
    context.addIssue({ code: "custom", message: "Seller-financing amounts must equal the purchase price.", path: ["funding", "principalCents"] });
  }
  if (terms.deposit.basis === "FIXED" && terms.deposit.amountCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Earnest money cannot exceed purchase price.", path: ["deposit", "amountCents"] });
  }
  if (terms.costsAndCredits.sellerCreditCents > terms.purchasePriceCents) {
    context.addIssue({ code: "custom", message: "Seller credit cannot exceed purchase price.", path: ["costsAndCredits", "sellerCreditCents"] });
  }
});
type LoiCalculationInput = z.infer<typeof loiCalculationInputSchema>;

function roundHalfUp(numerator: number, denominator: number) {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateLoiSummary(input: LoiTermsV1): LoiComputedSummary {
  const terms = loiTermsV1Schema.parse(input);
  return calculateValidatedLoiSummary(terms);
}

export function calculateLoiPreview(input: unknown): LoiComputedSummary | null {
  const parsed = loiCalculationInputSchema.safeParse(input);
  return parsed.success ? calculateValidatedLoiSummary(parsed.data) : null;
}

function calculateValidatedLoiSummary(terms: LoiCalculationInput): LoiComputedSummary {
  const downPaymentCents = terms.funding.type === "FINANCED"
    ? terms.funding.downPaymentCents
    : terms.funding.type === "SELLER_FINANCING" ? terms.funding.cashDownPaymentCents : terms.purchasePriceCents;
  const loanAmountCents = terms.funding.type === "FINANCED"
    ? terms.purchasePriceCents - downPaymentCents
    : terms.funding.type === "SELLER_FINANCING" ? terms.funding.principalCents : 0;
  const earnestMoneyCents = terms.deposit.basis === "PERCENT"
    ? roundHalfUp(terms.purchasePriceCents * terms.deposit.percentageBps, 10_000)
    : terms.deposit.amountCents;
  const earnestMoneyBps = terms.deposit.basis === "PERCENT"
    ? terms.deposit.percentageBps
    : roundHalfUp(earnestMoneyCents * 10_000, terms.purchasePriceCents);
  return {
    calculationVersion: LOI_CALCULATION_VERSION,
    earnestMoneyBps,
    earnestMoneyCents,
    effectivePriceAfterSellerCreditCents: Math.max(terms.purchasePriceCents - terms.costsAndCredits.sellerCreditCents, 0),
    loanAmountCents,
    loanToValueBps: roundHalfUp(loanAmountCents * 10_000, terms.purchasePriceCents),
    remainingDownPaymentAfterDepositCents: Math.max(downPaymentCents - earnestMoneyCents, 0),
  };
}

const canonicalLoiUuidSchema = z.string().trim().uuid().transform((value) => value.toLowerCase());
export const loiNegotiationIdSchema = canonicalLoiUuidSchema;
export const loiRevisionIdSchema = canonicalLoiUuidSchema;
export const loiDraftIdSchema = canonicalLoiUuidSchema;
export const loiActionIdSchema = canonicalLoiUuidSchema;
export const loiRouteParamsSchema = z.object({ negotiationId: loiNegotiationIdSchema }).strict();
export const createLoiNegotiationSchema = z.object({ clientActionId: loiActionIdSchema, inviteId: z.string().trim().min(1).max(200) }).strict();
export const saveLoiDraftSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0), terms: loiTermsV1Schema }).strict();
export const saveLoiDraftEnvelopeSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0), terms: z.unknown() }).strict();
export const discardLoiDraftSchema = z.object({ expectedDraftVersion: z.number().int().min(0), expectedSequence: z.number().int().min(0) }).strict();
export const submitLoiRevisionSchema = z.object({ clientActionId: loiActionIdSchema, expectedDraftId: loiDraftIdSchema, expectedDraftVersion: z.number().int().min(1), expectedSequence: z.number().int().min(0), responseDeadline: z.string().datetime({ offset: true }) }).strict();
export const decideLoiRevisionSchema = z.object({ clientActionId: loiActionIdSchema, expectedSequence: z.number().int().min(1), revisionId: loiRevisionIdSchema }).strict();
export const withdrawLoiNegotiationSchema = z.object({ clientActionId: loiActionIdSchema, expectedSequence: z.number().int().min(0), revisionId: loiRevisionIdSchema.nullable() }).strict();
export const loiRevisionPageQuerySchema = z.object({ beforeSequence: z.coerce.number().int().min(2) }).strict();
