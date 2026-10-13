import { describe, expect, it } from "vitest";
import { calculateLoiCommissionCents, validLoiCommissionAmount } from "@liber/validators";
import { readCommissionAmount, selectCommissionAmountUnit, writeCommissionAmount } from "./commission-amount-value";

describe("explicit commission units", () => {
  it("preserves the financial meaning of saved percentages and dollar amounts", () => {
    for (const value of ["2.50%", "$10,000.50", "10000", "0%", "$0"]) {
      const saved = writeCommissionAmount(readCommissionAmount(value));
      expect(validLoiCommissionAmount(saved)).toBe(true);
      expect(calculateLoiCommissionCents(saved, 100_000_000)).toBe(calculateLoiCommissionCents(value, 100_000_000));
    }
    expect(readCommissionAmount(" 2.5 % ")).toEqual({ unit: "PERCENT", amount: "2.5" });
    expect(readCommissionAmount("$ 10,000")).toEqual({ unit: "DOLLAR", amount: "10,000" });
  });

  it("persists an unambiguous selected basis for the same numeric input", () => {
    const percent = writeCommissionAmount({ unit: "PERCENT", amount: "2.5" });
    const dollars = writeCommissionAmount({ unit: "DOLLAR", amount: "2.5" });
    expect(percent).toBe("2.5%");
    expect(dollars).toBe("$2.5");
    expect(calculateLoiCommissionCents(percent, 100_000_000)).toBe(2_500_000);
    expect(calculateLoiCommissionCents(dollars, 100_000_000)).toBe(250);
  });

  it("keeps the typed whole amount while a decimal is still being entered", () => {
    expect(writeCommissionAmount({ unit: "PERCENT", amount: "2." })).toBe("2%");
    expect(writeCommissionAmount({ unit: "DOLLAR", amount: "10,000." })).toBe("$10,000");
    expect(calculateLoiCommissionCents(writeCommissionAmount({ unit: "PERCENT", amount: "2." }), 100_000_000)).toBe(2_000_000);
    expect(validLoiCommissionAmount(writeCommissionAmount({ unit: "PERCENT", amount: "." }))).toBe(false);
  });

  it("clears a value when switching basis instead of reinterpreting it", () => {
    const original = { unit: "PERCENT" as const, amount: "2.5" };
    expect(selectCommissionAmountUnit(original, "PERCENT")).toBe(original);
    const switched = selectCommissionAmountUnit(original, "DOLLAR");
    expect(switched).toEqual({ unit: "DOLLAR", amount: "" });
    expect(writeCommissionAmount(switched)).toBe("");
    expect(selectCommissionAmountUnit(switched, "PERCENT").amount).toBe("");
  });

  it("keeps blank estimates unknown while preserving explicit zero", () => {
    for (const unit of ["PERCENT", "DOLLAR"] as const) {
      expect(writeCommissionAmount({ unit, amount: " " })).toBe("");
      expect(calculateLoiCommissionCents(writeCommissionAmount({ unit, amount: "0" }), 100_000_000)).toBe(0);
    }
  });

  it("does not silently reinterpret conflicting pasted notation", () => {
    expect(validLoiCommissionAmount(writeCommissionAmount({ unit: "DOLLAR", amount: "2.5%" }))).toBe(false);
    expect(validLoiCommissionAmount(writeCommissionAmount({ unit: "PERCENT", amount: "$2.5" }))).toBe(false);
    expect(writeCommissionAmount({ unit: "PERCENT", amount: "2.5%" })).toBe("2.5%");
    expect(writeCommissionAmount({ unit: "DOLLAR", amount: "$10,000" })).toBe("$10,000");
  });

  it.each(["100.01", "-1", "2.555", "Infinity", "text"])("preserves server rejection of invalid percentage %s", (amount) => {
    expect(validLoiCommissionAmount(writeCommissionAmount({ unit: "PERCENT", amount }))).toBe(false);
  });
});
