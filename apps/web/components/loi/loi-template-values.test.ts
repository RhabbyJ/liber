import { describe, expect, it } from "vitest";
import { calculateLoiPreview, loiEditableTermsV1Schema, type LoiTermsV1 } from "@liber/validators";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";
import { applyLoiTemplate, createLoiTemplate, extractLoiTemplateTerms, LOI_TEMPLATE_STORAGE_MAX_BYTES, parseLoiTemplate, parseLoiTemplates } from "./loi-template-values";

const templateId = "11111111-1111-4111-8111-111111111111";
const now = "2026-10-06T20:00:00.000Z";
const sourceTerms: LoiTermsV1 = {
  ...financedTerms,
  additionalTerms: { exclusions: "Exclude artwork", proposedTerms: "Use our standard inspection process" },
  parties: { buyerLegalName: "Source private buyer identity", buyerContact: { name: "Source buyer", company: "", email: "source-private@example.test", phone: "" }, vestingNote: "Source vesting" },
  funding: { ...financedTerms.funding as Extract<LoiTermsV1["funding"], { type: "FINANCED" }>, lender: { company: "Source private lender", name: "Source lender", email: "source-lender-private@example.test", phone: "" } },
  disclosures: { condition: "Source property private condition", conditionsOfSale: "Source condition of sale", deathOnProperty: "YES", deathOnPropertyProvidedBy: "SELLER" },
  providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "SELLER" }, title: { choice: "CUSTOM", feePayer: "BUYER", company: { company: "Template title company", email: "title@example.test", name: "Title contact", phone: "" } } },
  costsAndCredits: { ...cashTerms.costsAndCredits, sellerCreditIncluded: true, sellerCreditCents: 500_000, sellerCreditNote: "Closing expenses", homeWarranty: { included: true, company: "Template warranty company", maximumCents: 75_000, payer: "SELLER", payerNote: "", specialInclusions: "Pool coverage" }, closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: 100_000, buyerTitleInsuranceCents: 200_000, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "2%", note: "Reusable estimates; reconfirm", itemizedCosts: { transferTaxes: { amountCents: 0 }, governmentRetrofit: { amountCents: 0 } } } },
  representation: { buyerRepresented: true, agent: { name: "Source private buyer agent", company: "Source private agent company", email: "source-agent-private@example.test", license: "private-license", phone: "" }, commissionAmount: "3%", commissionPayer: "SELLER" },
  timing: { ...financedTerms.timing, closingDays: 45, inspectionContingencyDays: 14, loanContingencyDays: 30 },
};

function template(terms: LoiTermsV1 = sourceTerms) {
  return createLoiTemplate({ id: templateId, name: "Standard offer", terms, now });
}

