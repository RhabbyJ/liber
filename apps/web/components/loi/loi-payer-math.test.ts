import { calculateLoiPreview, type LoiTermsV1 } from "@liber/validators";
import { describe, expect, it } from "vitest";
import { cashTerms } from "./loi-test-fixtures.test-helper";
import { normalizeLoiItemizedCostPayers, updateLoiEscrowProvider, updateLoiTitleFeePayer, type LoiItemizedCostKey } from "./loi-editor-values";

function completeTerms(): LoiTermsV1 {
  return {
    ...structuredClone(cashTerms),
    providers: { escrow: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" }, title: { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" } },
    costsAndCredits: {
      ...structuredClone(cashTerms.costsAndCredits),
      customaryClosingCosts: false,
      closingCostPayers: { transferTaxes: "SELLER", governmentRetrofitItems: "SELLER" },
      closingCostEstimates: {
        buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0,
        buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "",
        itemizedCosts: { transferTaxes: { amountCents: 0 }, governmentRetrofit: { amountCents: 0 } },
      },
    },
  };
}

function summary(terms: LoiTermsV1) {
  const result = calculateLoiPreview(terms);
  if (!result || result.calculationVersion !== 5) throw new Error("Expected current live financial preview.");
  return result;
}

function expectMovedExpense(before: LoiTermsV1, after: LoiTermsV1, buyerIncrease: number) {
  const previous = summary(before);
  const next = summary(after);
  expect(next.buyerClosingCostsCents - previous.buyerClosingCostsCents).toBe(buyerIncrease);
  expect(next.sellerClosingCostsCents - previous.sellerClosingCostsCents).toBe(-buyerIncrease);
  expect(next.buyerCashDueAtClosingCents - previous.buyerCashDueAtClosingCents).toBe(buyerIncrease);
  expect(next.sellerCashBeforePayoffsCents - previous.sellerCashBeforePayoffsCents).toBe(buyerIncrease);
  expect(next.buyerClosingCostsCents + next.sellerClosingCostsCents).toBe(previous.buyerClosingCostsCents + previous.sellerClosingCostsCents);
}

function setItemizedPayer(terms: LoiTermsV1, key: LoiItemizedCostKey, payer: "BUYER" | "SELLER" | "NOT_APPLICABLE" | "SPLIT_EQUALLY" | "EACH_OWN") {
  const next = structuredClone(terms);
  if (key === "transferTaxes" || key === "governmentRetrofit") {
    if (payer === "EACH_OWN") throw new Error("Taxes and retrofit do not offer each-own allocation.");
    next.costsAndCredits.closingCostPayers![key === "transferTaxes" ? "transferTaxes" : "governmentRetrofitItems"] = payer;
  } else if (key === "personalProperty") {
    if (payer !== "BUYER" && payer !== "SELLER") throw new Error("Personal property uses Buyer or Seller.");
    next.personalProperty.payer = payer;
  } else {
    if (payer === "SPLIT_EQUALLY") throw new Error("HOA does not offer an equal split.");
    next.hoa[key === "hoaDocument" ? "documentFeePayer" : key === "hoaCertificate" ? "certificateFeePayer" : "transferFeePayer"] = payer;
  }
  return normalizeLoiItemizedCostPayers(terms, next);
}

