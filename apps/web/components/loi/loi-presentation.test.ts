import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { calculateLoiSummary, type LoiComputedSummary } from "@liber/validators";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";
import {
  formatLoiMoney,
  formatLoiPercentage,
  formatLoiDateTime,
  loiSummaryRows,
  loiTermSections,
  loiPresentationInputIds,
  loiInputIdForNormalizedErrors,
  loiRevisionHeading,
  normalizeLoiFieldErrors,
  normalizePropertyIdentity,
  recalculatedDiffs,
  semanticTermDiffs,
} from "./loi-presentation";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";

describe("LOI date hydration", () => {
  const dates = [
    "2026-01-15T19:00:00.000Z",
    "2026-07-16T19:00:00.000Z",
    "2026-03-08T09:59:00.000Z",
    "2026-03-08T10:00:00.000Z",
    "2026-11-01T08:59:00.000Z",
    "2026-11-01T09:00:00.000Z",
    "2026-07-16T00:30:00.000+09:00",
    "",
    "not-a-date",
    "2026-13-01T19:00:00.000Z",
  ];
  const expected = [
    "January 15, 2026 at 11:00 AM PST",
    "July 16, 2026 at 12:00 PM PDT",
    "March 8, 2026 at 1:59 AM PST",
    "March 8, 2026 at 3:00 AM PDT",
    "November 1, 2026 at 1:59 AM PDT",
    "November 1, 2026 at 1:00 AM PST",
    "July 15, 2026 at 8:30 AM PDT",
    "Date unavailable",
    "Date unavailable",
    "Date unavailable",
  ];

  // Separate processes exercise the actual host timezone, including on Windows.
  const compiledValues = transpileModule(readFileSync(new URL("./loi-editor-values.ts", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText.replace(/^import .*\r?$/gm, "").replace(/^export /gm, "");
  const compiledModule = compiledValues + transpileModule(
    readFileSync(new URL("./loi-presentation.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } },
  ).outputText.replace(/^import \{[^\n]+\} from "(?:\.\/loi-editor-values|@liber\/validators)";\r?$/gm, "");

  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])("keeps timestamps, DST, and invalid-date fallback stable on a %s host", (hostTimeZone) => {
    const output = execFileSync(process.execPath, ["--input-type=module", "-"], {
      encoding: "utf8",
      env: { ...process.env, TZ: hostTimeZone },
      input: `${compiledModule}\nprocess.stdout.write(JSON.stringify({ hostTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, values: ${JSON.stringify(dates)}.map(formatLoiDateTime) }));`,
    });
    expect(JSON.parse(output)).toEqual({ hostTimeZone, values: expected });
  });
});

describe("LOI presentation registry v1", () => {
  it("keeps historical v1 summaries unchanged and labels new estimate assumptions and missing fees", () => {
    const old: LoiComputedSummary = { calculationVersion: 1, earnestMoneyBps: 300, earnestMoneyCents: 30_000_00, effectivePriceAfterSellerCreditCents: 995_000_00, loanAmountCents: 750_000_00, loanToValueBps: 7500, remainingDownPaymentAfterDepositCents: 220_000_00 };
    expect(loiSummaryRows(old)).toHaveLength(6);
    const next = calculateLoiSummary(financedTerms);
    const rows = loiSummaryRows(next);
    expect(rows).toContainEqual(expect.objectContaining({ fieldId: "closingCostEstimateComplete", formattedValue: "Incomplete — missing fees are excluded from the subtotals" }));
    const basis = rows.find((row) => row.fieldId === "closingCostEstimateBasisV6")?.formattedValue;
    expect(basis).toContain("0.25% of the price");
    expect(basis).toContain("Blank buyer misc. closing costs use 0.2% of the price");
    expect(basis).toContain("Closing costs do not include property tax, homeowners insurance, or lender fees.");
    expect(rows.find((row) => row.fieldId === "closingCostEstimateBasisV5")).toBeUndefined();
    expect(rows).toContainEqual(expect.objectContaining({ fieldId: "buyerTotalCashNeededCents", rawValue: next.buyerCashDueAtClosingCents + next.earnestMoneyCents }));
    expect(recalculatedDiffs(old, next)).toContainEqual(expect.objectContaining({ fieldId: "buyerClosingCostsCents", from: "Not calculated in this version" }));
  });

  it("distinguishes server-attributed seller disclosures from legacy answers with no recorded source", () => {
    const legacy = { ...cashTerms, disclosures: { ...cashTerms.disclosures, deathOnProperty: "YES" as const } };
    const rows = (value: typeof legacy) => loiTermSections(value, "BUYER").flatMap((section) => section.rows);
    expect(rows(legacy)).toContainEqual(expect.objectContaining({ fieldId: "disclosures.deathOnPropertyProvidedBy", formattedValue: "Source not recorded" }));
    const current = { ...legacy, disclosures: { ...legacy.disclosures, deathOnPropertyProvidedBy: "SELLER" as const } };
    expect(rows(current)).toContainEqual(expect.objectContaining({ fieldId: "disclosures.deathOnPropertyProvidedBy", formattedValue: "Seller" }));
  });
  it("shows explicit new cost payers in reviews and diffs without inventing them for legacy revisions", () => {
    const updated = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, customaryClosingCosts: false, closingCostPayers: { transferTaxes: "SELLER" as const, governmentRetrofitItems: "SPLIT_EQUALLY" as const }, sellerCreditIncluded: true, sellerCreditCents: 500_00 } };
    const rows = loiTermSections(updated, "SELLER").flatMap((section) => section.rows);
    expect(rows).toContainEqual(expect.objectContaining({ fieldId: "costsAndCredits.closingCostPayers.transferTaxes", formattedValue: "Seller" }));
    expect(rows).toContainEqual(expect.objectContaining({ fieldId: "costsAndCredits.closingCostPayers.governmentRetrofitItems", formattedValue: "Split equally" }));
    expect(semanticTermDiffs(cashTerms, updated, "BUYER")).toContainEqual(expect.objectContaining({ fieldId: "costsAndCredits.closingCostPayers.transferTaxes" }));
    expect(loiTermSections(cashTerms, "BUYER").flatMap((section) => section.rows).some((row) => row.fieldId.includes("closingCostPayers"))).toBe(false);
    expect(loiInputIdForNormalizedErrors({ "costsAndCredits.closingCostPayers.transferTaxes": "Choose who pays." }, updated)).toBe("loi-transfer-tax-payer");
    expect(loiInputIdForNormalizedErrors({ "costsAndCredits.sellerCreditCents": "Choose a seller credit." }, cashTerms)).toBe("loi-credit-included");
  });
  it("presents agent details in their own section and explains each-own escrow fees", () => {
    const sections = loiTermSections({ ...cashTerms, providers: { ...cashTerms.providers, escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } } }, "BUYER");
    expect(sections.find((section) => section.title === "Buyer agent")?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ fieldId: "representation.buyerRepresented" })]));
    expect(sections.find((section) => section.title === "Possession")?.rows.every((row) => row.fieldId.startsWith("possession."))).toBe(true);
    expect(sections.flatMap((section) => section.rows)).toContainEqual(expect.objectContaining({ fieldId: "providers.escrow.feePayer", formattedValue: "Each pays their own" }));
  });
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
        homeWarranty: { company: "Warranty Co", included: true as const, maximumCents: 0, payer: "SELLER" as const, payerNote: "", specialInclusions: "" },
      },
    };
    expect(normalizeLoiFieldErrors({ "costsAndCredits.homeWarranty": "Add the warranty maximum." }, warrantyTerms)).toEqual({
      "costsAndCredits.homeWarranty.maximumCents": "Add the warranty maximum.",
    });

    const representedTerms = {
      ...cashTerms,
      representation: { agent: { company: "Brokerage", email: "", license: "", name: "Agent Name", phone: "" }, buyerRepresented: true as const, commissionAmount: "2.5%", commissionPayer: "SELLER" as const },
    };
    expect(normalizeLoiFieldErrors({ "representation.agent": "Add agent contact details." }, representedTerms)).toEqual({
      "representation.agent.email": "Add agent contact details.",
    });
  });
});

describe("LOI revision heading", () => {
  const named = (sequence: number, buyerLegalName: string) => ({ sequence, terms: { parties: { ...cashTerms.parties, buyerLegalName } } });

  it("shows the seller the first version as an offer from the buyer, and numbers everything else", () => {
    expect(loiRevisionHeading(named(1, "  Jordan Buyer LLC "), "SELLER")).toBe("Offer from Jordan Buyer LLC");
    expect(loiRevisionHeading(named(1, "Jordan Buyer LLC"), "BUYER")).toBe("Submitted version 1");
    expect(loiRevisionHeading(named(2, "Jordan Buyer LLC"), "SELLER")).toBe("Submitted version 2");
    expect(loiRevisionHeading(named(1, "   "), "SELLER")).toBe("Offer from buyer");
  });

  it("keeps markup-like names as plain text for React to escape", () => {
    expect(loiRevisionHeading(named(1, "<img src=x onerror=alert(1)>"), "SELLER")).toBe("Offer from <img src=x onerror=alert(1)>");
  });
});
