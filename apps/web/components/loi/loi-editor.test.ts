import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { LoiTermsV1 } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { loiPresentationInputIds } from "./loi-presentation";
import { cashTerms, financedTerms } from "./loi-test-fixtures.test-helper";

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
  return ids;
}

describe("LOI editor and presentation registry", () => {
  it("binds every visible presentation field to an exact rendered control id", async () => {
    const variants: LoiTermsV1[] = [
      cashTerms,
      financedTerms,
      {
        ...cashTerms,
        costsAndCredits: {
          alternateClosingCostAllocation: "Buyer pays title; seller pays escrow.",
          customaryClosingCosts: false,
          homeWarranty: { company: "Warranty Test", included: true, maximumCents: 75_00, payer: "OTHER", payerNote: "Split evenly." },
          sellerCreditCents: 50_00,
          sellerCreditNote: "Applied at closing.",
        },
        deposit: { amountCents: 10_000_00, basis: "FIXED" },
        funding: { amortizationMonths: 360, annualInterestBps: 600, balloonMonth: 60, cashDownPaymentCents: 25_000_000, interestOnly: false, note: "Test note", principalCents: 75_000_000, termMonths: 120, type: "SELLER_FINANCING" },
        personalProperty: { excludedItems: "Artwork", included: true, includedItems: ["Refrigerator"] },
        possession: { amountCents: 5_000, days: 7, frequency: "DAILY", type: "SELLER_RENT_BACK" },
        providers: {
          escrow: { choice: "CUSTOM", company: { company: "Escrow Test", email: "escrow@example.test", name: "Agent One", phone: "555-0100" } },
          title: { choice: "CUSTOM", company: { company: "Title Test", email: "title@example.test", name: "Agent Two", phone: "555-0200" } },
        },
        representation: { agent: { company: "Broker Test", email: "agent@example.test", name: "Agent Test", phone: "555-0300" }, buyerRepresented: true },
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
