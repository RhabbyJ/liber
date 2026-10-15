import { loiActionIdSchema, loiTermsV1Schema, type LoiTermsV1 } from "@liber/validators";
import { z } from "zod";

export const LOI_TEMPLATE_SCHEMA_VERSION = 1;
export const LOI_TEMPLATE_LIMIT = 20;
export const LOI_TEMPLATE_STORAGE_MAX_BYTES = 128 * 1024;

// Construct a new object from an explicit whitelist rather than copying an LOI.
// Transaction identity, funding, seller credit, seller disclosures, and buyer identity stay local.
export const loiTemplateTermsSchema = z.object({
  additionalTerms: loiTermsV1Schema.shape.additionalTerms,
  costsAndCredits: loiTermsV1Schema.shape.costsAndCredits,
  hoa: loiTermsV1Schema.shape.hoa,
  personalProperty: loiTermsV1Schema.shape.personalProperty,
  possession: loiTermsV1Schema.shape.possession,
  providers: loiTermsV1Schema.shape.providers,
  representation: z.object({
    commissionAmount: loiTermsV1Schema.shape.representation.shape.commissionAmount,
    commissionPayer: loiTermsV1Schema.shape.representation.shape.commissionPayer,
  }).strict(),
  timing: loiTermsV1Schema.shape.timing,
}).strict().superRefine((terms, context) => {
  if (terms.costsAndCredits.homeWarranty.payer === "EACH_OWN") {
    context.addIssue({ code: "custom", message: "Choose Buyer, Seller, or Other for the home warranty before saving this template.", path: ["costsAndCredits", "homeWarranty", "payer"] });
  }
});

export const loiTemplateSchema = z.object({
  id: loiActionIdSchema,
  name: z.string().trim().normalize("NFC").min(1).max(80),
  schemaVersion: z.literal(LOI_TEMPLATE_SCHEMA_VERSION),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  terms: loiTemplateTermsSchema,
}).strict().superRefine((template, context) => {
  if (Date.parse(template.updatedAt) < Date.parse(template.createdAt)) {
    context.addIssue({ code: "custom", message: "A template update cannot precede its creation.", path: ["updatedAt"] });
  }
});

export type LoiTemplate = z.infer<typeof loiTemplateSchema>;
export type LoiTemplateTerms = z.infer<typeof loiTemplateTermsSchema>;

function assertStorageSize(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > LOI_TEMPLATE_STORAGE_MAX_BYTES) {
    throw new Error("Saved LOI templates exceed the storage limit.");
  }
}

export function parseLoiTemplate(value: unknown): LoiTemplate {
  assertStorageSize(value);
  const template = loiTemplateSchema.parse(value);
  assertStorageSize(template);
  return template;
}

export function parseLoiTemplates(value: unknown): LoiTemplate[] {
  assertStorageSize(value);
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  const templates = z.array(loiTemplateSchema).max(LOI_TEMPLATE_LIMIT).parse(parsed);
  if (new Set(templates.map((template) => template.id)).size !== templates.length) {
    throw new Error("Saved LOI templates contain a duplicate template identifier.");
  }
  assertStorageSize(templates);
  return templates;
}

export function extractLoiTemplateTerms(terms: LoiTermsV1): LoiTemplateTerms {
  return loiTemplateTermsSchema.parse({
    additionalTerms: terms.additionalTerms,
    // A seller credit is a deal-specific price concession, not a reusable preference.
    costsAndCredits: {
      ...terms.costsAndCredits,
      sellerCreditCents: 0,
      sellerCreditIncluded: false,
      sellerCreditNote: "",
      transferTaxSchedule: undefined,
      // A ULA quote depends on this property's city and price, like the tax schedule.
      closingCostEstimates: terms.costsAndCredits.closingCostEstimates
        ? { ...terms.costsAndCredits.closingCostEstimates, sellerMeasureUlaCents: undefined }
        : undefined,
    },
    hoa: terms.hoa,
    personalProperty: terms.personalProperty,
    possession: terms.possession,
    providers: {
      ...terms.providers,
      title: { ...terms.providers.title, feePayer: terms.providers.title.feePayer ?? (terms.costsAndCredits.closingCostEstimates?.buyerTitleInsuranceCents ? "EACH_OWN" : "SELLER") },
    },
    representation: { commissionAmount: terms.representation.commissionAmount, commissionPayer: terms.representation.commissionPayer },
    timing: terms.timing,
  });
}

export function createLoiTemplate(input: { id: string; name: string; terms: LoiTermsV1; now: string }): LoiTemplate {
  return parseLoiTemplate({
    id: input.id,
    name: input.name,
    schemaVersion: LOI_TEMPLATE_SCHEMA_VERSION,
    createdAt: input.now,
    updatedAt: input.now,
    terms: extractLoiTemplateTerms(input.terms),
  });
}

export function applyLoiTemplate(target: LoiTermsV1, value: LoiTemplate, options: { counter?: boolean } = {}): LoiTermsV1 {
  const template = parseLoiTemplate(value).terms;
  const counter = options.counter === true;
  const baseWarranty = target.costsAndCredits.homeWarranty;
  const proposedWarranty = template.costsAndCredits.homeWarranty;
  const homeWarranty = counter
    ? !baseWarranty.included || !proposedWarranty.included ? baseWarranty : {
      ...baseWarranty,
      maximumCents: proposedWarranty.maximumCents,
      payer: proposedWarranty.payer,
      payerNote: proposedWarranty.payerNote,
      buyerShareCents: proposedWarranty.buyerShareCents,
      sellerShareCents: proposedWarranty.sellerShareCents,
    }
    : proposedWarranty;
  const copied = {
    ...target,
    additionalTerms: counter ? target.additionalTerms : template.additionalTerms,
    costsAndCredits: {
      ...template.costsAndCredits,
      // Templates saved before credits were excluded may still carry one; keep the draft's own credit.
      sellerCreditCents: target.costsAndCredits.sellerCreditCents,
      sellerCreditIncluded: target.costsAndCredits.sellerCreditIncluded,
      sellerCreditNote: target.costsAndCredits.sellerCreditNote,
      homeWarranty,
      // Jurisdiction is specific to this deal; a template cannot assert LA city limits.
      transferTaxSchedule: target.costsAndCredits.transferTaxSchedule,
      closingCostEstimates: template.costsAndCredits.closingCostEstimates
        ? {
          ...template.costsAndCredits.closingCostEstimates,
          otherCostsExcludeItemized: false,
          sellerMeasureUlaCents: target.costsAndCredits.closingCostEstimates?.sellerMeasureUlaCents,
        }
        : undefined,
    },
    hoa: template.hoa,
    personalProperty: template.personalProperty,
    possession: counter && (template.possession.type === "TENANT_REMAINS" || template.possession.type === "OTHER") ? target.possession : template.possession,
    providers: {
      escrow: template.providers.escrow,
      title: counter ? { ...target.providers.title, feePayer: template.providers.title.feePayer ?? target.providers.title.feePayer } : template.providers.title,
    },
    representation: {
      ...target.representation,
      commissionAmount: target.representation.buyerRepresented ? template.representation.commissionAmount : "",
      commissionPayer: target.representation.buyerRepresented ? template.representation.commissionPayer : null,
    },
    timing: {
      ...template.timing,
      loanContingencyDays: target.funding.type === "CASH" ? null : template.timing.loanContingencyDays ?? target.timing.loanContingencyDays,
    },
  };
  // Returning detached terms prevents later draft edits from mutating a saved template.
  // Editable validation and review happen in the actual LOI flow, never on application.
  return structuredClone(copied);
}
