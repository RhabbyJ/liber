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
import { loiSellerLedger } from "./loi-seller-ledger";
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
  // True when the element with this id, or a fieldset around it, is disabled in the static markup.
  const isDisabled = (html: string, id: string) => {
    const index = html.indexOf(`id="${id}"`);
    expect(index, id).toBeGreaterThan(-1);
    const open: boolean[] = [];
    for (const match of html.slice(0, index).matchAll(/<fieldset\b([^>]*)>|<\/fieldset>/g)) {
      if (match[0].startsWith("</")) open.pop();
      else open.push(/\sdisabled=""/.test(match[1] ?? ""));
    }
    const tag = html.slice(html.lastIndexOf("<", index), html.indexOf(">", index));
    return open.some(Boolean) || /\sdisabled=""/.test(tag);
  };

  it.each([true, false])("points every seller ledger counter at an editable counter field (customary costs %s)", (customaryClosingCosts) => {
    const terms: LoiTermsV1 = {
      ...cashTerms,
      possession: { type: "SELLER_RENT_BACK", days: 14, amountCents: 300_000, frequency: "THROUGH_ESCROW" },
      hoa: { certificateFeePayer: "SELLER", documentFeePayer: "SELLER", transferFeePayer: "SELLER" },
      personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: ["Washer"], payer: "SELLER" },
      representation: { agent: { company: "", email: "agent@example.test", license: "", name: "Agent", phone: "" }, buyerRepresented: true, commissionAmount: "2%", commissionPayer: "SELLER" },
      costsAndCredits: { ...cashTerms.costsAndCredits, customaryClosingCosts, closingCostPayers: customaryClosingCosts ? undefined : { transferTaxes: "SELLER", governmentRetrofitItems: "SELLER" }, sellerCreditCents: 100_000, sellerCreditIncluded: true, homeWarranty: { company: "Warranty Co", included: true, maximumCents: 60_000, payer: "SELLER", payerNote: "", specialInclusions: "" } },
    };
    const ledger = loiSellerLedger(terms, validators.calculateLoiSummary(terms))!;
    const html = renderToStaticMarkup(createElement(LoiEditor, { terms, counterBaseTerms: terms, mode: "COUNTER", fieldErrors: {}, preview: validators.previewLoiCalculation(terms), update: () => undefined, viewerRole: "SELLER" }));
    const targets = ledger.lines.flatMap((line) => line.counterInputId ? [line.counterInputId] : []);
    expect(targets.length).toBeGreaterThanOrEqual(12);
    for (const id of targets) expect(isDisabled(html, id), id).toBe(false);
    expect(targets).toContain("loi-agent-commission");
  });

  const render = (terms: LoiTermsV1, viewerRole: "BUYER" | "SELLER" = "BUYER") => renderToStaticMarkup(createElement(LoiEditor, { terms, fieldErrors: {}, preview: validators.previewLoiCalculation(terms), update: () => undefined, viewerRole }));

  it("leaves an absent starter offer price blank and tells the buyer what to enter", () => {
    const html = render({ ...cashTerms, purchasePriceCents: 0 });
    expect(html.match(/<input[^>]*id="loi-price"[^>]*>/)?.[0]).toContain('value=""');
    expect(html).toContain("You can save this draft without an offer price.");
    expect(html).toContain("Enter an offer price to calculate the deposit.");
    expect(validators.loiEditableTermsV1Schema.safeParse({ ...cashTerms, purchasePriceCents: 0 }).success).toBe(false);
  });

  it("asks only the seller for a Measure ULA quote and shows scheduled LA City taxes", () => {
    const quoted: LoiTermsV1 = { ...cashTerms, purchasePriceCents: 600_000_000, costsAndCredits: { ...cashTerms.costsAndCredits, transferTaxSchedule: "MANUAL" } };
    expect(render(quoted, "SELLER")).toContain('id="loi-estimate-seller-ula"');
    expect(render(quoted)).not.toContain('id="loi-estimate-seller-ula"');
    const scheduled: LoiTermsV1 = { ...quoted, costsAndCredits: { ...quoted.costsAndCredits, transferTaxSchedule: "LA_CITY_2026_2027" } };
    const seller = render(scheduled, "SELLER");
    expect(seller).not.toContain('id="loi-estimate-seller-ula"');
    expect(seller).toContain("County $6,600.00 · City $27,000.00 · Measure ULA $240,000.00.");
    expect(render(scheduled)).toContain("County $6,600.00 · City $27,000.00. Only for sales inside City of Los Angeles limits.");
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

  it("shows each party only its own itemized costs, with separate each-own HOA shares", () => {
    const terms: LoiTermsV1 = { ...cashTerms, hoa: { ...cashTerms.hoa, certificateFeePayer: "EACH_OWN" }, personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: ["Washer"] }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "", itemizedCosts: { transferTaxes: { amountCents: 500_00 }, hoaCertificate: { buyerCents: 25_00, sellerCents: 0 }, personalProperty: { amountCents: 0 } } } } };
    const buyer = render(terms);
    const seller = render(terms, "SELLER");
    expect(buyer).not.toContain('id="loi-estimate-transfer-taxes"');
    expect(seller).toContain('id="loi-estimate-transfer-taxes"');
    expect(buyer).toContain('id="loi-estimate-hoa-certificate-buyer"');
    expect(buyer).not.toContain('id="loi-estimate-hoa-certificate-seller"');
    expect(seller).toContain('id="loi-estimate-hoa-certificate-seller"');
    for (const html of [buyer, seller]) {
      expect(html).not.toContain('id="loi-estimate-hoa-certificate"');
      expect(html).not.toContain('id="loi-estimate-hoa-document"');
    }
    expect(seller).toContain("Enter 0 if included in the price.");
    for (const { inputId, fieldId } of loiPresentationInputIds(terms).filter((field) => field.fieldId.includes(".itemizedCosts."))) expect(buyer.includes(`id="${inputId}"`) || seller.includes(`id="${inputId}"`), fieldId).toBe(true);
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

  it("shows each party only its own costs, with scheduled estimates as placeholders and the exclusions disclaimer", () => {
    const initial = render(cashTerms);
    expect(initial).not.toContain('id="loi-estimate-buyer-escrow"');
    expect(initial).not.toContain('id="loi-estimate-buyer-title"');
    expect(initial).toContain('placeholder="Est. $2,000.00 · 0.2%"');
    expect(initial).toContain("Closing costs do not include property tax, homeowners insurance, or lender fees.");
    expect(initial).not.toContain('id="loi-estimate-seller-commission"');
    expect(initial).not.toContain('id="loi-estimate-seller-other"');
    const shared: LoiTermsV1 = { ...cashTerms, providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" }, title: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: null, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: 300_00, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "2%", note: "Pending quote" } } };
    const buyer = render(shared);
    expect(buyer.match(/<input[^>]*id="loi-estimate-buyer-escrow"[^>]*>/)?.[0]).not.toContain('value=""');
    expect(buyer).toContain('placeholder="Est. $1,250.00 · 0.25%"');
    expect(buyer).not.toContain('id="loi-estimate-seller-escrow"');
    expect(buyer).not.toContain('id="loi-estimate-seller-commission"');
    expect(buyer).toContain("Pending quote");
    const seller = render(shared, "SELLER");
    expect(seller).toContain('placeholder="Est. $2,050.00"');
    expect(seller.match(/<input[^>]*id="loi-estimate-seller-other"[^>]*>/)?.[0]).toContain('placeholder="Est. $2,000.00 · 0.2%"');
    expect(seller).toContain('id="loi-estimate-seller-commission"');
    expect(seller).toContain('value="2"');
    expect(seller).not.toContain('id="loi-estimate-buyer-escrow"');
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
