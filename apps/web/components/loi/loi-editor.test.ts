import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import type { LoiTermsV1 } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as validators from "@liber/validators";
import * as editorValues from "./loi-editor-values";
import * as commissionValues from "./commission-amount-value";
import * as moneyInput from "./loi-money-input";
import { loiPresentationInputIds } from "./loi-presentation";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";

// This workspace preserves JSX for Next; compile this component for real SSR assertions.
const editorModule = { exports: {} as { LoiEditor: typeof import("./loi-editor")["LoiEditor"] } };
const nodeRequire = createRequire(import.meta.url);
const compiledEditor = ts.transpileModule(readFileSync(path.resolve("components/loi/loi-editor.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const commissionModule = { exports: {} as { CommissionAmountField: typeof import("./commission-amount-field")["CommissionAmountField"] } };
const compiledCommission = ts.transpileModule(readFileSync(path.resolve("components/loi/commission-amount-field.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "exports", compiledCommission)((id: string) => id === "@liber/validators" ? validators : id === "./commission-amount-value" ? commissionValues : id.endsWith(".css") ? undefined : nodeRequire(id), commissionModule.exports);
new Function("require", "exports", compiledEditor)((id: string) => id === "@liber/validators" ? validators : id === "./loi-editor-values" ? editorValues : id === "./loi-money-input" ? moneyInput : id === "./commission-amount-field" ? commissionModule.exports : nodeRequire(id), editorModule.exports);
const { LoiEditor } = editorModule.exports;

async function editorControlIds() {
  const source = await readFile(path.resolve("components/loi/loi-editor.tsx"), "utf8");
  const sourceFile = ts.createSourceFile("loi-editor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ids = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "id" && node.initializer && ts.isStringLiteral(node.initializer)) {
      ids.add(node.initializer.text);
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sourceFile) === "ContactFields") {
      const idAttribute = node.attributes.properties.find((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "id");
      if (idAttribute?.initializer && ts.isStringLiteral(idAttribute.initializer)) {
        for (const field of ["company", "email", "name", "phone"]) ids.add(`${idAttribute.initializer.text}-${field}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const kind of ["escrow", "title"]) {
    const base = `proposed-${kind}-provider-choice`;
    ids.add(base);
    for (const field of ["company", "email", "name", "phone"]) ids.add(`${base}-${field}`);
  }
  for (const { id } of editorValues.LOI_ITEMIZED_COST_FIELDS) for (const suffix of ["", "-buyer", "-seller"]) ids.add(id + suffix);
  return ids;
}

describe("LOI editor and presentation registry", () => {
  const render = (terms: LoiTermsV1) => renderToStaticMarkup(createElement(LoiEditor, { terms, fieldErrors: {}, preview: validators.previewLoiCalculation(terms), update: () => undefined }));

  it("leaves an absent starter offer price blank and tells the buyer what to enter", () => {
    const html = render({ ...cashTerms, purchasePriceCents: 0 });
    expect(html.match(/<input[^>]*id="loi-price"[^>]*>/)?.[0]).toContain('value=""');
    expect(html).toContain("You can save this draft without an offer price.");
    expect(html).toContain("Enter an offer price to calculate the deposit.");
    expect(validators.loiEditableTermsV1Schema.safeParse({ ...cashTerms, purchasePriceCents: 0 }).success).toBe(false);
  });

  it("offers Buyer, Seller, and Other for warranty and asks legacy each-own drafts to choose a payer", () => {
    for (const payer of ["SELLER", "EACH_OWN"] as const) {
      const html = render({ ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { ...cashTerms.costsAndCredits.homeWarranty, included: true, company: "Fixture", maximumCents: 60000, payer } } });
      const select = html.match(/<select[^>]*id="loi-warranty-payer"[^>]*>[\s\S]*?<\/select>/)?.[0];
      expect(select).toContain('value="BUYER"');
      expect(select).toContain('value="SELLER"');
      expect(select).toContain('value="OTHER"');
      expect(select).not.toContain('value="EACH_OWN"');
      expect(html).not.toContain("For Each pays own or Other");
      if (payer === "EACH_OWN") expect(select).toContain('value="" selected=""');
    }
  });

  it("renders explicit warranty shares and confirms additional costs exclude separately calculated expenses", () => {
    const terms: LoiTermsV1 = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, homeWarranty: { company: "Test", included: true, maximumCents: 600_00, payer: "OTHER", payerNote: "Buyer 200, seller 400", buyerShareCents: 200_00, sellerShareCents: 400_00, specialInclusions: "" }, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 100_00, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" } } };
    const html = render(terms);
    expect(html).toContain("Warranty budget maximum");
    expect(html).toContain('id="loi-warranty-buyer-share"');
    expect(html).toContain('id="loi-warranty-seller-share"');
    expect(html).toContain('id="loi-estimate-other-excludes-itemized"');
    expect(html).toContain("no equal split is assumed");
    expect(render({ ...terms, costsAndCredits: { ...terms.costsAndCredits, homeWarranty: { ...terms.costsAndCredits.homeWarranty, payer: "SELLER" } } })).not.toContain('id="loi-warranty-buyer-share"');
    const noOther = render({ ...terms, costsAndCredits: { ...terms.costsAndCredits, closingCostEstimates: { ...terms.costsAndCredits.closingCostEstimates!, buyerOtherClosingCostsCents: 0 } } });
    expect(noOther).not.toContain('id="loi-estimate-other-excludes-itemized"');
  });

  it("renders customary seller estimates, separate each-own HOA amounts, and only additional personal-property charges", () => {
    const terms: LoiTermsV1 = { ...cashTerms, hoa: { ...cashTerms.hoa, certificateFeePayer: "EACH_OWN" }, personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: ["Washer"] }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "", itemizedCosts: { transferTaxes: { amountCents: 500_00 }, hoaCertificate: { buyerCents: 25_00, sellerCents: 0 }, personalProperty: { amountCents: 0 } } } } };
    const html = render(terms);
    expect(html).toContain("City and county transfer taxes estimate (seller pays)");
    expect(html).toContain('id="loi-estimate-hoa-certificate-buyer"');
    expect(html).toContain('id="loi-estimate-hoa-certificate-seller"');
    expect(html).not.toContain('id="loi-estimate-hoa-certificate"');
    expect(html).not.toContain('id="loi-estimate-hoa-document"');
    expect(html).toContain("Enter 0 when they are already included in the purchase price");
    for (const { inputId, fieldId } of loiPresentationInputIds(terms).filter((field) => field.fieldId.includes(".itemizedCosts."))) expect(html.includes(`id="${inputId}"`), fieldId).toBe(true);
  });

  it("offers death-on-property input only to the seller and shows the seller's answer read-only for a buyer", () => {
    const disclosed: LoiTermsV1 = { ...cashTerms, disclosures: { ...cashTerms.disclosures, deathOnProperty: "YES", deathOnPropertyProvidedBy: "SELLER" } };
    const buyer = render(disclosed);
    expect(buyer).not.toContain('id="loi-disclosure-death"');
    expect(buyer).toContain("provided by seller");
    const seller = renderToStaticMarkup(createElement(LoiEditor, { terms: disclosed, fieldErrors: {}, preview: null, update: () => undefined, viewerRole: "SELLER" }));
    expect(seller).toContain('id="loi-disclosure-death"');
    expect(seller).toContain("Seller disclosure: death on the property");
  });

  it("leaves fee estimates blank, distinguishes zero, and follows the proposed escrow payer", () => {
    const initial = render(cashTerms);
    expect(initial).toContain("$300 base + $1.75 per $1,000");
    expect(initial).toContain('placeholder="Not estimated"');
    expect(initial).not.toContain('id="loi-estimate-buyer-escrow"');
    const updated = render({ ...cashTerms, providers: { ...cashTerms.providers, escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: null, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 300_00, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "2%", note: "Pending quote" } } });
    expect(updated).toContain('id="loi-estimate-buyer-escrow"');
    expect(updated).toContain('id="loi-estimate-seller-escrow"');
    expect(updated).toContain('value="2"');
    expect(updated).toContain('aria-label="Seller agent commission estimate unit"');
    expect(updated).toContain("Pending quote");
  });

  it("shows explicit appraisal and seller-credit questions, revealing details only when selected", () => {
    const without = render({ ...cashTerms, timing: { ...cashTerms.timing, appraisalContingencyDays: null } });
    expect(without).toContain('id="loi-appraisal-included"');
    expect(without).toContain('id="loi-credit-included"');
    expect(without).not.toContain('id="loi-appraisal"');
    expect(without).not.toContain('id="loi-credit"');
    const withDetails = render({ ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, sellerCreditIncluded: true, sellerCreditCents: 500_00 } });
    expect(withDetails).toContain('id="loi-appraisal"');
    expect(withDetails).toContain('id="loi-credit"');
    expect(withDetails).toContain("Reason for seller credit (optional)");
  });

  it("keeps a legacy HOA payer readable but requires a supported choice in the editor", () => {
    const html = render({ ...cashTerms, hoa: { ...cashTerms.hoa, documentFeePayer: "EACH_OWN" } });
    const select = html.match(/<select[^>]*id="hoa-document-fee-payer"[^>]*>[\s\S]*?<\/select>/)?.[0];
    expect(select).toContain("Choose who pays");
    expect(select).not.toContain('value="EACH_OWN"');
    expect(select).toContain('value="SELLER"');
  });

  it("shows the specific payer questions when an old noncustomary draft is reopened", () => {
    const html = render({ ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, customaryClosingCosts: false, alternateClosingCostAllocation: "Previously saved allocation" } });
    expect(html).toContain('id="loi-transfer-tax-payer"');
    expect(html).toContain('id="loi-retrofit-payer"');
    expect(html).toContain("smoke detectors, and CO detectors");
    expect(html).toContain("Previously saved allocation");
  });

  it("shows Seller in both locked payer dropdowns for recommended customary costs", () => {
    const html = render(cashTerms);
    for (const id of ["loi-transfer-tax-payer", "loi-retrofit-payer"]) {
      const select = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0];
      expect(select).toContain('value="SELLER" selected=""');
    }
    expect(html).toMatch(/<fieldset[^>]*disabled=""[^>]*>\s*<div class="field"><label for="loi-transfer-tax-payer"/);
  });

  it("offers title insurance payer separately from the locked counter provider", () => {
    const html = renderToStaticMarkup(createElement(LoiEditor, { terms: cashTerms, mode: "COUNTER", fieldErrors: {}, preview: null, update: () => undefined }));
    const select = html.match(/<select[^>]*id="loi-title-fee-payer"[^>]*>[\s\S]*?<\/select>/)?.[0];
    expect(select).toContain('value="SELLER" selected=""');
    expect(select).toContain('value="BUYER"');
    expect(select).toContain('value="EACH_OWN"');
    expect(html).toContain('id="loi-escrow-fee-payer"');
    expect(html).toMatch(/<\/fieldset>\s*<div class="field"><label for="loi-title-fee-payer"/);
  });

  it("offers other financed loans under the existing evidence-gated financing fields", () => {
    const html = render({ ...financedTerms, funding: { ...financedTerms.funding as Extract<LoiTermsV1["funding"], { type: "FINANCED" }>, loanType: "OTHER", note: "Bridge loan" } });
    expect(html).toContain("Other financed loan");
    expect(html).toContain("Other loan type (required)");
    expect(html).toContain('id="loi-lender-company"');
    expect(html).toContain("current pre-approval badge");
  });

  it("asks for amortization treatment and preserves the term input for interest-only financing", () => {
    const funding = { amortizationMonths: null, annualInterestBps: 600, balloonMonth: null, cashDownPaymentCents: 20_000_000, interestOnly: true, note: "", principalCents: 80_000_000, termMonths: 360, type: "SELLER_FINANCING" as const };
    const interestOnly = render({ ...cashTerms, funding });
    expect(interestOnly).toContain("Amortization treatment");
    expect(interestOnly).toContain("Fully amortized");
    expect(interestOnly).toContain('id="loi-sf-term"');
    expect(interestOnly).not.toContain('id="loi-sf-amortization"');
    expect(render({ ...cashTerms, funding: { ...funding, interestOnly: false, amortizationMonths: 360 } })).toContain('id="loi-sf-amortization"');
  });

  it("binds every visible presentation field to an exact rendered control id", async () => {
    const variants: LoiTermsV1[] = [
      cashTerms,
      financedTerms,
      {
        ...cashTerms,
        costsAndCredits: {
          alternateClosingCostAllocation: "Buyer pays title; seller pays escrow.",
          customaryClosingCosts: false,
          homeWarranty: { company: "Warranty Test", included: true, maximumCents: 75_00, payer: "OTHER", payerNote: "Split evenly.", specialInclusions: "" },
          sellerCreditCents: 50_00,
          sellerCreditNote: "Applied at closing.",
        },
        deposit: { amountCents: 10_000_00, basis: "FIXED" },
        funding: { amortizationMonths: 360, annualInterestBps: 600, balloonMonth: 60, cashDownPaymentCents: 25_000_000, interestOnly: false, note: "Test note", principalCents: 75_000_000, termMonths: 120, type: "SELLER_FINANCING" },
        personalProperty: { excludedItems: "Artwork", included: true, includedItems: ["Refrigerator"], payer: "SELLER" },
        possession: { amountCents: 5_000, days: 7, frequency: "DAILY", type: "SELLER_RENT_BACK" },
        providers: {
          escrow: { choice: "CUSTOM", company: { company: "Escrow Test", email: "escrow@example.test", name: "Agent One", phone: "555-0100" }, feePayer: "SELLER" },
          title: { choice: "CUSTOM", company: { company: "Title Test", email: "title@example.test", name: "Agent Two", phone: "555-0200" } },
        },
        representation: { agent: { company: "Broker Test", email: "agent@example.test", license: "", name: "Agent Test", phone: "555-0300" }, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "SELLER" },
      },
      { ...cashTerms, possession: { daysAfterClosing: 3, type: "DAYS_AFTER_CLOSING" } },
      { ...cashTerms, possession: { estoppelRequired: true, note: "Tenant lease remains in place.", type: "TENANT_REMAINS" } },
      { ...cashTerms, possession: { note: "Possession by separate written agreement.", type: "OTHER" } },
    ];
    const editorIds = await editorControlIds();

    for (const terms of variants) {
      for (const field of loiPresentationInputIds(terms)) {
        expect(editorIds.has(field.inputId), `${field.fieldId} should bind to #${field.inputId}`).toBe(true);
      }
    }
  });
});
