import { describe, expect, it } from "vitest";
import { calculateLoiPreview, loiEditableTermsV1Schema } from "@liber/validators";
import { COMMON_LOI_PROPERTY_ITEMS, formatLoiYears, parseLoiPropertyItems, parseLoiYears, updateLoiEscrowProvider, updateLoiCustomaryAllocation, updateLoiTitleFeePayer, loiTitleFeePayer, normalizeLoiItemizedCostPayers } from "./loi-editor-values";
import { cashTerms } from "./loi-test-fixtures.test-helper";

describe("LOI editable values", () => {
  it("preserves known HOA expenses when moving between an explicit payer and each-own amounts", () => {
    const seller = { ...cashTerms, hoa: { ...cashTerms.hoa, certificateFeePayer: "SELLER" as const }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 0, sellerEscrowCents: 0, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "", itemizedCosts: { hoaCertificate: { amountCents: 150_00 } } } } };
    const each = normalizeLoiItemizedCostPayers(seller, { ...seller, hoa: { ...seller.hoa, certificateFeePayer: "EACH_OWN" } });
    expect(each.costsAndCredits.closingCostEstimates?.itemizedCosts?.hoaCertificate).toEqual({ amountCents: null, buyerCents: null, sellerCents: 150_00 });
    expect(calculateLoiPreview(each)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 150_00 });
    const buyer = normalizeLoiItemizedCostPayers(each, { ...each, hoa: { ...each.hoa, certificateFeePayer: "BUYER" } });
    expect(buyer.costsAndCredits.closingCostEstimates?.itemizedCosts?.hoaCertificate).toEqual({ amountCents: null });
    expect(calculateLoiPreview(buyer)).toMatchObject({ buyerItemizedCostsCents: 0, sellerItemizedCostsCents: 0, closingCostEstimateComplete: false });
    const both = { ...each, costsAndCredits: { ...each.costsAndCredits, closingCostEstimates: { ...each.costsAndCredits.closingCostEstimates!, itemizedCosts: { hoaCertificate: { buyerCents: 50_00, sellerCents: 150_00 } } } } };
    expect(normalizeLoiItemizedCostPayers(both, { ...both, hoa: { ...both.hoa, certificateFeePayer: "SELLER" } }).costsAndCredits.closingCostEstimates?.itemizedCosts?.hoaCertificate).toEqual({ amountCents: 200_00 });
    const unknown = { ...each, costsAndCredits: { ...each.costsAndCredits, closingCostEstimates: { ...each.costsAndCredits.closingCostEstimates!, itemizedCosts: { hoaCertificate: { buyerCents: null, sellerCents: null } } } } };
    expect(normalizeLoiItemizedCostPayers(unknown, { ...unknown, hoa: { ...unknown.hoa, certificateFeePayer: "BUYER" } }).costsAndCredits.closingCostEstimates?.itemizedCosts?.hoaCertificate).toEqual({ amountCents: null });
  });
  it("allocates title fees independently from escrow without losing the entered amount", () => {
    const initial = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: 100_000, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 200_000, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "Synthetic quote" } } };
    const buyer = updateLoiTitleFeePayer(initial, "BUYER");
    expect(buyer.providers.escrow).toEqual(initial.providers.escrow);
    expect(buyer.providers.title.feePayer).toBe("BUYER");
    expect(buyer.costsAndCredits.closingCostEstimates).toMatchObject({ buyerTitleInsuranceCents: 200_000, sellerTitleInsuranceCents: null });
    expect(calculateLoiPreview(buyer)).toMatchObject({ buyerClosingCostsCents: 200_000, sellerClosingCostsCents: 100_000, buyerCashDueAtClosingCents: 97_200_000, sellerCashBeforePayoffsCents: 99_900_000, closingCostEstimateComplete: false });
    const seller = updateLoiTitleFeePayer(buyer, "SELLER");
    expect(calculateLoiPreview(seller)).toMatchObject({ buyerClosingCostsCents: 0, sellerClosingCostsCents: 300_000, sellerCashBeforePayoffsCents: 99_700_000 });
    expect(loiEditableTermsV1Schema.safeParse(seller).success).toBe(true);
    expect(updateLoiTitleFeePayer(seller, "EACH_OWN").costsAndCredits.closingCostEstimates).toEqual(seller.costsAndCredits.closingCostEstimates);
  });

  it("keeps historical title allocations and unknown or zero estimates intact", () => {
    expect(loiTitleFeePayer(cashTerms)).toBe("SELLER");
    expect(updateLoiTitleFeePayer(cashTerms, "BUYER").costsAndCredits.closingCostEstimates).toBeUndefined();
    for (const amount of [null, 0, 123_456]) {
      const estimates = { buyerEscrowCents: null, sellerEscrowCents: 0, buyerTitleInsuranceCents: amount, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "" };
      const legacy = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: estimates } };
      expect(loiTitleFeePayer(legacy)).toBe(amount ? "EACH_OWN" : "SELLER");
      expect(calculateLoiPreview(legacy)).toMatchObject({ buyerClosingCostsCents: amount ?? 0 });
      expect(updateLoiTitleFeePayer(legacy, "SELLER").costsAndCredits.closingCostEstimates).toMatchObject({ buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: amount });
    }
  });

  it("moves escrow fees to the selected payer without dropping or duplicating them", () => {
    const initial = { ...cashTerms, providers: { ...cashTerms.providers, escrow: { choice: "LIBER_PREFERRED" as const, feePayer: "EACH_OWN" as const } }, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: 120_000, sellerEscrowCents: 140_000, buyerTitleInsuranceCents: 0, sellerTitleInsuranceCents: 0, buyerOtherClosingCostsCents: 0, sellerOtherClosingCostsCents: 0, sellerAgentCommissionAmount: "0", note: "Quoted estimate" } } };
    const buyer = updateLoiEscrowProvider(initial, { choice: "LIBER_PREFERRED", feePayer: "BUYER" });
    const seller = updateLoiEscrowProvider(buyer, { choice: "LIBER_PREFERRED", feePayer: "SELLER" });
    expect(buyer.costsAndCredits.closingCostEstimates).toMatchObject({ buyerEscrowCents: 260_000, sellerEscrowCents: null });
    expect(seller.costsAndCredits.closingCostEstimates).toMatchObject({ buyerEscrowCents: null, sellerEscrowCents: 260_000, note: "Quoted estimate" });
    expect(calculateLoiPreview(buyer)).toMatchObject({ buyerClosingCostsCents: 260_000, sellerClosingCostsCents: 0 });
    expect(calculateLoiPreview(seller)).toMatchObject({ buyerClosingCostsCents: 0, sellerClosingCostsCents: 260_000 });
    expect(calculateLoiPreview(seller)).toMatchObject({ sellerCashBeforePayoffsCents: cashTerms.purchasePriceCents - 260_000 });
    expect(calculateLoiPreview(buyer)).toMatchObject({ buyerCashDueAtClosingCents: cashTerms.purchasePriceCents * 0.97 + 260_000 });
    expect(loiEditableTermsV1Schema.safeParse(buyer).success).toBe(true);
    expect(loiEditableTermsV1Schema.safeParse(seller).success).toBe(true);
    const eachOwn = updateLoiEscrowProvider(seller, { choice: "LIBER_PREFERRED", feePayer: "EACH_OWN" });
    expect(eachOwn.costsAndCredits.closingCostEstimates).toEqual(seller.costsAndCredits.closingCostEstimates);
  });

  it("preserves unknown escrow estimates and explicit zero when changing payers", () => {
    expect(updateLoiEscrowProvider(cashTerms, { choice: "LIBER_PREFERRED", feePayer: "BUYER" }).costsAndCredits.closingCostEstimates).toBeUndefined();
    for (const amount of [null, 0]) {
      const original = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, closingCostEstimates: { buyerEscrowCents: null, sellerEscrowCents: amount, buyerTitleInsuranceCents: null, sellerTitleInsuranceCents: null, buyerOtherClosingCostsCents: null, sellerOtherClosingCostsCents: null, sellerAgentCommissionAmount: "", note: "" } } };
      expect(updateLoiEscrowProvider(original, { choice: "LIBER_PREFERRED", feePayer: "BUYER" }).costsAndCredits.closingCostEstimates).toMatchObject({ buyerEscrowCents: amount, sellerEscrowCents: null });
    }
  });

  it("resets recommended allocation to seller without persisting contradictory custom payers", () => {
    const custom = { ...cashTerms, costsAndCredits: { ...cashTerms.costsAndCredits, customaryClosingCosts: false, alternateClosingCostAllocation: "Buyer pays", closingCostPayers: { transferTaxes: "BUYER" as const, governmentRetrofitItems: "SPLIT_EQUALLY" as const } } };
    const recommended = updateLoiCustomaryAllocation(custom, true);
    expect(recommended.costsAndCredits.closingCostPayers).toBeUndefined();
    expect(recommended.costsAndCredits.alternateClosingCostAllocation).toBe("");
    expect(loiEditableTermsV1Schema.safeParse(recommended).success).toBe(true);
    const reopened = updateLoiCustomaryAllocation(recommended, false);
    expect(reopened.costsAndCredits.closingCostPayers).toEqual({ transferTaxes: "SELLER", governmentRetrofitItems: "SELLER" });
    expect(loiEditableTermsV1Schema.safeParse(reopened).success).toBe(true);
    expect(updateLoiCustomaryAllocation(custom, false).costsAndCredits.closingCostPayers).toEqual(custom.costsAndCredits.closingCostPayers);
  });

  it("parses successive comma-separated item edits without truncating items", () => {
    expect(parseLoiPropertyItems("Washer,")).toEqual(["Washer"]);
    expect(parseLoiPropertyItems("Washer, Dryer")).toEqual(["Washer", "Dryer"]);
    expect(parseLoiPropertyItems("  Washer, , Dryer , Microwave  ")).toEqual(["Washer", "Dryer", "Microwave"]);
    const manyItems = Array.from({ length: 51 }, (_, index) => `Item ${index}`);
    const parsed = parseLoiPropertyItems(manyItems.join(", "));
    expect(parsed).toHaveLength(51);
    expect(loiEditableTermsV1Schema.safeParse({ ...cashTerms, personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: parsed } }).success).toBe(false);
  });

  it("offers valid common items that can be saved together", () => {
    expect(loiEditableTermsV1Schema.safeParse({ ...cashTerms, personalProperty: { ...cashTerms.personalProperty, included: true, includedItems: [...COMMON_LOI_PROPERTY_ITEMS] } }).success).toBe(true);
  });

  it("round-trips every supported historical month duration through the years display", () => {
    for (let months = 1; months <= 600; months += 1) expect(parseLoiYears(formatLoiYears(months))).toBe(months);
    expect(parseLoiYears("30")).toBe(360);
    expect(parseLoiYears("2.5")).toBe(30);
    expect(formatLoiYears(null)).toBe("");
  });

  it.each(["", "0", "-1", "50.1", "Infinity", "years", "1.23456"])("rejects invalid year input %j", (value) => {
    expect(parseLoiYears(value)).toBeNull();
  });
});