describe("reusable LOI template values", () => {
  it("stores an explicit subset without buyer, property, price, funding, disclosure, or agent identity", () => {
    const source = { ...sourceTerms, negotiationId: "source-negotiation", propertyId: "source-property", sellerId: "source-seller" };
    const saved = template(source);
    expect(saved).toMatchObject({ id: templateId, name: "Standard offer", schemaVersion: 1, createdAt: now, updatedAt: now });
    const encoded = JSON.stringify(saved);
    for (const excluded of ["source-negotiation", "source-property", "source-seller", "Source private buyer identity", "source-private@example.test", "Source private lender", "source-lender-private@example.test", "Source property private condition", "Source private buyer agent", "source-agent-private@example.test", "private-license"]) expect(encoded).not.toContain(excluded);
    for (const excluded of ["parties", "purchasePriceCents", "funding", "disclosures", "deposit", "agent", "buyerRepresented"]) expect(saved.terms).not.toHaveProperty(excluded);
    expect(saved.terms.representation).toEqual({ commissionAmount: "3%", commissionPayer: "SELLER" });
    expect(saved.terms.providers.title.choice).toBe("CUSTOM");
  });

  it("never saves or reapplies a deal-specific seller credit", () => {
    const saved = template();
    expect(saved.terms.costsAndCredits).toMatchObject({ sellerCreditCents: 0, sellerCreditIncluded: false, sellerCreditNote: "" });
    expect(JSON.stringify(saved)).not.toContain("Closing expenses");
    // Templates stored before this rule still parse, but their credit never replaces the draft's.
    const legacy = parseLoiTemplate({ ...saved, terms: { ...saved.terms, costsAndCredits: { ...saved.terms.costsAndCredits, sellerCreditCents: 500_000, sellerCreditIncluded: true, sellerCreditNote: "Closing expenses" } } });
    const target: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, sellerCreditCents: 120_000, sellerCreditIncluded: true, sellerCreditNote: "Roof repair" } };
    expect(applyLoiTemplate(target, legacy).costsAndCredits).toMatchObject({ sellerCreditCents: 120_000, sellerCreditIncluded: true, sellerCreditNote: "Roof repair" });
    expect(applyLoiTemplate(cashTerms, legacy).costsAndCredits.sellerCreditCents).toBe(0);
  });

  it("applies reusable choices to an initial draft while retaining its identity and financial basis", () => {
    const target: LoiTermsV1 = { ...cashTerms, purchasePriceCents: 200_000_000, parties: { ...cashTerms.parties, buyerLegalName: "Target buyer" }, disclosures: { ...cashTerms.disclosures, deathOnProperty: "NO", deathOnPropertyProvidedBy: "SELLER" } };
    const result = applyLoiTemplate(target, template());
    expect(result.purchasePriceCents).toBe(target.purchasePriceCents);
    for (const key of ["parties", "funding", "disclosures", "deposit"] as const) expect(result[key]).toEqual(target[key]);
    expect(result.representation).toEqual(target.representation);
    expect(result.timing).toMatchObject({ closingDays: 45, inspectionContingencyDays: 14, loanContingencyDays: null });
    expect(result.providers).toEqual(sourceTerms.providers);
    expect(result.additionalTerms).toEqual(sourceTerms.additionalTerms);
    expect(calculateLoiPreview(result)).toMatchObject({ sellerAgentCommissionCents: 4_000_000, buyerHomeWarrantyCents: 0, sellerHomeWarrantyCents: 75_000, buyerClosingCostsCents: 200_000, sellerClosingCostsCents: 4_175_000 });
    expect(loiEditableTermsV1Schema.safeParse(result).success).toBe(true);
  });

  it("reuses commission terms only when the target buyer is represented and retains their agent", () => {
    const target: LoiTermsV1 = { ...cashTerms, representation: { buyerRepresented: true, agent: { company: "Target agency", email: "target-agent@example.test", name: "Target agent", license: "target-license", phone: "" }, commissionAmount: "$100", commissionPayer: "BUYER" } };
    const result = applyLoiTemplate(target, template());
    expect(result.representation).toEqual({ ...target.representation, commissionAmount: "3%", commissionPayer: "SELLER" });
    expect(result.representation.agent).not.toEqual(sourceTerms.representation.agent);
    expect(calculateLoiPreview(result)).toMatchObject({ buyerAgentCommissionCents: 3_000_000, sellerClosingCostsCents: 5_175_000 });
  });

  it("keeps loan contingencies coherent across cash and financed target drafts", () => {
    expect(applyLoiTemplate(cashTerms, template()).timing.loanContingencyDays).toBeNull();
    const savedCash = template(cashTerms);
    expect(applyLoiTemplate(financedTerms, savedCash).timing.loanContingencyDays).toBe(financedTerms.timing.loanContingencyDays);
    expect(applyLoiTemplate(financedTerms, template()).timing.loanContingencyDays).toBe(30);
  });

  it("retains counter title and warranty identity while applying allowed payers and amounts", () => {
    const target: LoiTermsV1 = { ...cashTerms, providers: { ...cashTerms.providers, title: { choice: "CUSTOM", feePayer: "SELLER", company: { name: "Base title contact", company: "Base title company", email: "base-title@example.test", phone: "" } } }, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { included: true, company: "Base warranty company", maximumCents: 50_000, payer: "BUYER", payerNote: "", specialInclusions: "Base HVAC coverage" } } };
    const result = applyLoiTemplate(target, template(), { counter: true });
    expect(result.providers.title).toEqual({ ...target.providers.title, feePayer: "BUYER" });
    expect(result.costsAndCredits.homeWarranty).toMatchObject({ included: true, company: "Base warranty company", specialInclusions: "Base HVAC coverage", maximumCents: 75_000, payer: "SELLER" });
    expect(result.additionalTerms).toEqual(target.additionalTerms);
    expect(result.parties).toEqual(target.parties);
    expect(result.purchasePriceCents).toBe(target.purchasePriceCents);
    expect(calculateLoiPreview(result)).toMatchObject({ buyerClosingCostsCents: 200_000, sellerClosingCostsCents: 2_175_000, sellerHomeWarrantyCents: 75_000 });
  });

  it("materializes historical title allocations so a counter does not hide buyer title estimates", () => {
    const legacy: LoiTermsV1 = { ...sourceTerms, providers: { ...sourceTerms.providers, title: { choice: "LIBER_PREFERRED" } } };
    const saved = template(legacy);
    expect(saved.terms.providers.title.feePayer).toBe("EACH_OWN");
    const target: LoiTermsV1 = { ...cashTerms, providers: { ...cashTerms.providers, title: { choice: "CUSTOM", company: { company: "Base title company", email: "", name: "", phone: "" }, feePayer: "SELLER" } } };
    const applied = applyLoiTemplate(target, saved, { counter: true });
    expect(applied.providers.title).toEqual({ ...target.providers.title, feePayer: "EACH_OWN" });
    expect(calculateLoiPreview(applied)).toMatchObject({ buyerClosingCostsCents: 200_000 });
    expect(template(cashTerms).terms.providers.title.feePayer).toBe("SELLER");
  });

  it("requires fresh Other-cost exclusion confirmation when applying reusable expenses", () => {
    const source: LoiTermsV1 = { ...sourceTerms, costsAndCredits: { ...sourceTerms.costsAndCredits, closingCostEstimates: { ...sourceTerms.costsAndCredits.closingCostEstimates!, sellerOtherClosingCostsCents: 20_000, otherCostsExcludeItemized: true } } };
    const saved = template(source);
    expect(saved.terms.costsAndCredits.closingCostEstimates?.otherCostsExcludeItemized).toBe(true);
    const applied = applyLoiTemplate(cashTerms, saved);
    expect(applied.costsAndCredits.closingCostEstimates?.otherCostsExcludeItemized).toBe(false);
    const checked = loiEditableTermsV1Schema.safeParse(applied);
    expect(checked.success ? [] : checked.error.issues.map((issue) => issue.path.join("."))).toContain("costsAndCredits.closingCostEstimates.otherCostsExcludeItemized");
    expect(calculateLoiPreview(applied)).toMatchObject({ closingCostEstimateComplete: false });
    expect(saved.terms.costsAndCredits.closingCostEstimates?.otherCostsExcludeItemized).toBe(true);
  });

  it.each(["target excludes warranty", "template excludes warranty"])("keeps the counter's base warranty when %s", (scenario) => {
    const target: LoiTermsV1 = scenario === "target excludes warranty" ? cashTerms : { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { included: true, company: "Base company", maximumCents: 50_000, payer: "BUYER", payerNote: "", specialInclusions: "Base coverage" } } };
    const saved = scenario === "target excludes warranty" ? template() : template(cashTerms);
    expect(applyLoiTemplate(target, saved, { counter: true }).costsAndCredits.homeWarranty).toEqual(target.costsAndCredits.homeWarranty);
  });

  it("copies explicit custom warranty shares while keeping a counter's locked warranty details", () => {
    const custom: LoiTermsV1 = { ...sourceTerms, costsAndCredits: { ...sourceTerms.costsAndCredits, homeWarranty: { ...sourceTerms.costsAndCredits.homeWarranty, payer: "OTHER", payerNote: "Buyer and seller contribute stated amounts", buyerShareCents: 25_000, sellerShareCents: 50_000 } } };
    const target: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { ...sourceTerms.costsAndCredits.homeWarranty, company: "Base company" } } };
    const result = applyLoiTemplate(target, template(custom), { counter: true });
    expect(result.costsAndCredits.homeWarranty).toMatchObject({ company: "Base company", payer: "OTHER", buyerShareCents: 25_000, sellerShareCents: 50_000 });
    expect(calculateLoiPreview(result)).toMatchObject({ buyerHomeWarrantyCents: 25_000, sellerHomeWarrantyCents: 50_000 });
  });

  it.each(["TENANT_REMAINS", "OTHER"] as const)("keeps base possession for a disallowed %s counter template", (type) => {
    const source: LoiTermsV1 = { ...sourceTerms, possession: type === "TENANT_REMAINS" ? { type, estoppelRequired: true, note: "Source tenant arrangement" } : { type, note: "Source other arrangement" } };
    const target: LoiTermsV1 = { ...cashTerms, possession: { type: "SELLER_RENT_BACK", amountCents: 100_000, days: 30, frequency: "THROUGH_ESCROW" } };
    expect(applyLoiTemplate(target, template(source), { counter: true }).possession).toEqual(target.possession);
    expect(applyLoiTemplate(target, template(source)).possession).toEqual(source.possession);
  });

  it("keeps target seller-financed principal, lender-independent identity, and deposit unchanged", () => {
    const target: LoiTermsV1 = { ...cashTerms, funding: { type: "SELLER_FINANCING", principalCents: 80_000_000, cashDownPaymentCents: 20_000_000, annualInterestBps: 600, amortizationMonths: 360, balloonMonth: null, interestOnly: false, note: "Base seller note", termMonths: 360 } };
    const result = applyLoiTemplate(target, template(), { counter: true });
    expect(result.funding).toEqual(target.funding);
    expect(result.deposit).toEqual(target.deposit);
    expect(calculateLoiPreview(result)?.loanAmountCents).toBe(80_000_000);
  });

  it("creates a structural template from an incomplete draft without pretending it is ready to submit", () => {
    const unfinished: LoiTermsV1 = { ...cashTerms, purchasePriceCents: 0, parties: { ...cashTerms.parties, buyerLegalName: "" }, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { ...cashTerms.costsAndCredits.homeWarranty, included: true } } };
    expect(() => template(unfinished)).not.toThrow();
    const applied = applyLoiTemplate(cashTerms, template(unfinished));
    expect(loiEditableTermsV1Schema.safeParse(applied).success).toBe(false);
    expect(calculateLoiPreview(applied)).toMatchObject({ closingCostEstimateComplete: false });
  });

  it("rejects legacy Each own warranty with an explicit choice prompt", () => {
    const legacy = { ...sourceTerms, costsAndCredits: { ...sourceTerms.costsAndCredits, homeWarranty: { ...sourceTerms.costsAndCredits.homeWarranty, payer: "EACH_OWN" as const, buyerShareCents: 25_000, sellerShareCents: 50_000 } } };
    expect(() => template(legacy)).toThrow("Choose Buyer, Seller, or Other");
  });

  it("rejects unrecognized identity fields inside stored templates", () => {
    const saved = template();
    for (const forbidden of ["parties", "purchasePriceCents", "funding", "disclosures", "deposit", "negotiationId"]) expect(() => parseLoiTemplate({ ...saved, terms: { ...saved.terms, [forbidden]: {} } })).toThrow();
    expect(() => parseLoiTemplate({ ...saved, terms: { ...saved.terms, representation: { ...saved.terms.representation, agent: sourceTerms.representation.agent } } })).toThrow();
  });

  it("normalizes UUID and names and validates timestamps without imposing a made-up expiry", () => {
    expect(createLoiTemplate({ id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", name: "  Standard offer  ", terms: cashTerms, now }).id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(createLoiTemplate({ id: templateId, name: "  Standard offer  ", terms: cashTerms, now }).name).toBe("Standard offer");
    for (const name of ["", "   ", "x".repeat(81)]) expect(() => createLoiTemplate({ id: templateId, name, terms: cashTerms, now })).toThrow();
    expect(() => createLoiTemplate({ id: "not-a-uuid", name: "Offer", terms: cashTerms, now })).toThrow();
    expect(() => parseLoiTemplate({ ...template(), createdAt: "not a date" })).toThrow();
    expect(() => parseLoiTemplate({ ...template(), updatedAt: "2026-10-05T20:00:00.000Z" })).toThrow();
    expect(() => parseLoiTemplate({ ...template(), createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" })).not.toThrow();
  });

  it("distinguishes an empty collection from corrupt or unsupported stored templates", () => {
    expect(parseLoiTemplates([])).toEqual([]);
    expect(parseLoiTemplates("[]")).toEqual([]);
    expect(parseLoiTemplates(JSON.stringify([template()]))).toEqual([template()]);
    for (const malformed of [undefined, null, {}, "{bad json", [{ ...template(), schemaVersion: 2 }], [{ ...template(), expiresAt: now }]]) expect(() => parseLoiTemplates(malformed)).toThrow();
  });

  it("limits template count, unique identifiers, and total UTF-8 bytes", () => {
    expect(() => parseLoiTemplates([template(), template()])).toThrow("duplicate");
    const tooMany = Array.from({ length: 21 }, (_, index) => ({ ...template(), id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111` }));
    expect(parseLoiTemplates(tooMany.slice(0, 20))).toHaveLength(20);
    expect(() => parseLoiTemplates(tooMany)).toThrow();
    expect(() => parseLoiTemplates(" ".repeat(LOI_TEMPLATE_STORAGE_MAX_BYTES) + "[]")).toThrow("storage limit");
    expect(() => parseLoiTemplates("é".repeat(LOI_TEMPLATE_STORAGE_MAX_BYTES / 2 + 1))).toThrow("storage limit");
  });

  it("rejects malformed reusable money and conditional unions before loading them", () => {
    const saved = template();
    expect(() => parseLoiTemplate({ ...saved, terms: { ...saved.terms, costsAndCredits: { ...saved.terms.costsAndCredits, sellerCreditCents: -1 } } })).toThrow();
    expect(() => parseLoiTemplate({ ...saved, terms: { ...saved.terms, possession: { type: "SELLER_RENT_BACK", days: 30, amountCents: "250", frequency: "MONTHLY" } } })).toThrow();
    expect(() => parseLoiTemplate({ ...saved, terms: { ...saved.terms, providers: { ...saved.terms.providers, escrow: { choice: "UNKNOWN" } } } })).toThrow();
  });

  it("detaches saved values and applied values from their source objects", () => {
    const source = structuredClone(sourceTerms);
    const saved = template(source);
    source.timing.closingDays = 70;
    expect(saved.terms.timing.closingDays).toBe(45);
    const applied = applyLoiTemplate(cashTerms, saved);
    applied.costsAndCredits.homeWarranty.maximumCents = 900_000;
    applied.providers.escrow.feePayer = "BUYER";
    expect(saved.terms.costsAndCredits.homeWarranty.maximumCents).toBe(75_000);
    expect(saved.terms.providers.escrow.feePayer).toBe("SELLER");
    expect(extractLoiTemplateTerms(sourceTerms)).toEqual(saved.terms);
  });
});