describe("live LOI payer cash math", () => {
  it.each([["2.5%", 2_500_000], ["$12,345.67", 1_234_567]] as const)("moves buyer-agent commission %s between parties exactly once", (commissionAmount, commissionCents) => {
    const seller = completeTerms();
    seller.representation = { ...seller.representation, buyerRepresented: true, commissionAmount, commissionPayer: "SELLER" };
    const buyer = { ...seller, representation: { ...seller.representation, commissionPayer: "BUYER" as const } };
    expect(summary(seller).buyerAgentCommissionCents).toBe(commissionCents);
    expectMovedExpense(seller, buyer, commissionCents);
    expectMovedExpense(buyer, seller, -commissionCents);
  });

  it("recalculates both percent commissions from the edited price while leaving dollar commissions fixed", () => {
    const initial = completeTerms();
    initial.representation = { ...initial.representation, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "BUYER" };
    initial.costsAndCredits.closingCostEstimates!.sellerAgentCommissionAmount = "2%";
    const counter = { ...initial, purchasePriceCents: 110_000_000 };
    expect(summary(counter)).toMatchObject({ buyerAgentCommissionCents: 2_750_000, sellerAgentCommissionCents: 2_200_000, buyerCashDueAtClosingCents: 109_450_000, sellerCashBeforePayoffsCents: 107_800_000 });
    counter.representation = { ...counter.representation, commissionAmount: "$25,000" };
    counter.costsAndCredits = { ...counter.costsAndCredits, closingCostEstimates: { ...counter.costsAndCredits.closingCostEstimates!, sellerAgentCommissionAmount: "$20,000" } };
    expect(summary(counter)).toMatchObject({ buyerAgentCommissionCents: 2_500_000, sellerAgentCommissionCents: 2_000_000, buyerCashDueAtClosingCents: 109_200_000, sellerCashBeforePayoffsCents: 108_000_000 });
  });

  it.each(["BUYER", "SELLER"] as const)("ignores inactive buyer-agent details with a retained %s payer", (commissionPayer) => {
    const terms = completeTerms();
    terms.representation = { ...terms.representation, buyerRepresented: false, commissionAmount: "2.5%", commissionPayer };
    expect(summary(terms)).toMatchObject({ buyerAgentCommissionCents: 0, buyerClosingCostsCents: 0, sellerClosingCostsCents: 0, buyerCashDueAtClosingCents: 97_000_000, sellerCashBeforePayoffsCents: 100_000_000 });
  });

  it.each(["escrow", "title"] as const)("moves the full quoted %s total through Buyer, Seller, and Each Own", (kind) => {
    const initial = completeTerms();
    const estimates = initial.costsAndCredits.closingCostEstimates!;
    if (kind === "escrow") { estimates.buyerEscrowCents = 120_000; estimates.sellerEscrowCents = 140_000; }
    else { estimates.buyerTitleInsuranceCents = 120_000; estimates.sellerTitleInsuranceCents = 140_000; }
    const change = (terms: LoiTermsV1, payer: "BUYER" | "SELLER" | "EACH_OWN") => kind === "escrow"
      ? updateLoiEscrowProvider(terms, { ...terms.providers.escrow, feePayer: payer })
      : updateLoiTitleFeePayer(terms, payer);
    const buyer = change(initial, "BUYER");
    const seller = change(buyer, "SELLER");
    expectMovedExpense(initial, buyer, 140_000);
    expectMovedExpense(buyer, seller, -260_000);
    expect(summary(buyer).closingCostEstimateComplete).toBe(true);
    const separate = change(seller, "EACH_OWN");
    expect(summary(separate).closingCostEstimateComplete).toBe(kind === "escrow");
    expect(summary(separate).buyerClosingCostsCents).toBe(kind === "escrow" ? 205_000 : 0);
    expect(summary(separate).sellerClosingCostsCents).toBe(260_000);
  });

  it.each([
    ["escrow", "BUYER"], ["escrow", "SELLER"], ["title", "BUYER"], ["title", "SELLER"],
  ] as const)("resolves a partial each-own %s quote when %s becomes the sole payer", (kind, payer) => {
    for (const unknownBuyer of [true, false]) {
      const terms = completeTerms();
      const estimates = terms.costsAndCredits.closingCostEstimates!;
      const buyerKey = kind === "escrow" ? "buyerEscrowCents" : "buyerTitleInsuranceCents";
      const sellerKey = kind === "escrow" ? "sellerEscrowCents" : "sellerTitleInsuranceCents";
      estimates[buyerKey] = unknownBuyer ? null : 120_000;
      estimates[sellerKey] = unknownBuyer ? 140_000 : null;
      expect(summary(terms).closingCostEstimateComplete).toBe(kind === "escrow");
      const moved = kind === "escrow"
        ? updateLoiEscrowProvider(terms, { ...terms.providers.escrow, feePayer: payer })
        : updateLoiTitleFeePayer(terms, payer);
      const combined = kind === "escrow" ? 205_000 + (unknownBuyer ? 140_000 : 120_000) : null;
      expect(moved.costsAndCredits.closingCostEstimates).toMatchObject({ [buyerKey]: payer === "BUYER" ? combined : null, [sellerKey]: payer === "SELLER" ? combined : null });
      expect(summary(moved)).toMatchObject({ buyerClosingCostsCents: payer === "BUYER" ? combined ?? 0 : 0, sellerClosingCostsCents: payer === "SELLER" ? combined ?? 0 : 0, closingCostEstimateComplete: kind === "escrow" });

      // Explicit zero establishes the other party owes nothing; it is a full quote.
      estimates[buyerKey] = unknownBuyer ? 0 : 120_000;
      estimates[sellerKey] = unknownBuyer ? 140_000 : 0;
      const complete = kind === "escrow"
        ? updateLoiEscrowProvider(terms, { ...terms.providers.escrow, feePayer: payer })
        : updateLoiTitleFeePayer(terms, payer);
      const total = unknownBuyer ? 140_000 : 120_000;
      expect(summary(complete)).toMatchObject({ buyerClosingCostsCents: payer === "BUYER" ? total : 0, sellerClosingCostsCents: payer === "SELLER" ? total : 0, closingCostEstimateComplete: true });
    }
  });

  it.each(["transferTaxes", "governmentRetrofit", "hoaDocument", "hoaCertificate", "hoaTransfer", "personalProperty"] as const)("moves the %s charge with its payer", (key) => {
    let seller = completeTerms();
    seller.personalProperty = { ...seller.personalProperty, included: true, includedItems: ["Washer"] };
    seller = setItemizedPayer(seller, key, "SELLER");
    seller.costsAndCredits.closingCostEstimates!.itemizedCosts![key] = { amountCents: 12_345 };
    const buyer = setItemizedPayer(seller, key, "BUYER");
    expectMovedExpense(seller, buyer, 12_345);
    expectMovedExpense(buyer, setItemizedPayer(buyer, key, "SELLER"), -12_345);
    expect(summary(buyer)).toMatchObject({ buyerItemizedCostsCents: 12_345, buyerCashDueAtClosingCents: 97_012_345 });
  });

  it.each(["transferTaxes", "governmentRetrofit"] as const)("conserves the odd cent when %s is split equally", (key) => {
    const seller = completeTerms();
    seller.costsAndCredits.closingCostEstimates!.itemizedCosts![key] = { amountCents: 101 };
    const split = setItemizedPayer(seller, key, "SPLIT_EQUALLY");
    expectMovedExpense(seller, split, 51);
    expect(summary(split)).toMatchObject({ buyerItemizedCostsCents: 51, sellerItemizedCostsCents: 50 });
  });

  it.each(["hoaCertificate", "hoaTransfer"] as const)("uses separately entered %s shares instead of inventing an equal split", (key) => {
    const seller = setItemizedPayer(completeTerms(), key, "SELLER");
    seller.costsAndCredits.closingCostEstimates!.itemizedCosts![key] = { amountCents: 90_000 };
    const each = setItemizedPayer(seller, key, "EACH_OWN");
    each.costsAndCredits.closingCostEstimates!.itemizedCosts![key] = { buyerCents: 30_000, sellerCents: 60_000 };
    expectMovedExpense(seller, each, 30_000);
    const buyer = setItemizedPayer(each, key, "BUYER");
    expectMovedExpense(each, buyer, 60_000);
    expect(summary(buyer).buyerItemizedCostsCents).toBe(90_000);
  });

  it("charges the warranty maximum to its selected payer and respects explicit Other shares", () => {
    const seller = completeTerms();
    seller.costsAndCredits.homeWarranty = { ...seller.costsAndCredits.homeWarranty, included: true, maximumCents: 90_000, payer: "SELLER" };
    const buyer = structuredClone(seller);
    buyer.costsAndCredits.homeWarranty.payer = "BUYER";
    expectMovedExpense(seller, buyer, 90_000);
    const other = structuredClone(seller);
    other.costsAndCredits.homeWarranty = { ...other.costsAndCredits.homeWarranty, payer: "OTHER", payerNote: "Buyer $300, seller $600", buyerShareCents: 30_000, sellerShareCents: 60_000 };
    expectMovedExpense(seller, other, 30_000);
    expect(summary(other)).toMatchObject({ buyerHomeWarrantyCents: 30_000, sellerHomeWarrantyCents: 60_000 });
  });

  it("subtracts seller credit and deposit once, then transfers through-escrow rent-back from seller to buyer", () => {
    const terms = completeTerms();
    terms.costsAndCredits.sellerCreditCents = 500_000;
    const baseline = summary(terms);
    expect(baseline).toMatchObject({ earnestMoneyCents: 3_000_000, buyerCashDueAtClosingCents: 96_500_000, sellerCashBeforePayoffsCents: 99_500_000 });
    terms.possession = { type: "SELLER_RENT_BACK", frequency: "THROUGH_ESCROW", amountCents: 200_000, days: 30 };
    expect(summary(terms)).toMatchObject({ buyerCashDueAtClosingCents: 96_300_000, sellerCashBeforePayoffsCents: 99_300_000, sellerClosingCostsCents: 200_000, rentBackAtClosingCents: 200_000 });
    terms.possession = { ...terms.possession, frequency: "MONTHLY" };
    expect(summary(terms)).toMatchObject({ buyerCashDueAtClosingCents: baseline.buyerCashDueAtClosingCents, sellerCashBeforePayoffsCents: baseline.sellerCashBeforePayoffsCents, sellerClosingCostsCents: 0, rentBackAtClosingCents: 0, monthlyRentBackCents: 200_000 });
  });

  it("keeps commission math live while unrelated party fields are unfinished", () => {
    const terms = completeTerms();
    terms.parties.buyerLegalName = "";
    terms.parties.buyerContact.email = "invalid";
    terms.representation = { ...terms.representation, buyerRepresented: true, commissionAmount: "2.5%", commissionPayer: "BUYER" };
    expect(summary(terms)).toMatchObject({ buyerAgentCommissionCents: 2_500_000, buyerCashDueAtClosingCents: 99_500_000 });
  });
});
