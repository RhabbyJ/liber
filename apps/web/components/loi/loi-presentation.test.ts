import { calculateLoiSummary } from "@liber/validators";
import { describe, expect, it } from "vitest";
import {
  formatLoiMoney,
  formatLoiPercentage,
  formatLoiDateTime,
  loiSummaryRows,
  loiTermSections,
  loiPresentationInputIds,
  loiInputIdForNormalizedErrors,
  normalizeLoiFieldErrors,
  normalizePropertyIdentity,
  recalculatedDiffs,
  semanticTermDiffs,
} from "./loi-presentation";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";

describe("LOI presentation registry v1", () => {
  it("uses human labels and excludes schema/calculation metadata", () => {
    const rows = loiTermSections(financedTerms, "SELLER").flatMap((section) => section.rows);
    expect(rows.some((row) => row.label === "Buyer legal or entity name")).toBe(true);
    expect(rows.some((row) => row.label.includes("."))).toBe(false);
    expect(rows.some((row) => row.fieldId === "schemaVersion")).toBe(false);

    const calculated = loiSummaryRows(calculateLoiSummary(financedTerms));
    expect(calculated.some((row) => row.fieldId === "calculationVersion")).toBe(false);
  });

  it("formats cents and basis points as user-facing money and percentages", () => {
    expect(formatLoiMoney(123_456)).toBe("$1,234.56");
    expect(formatLoiPercentage(600)).toBe("6.00%");
    expect(formatLoiDateTime("2026-07-16T19:00:00.000Z")).toMatch(/2026/);
  });

  it("shows old-to-new values when a funding union removes fields", () => {
    const diffs = semanticTermDiffs(financedTerms, cashTerms, "BUYER");
    expect(diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: "funding.type", from: "Financed", to: "Cash" }),
      expect.objectContaining({ fieldId: "funding.downPaymentCents", from: "$250,000.00", to: "Not applicable" }),
      expect.objectContaining({ fieldId: "funding.lender.company", from: "Liber Test Bank", to: "Not applicable" }),
    ]));
  });

  it("keeps recalculated changes separate from proposed-term changes", () => {
    const next = { ...financedTerms, purchasePriceCents: financedTerms.purchasePriceCents + 100_00 };
    const diffs = recalculatedDiffs(calculateLoiSummary(financedTerms), calculateLoiSummary(next));
    expect(diffs.some((diff) => diff.section === "Recalculated values")).toBe(true);
    expect(diffs.some((diff) => diff.label === "Loan amount")).toBe(true);
  });

  it("normalizes immutable property identity and allowlisted field errors", () => {
    expect(normalizePropertyIdentity({ addressLine1: "123 Main St", location: "Los Angeles, CA", propertyIdentityVersion: 4 })).toEqual({
      identityVersion: 4,
      location: "Los Angeles, CA",
      title: "123 Main St",
    });
    expect(normalizeLoiFieldErrors({
      "terms.funding.lender": "A lender name or company is required.",
      "terms.purchasePriceCents": "Purchase price is required.",
      surprise: "Do not expose this.",
    })).toEqual({
      "funding.lender.name": "A lender name or company is required.",
      purchasePriceCents: "Purchase price is required.",
    });
  });

  it("binds conditional presentation fields to the exact editor control", () => {
    const tenantTerms = { ...cashTerms, possession: { estoppelRequired: false, note: "Lease remains in place.", type: "TENANT_REMAINS" as const } };
    const otherTerms = { ...cashTerms, possession: { note: "Possession by separate agreement.", type: "OTHER" as const } };
    const tenantIds = loiPresentationInputIds(tenantTerms);
    const otherIds = loiPresentationInputIds(otherTerms);
    expect(tenantIds).toContainEqual({ fieldId: "possession.tenantNote", inputId: "loi-tenant-note" });
    expect(tenantIds.some((field) => field.inputId === "loi-possession-note")).toBe(false);
    expect(otherIds).toContainEqual({ fieldId: "possession.otherNote", inputId: "loi-possession-note" });
    expect(otherIds.some((field) => field.inputId === "loi-tenant-note")).toBe(false);

    const possessionError = { "possession.note": "Describe the proposed possession terms." };
    expect(loiInputIdForNormalizedErrors(possessionError, tenantTerms)).toBe("loi-tenant-note");
    expect(loiInputIdForNormalizedErrors(possessionError, otherTerms)).toBe("loi-possession-note");

    const warrantyTerms = {
      ...cashTerms,
      costsAndCredits: {
        ...cashTerms.costsAndCredits,
        homeWarranty: { company: "Warranty Co", included: true as const, maximumCents: 0, payer: "SELLER" as const, payerNote: "" },
      },
    };
    expect(normalizeLoiFieldErrors({ "costsAndCredits.homeWarranty": "Add the warranty maximum." }, warrantyTerms)).toEqual({
      "costsAndCredits.homeWarranty.maximumCents": "Add the warranty maximum.",
    });

    const representedTerms = {
      ...cashTerms,
      representation: { agent: { company: "Brokerage", email: "", name: "Agent Name", phone: "" }, buyerRepresented: true as const },
    };
    expect(normalizeLoiFieldErrors({ "representation.agent": "Add agent contact details." }, representedTerms)).toEqual({
      "representation.agent.email": "Add agent contact details.",
    });
  });
});
