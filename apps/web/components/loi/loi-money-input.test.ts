import { describe, expect, it } from "vitest";
import { formatLoiMoneyInput, parseLoiMoneyInput } from "./loi-money-input";

describe("LOI money input", () => {
  it.each([
    ["1,200,000", 120_000_000],
    ["$1,200,000.50", 120_000_050],
    [" $ 450000 ", 45_000_000],
    ["450.", 45_000],
    [".5", 50],
    ["0", 0],
  ] as const)("accepts %j as typed so the calculator updates", (value, cents) => {
    expect(parseLoiMoneyInput(value)).toEqual({ cents, error: null });
  });

  it("keeps blank distinct from zero", () => {
    expect(parseLoiMoneyInput("  ")).toEqual({ cents: null, error: null });
  });

  it.each(["-1", "1e6", "1.001", "12abc", "1 000", "$$5", "100000000.01"])("rejects %j with a message", (value) => {
    const parsed = parseLoiMoneyInput(value);
    expect(parsed.cents).toBeNull();
    expect(parsed.error).toBeTruthy();
  });

  it("formats with thousands separators and shows cents only when present", () => {
    expect(formatLoiMoneyInput(120_000_000)).toBe("1,200,000");
    expect(formatLoiMoneyInput(120_000_050)).toBe("1,200,000.50");
    expect(formatLoiMoneyInput(0)).toBe("0");
    expect(formatLoiMoneyInput(null)).toBe("");
    for (const cents of [1, 99, 45_000_005, 10_000_000_000]) expect(parseLoiMoneyInput(formatLoiMoneyInput(cents)).cents).toBe(cents);
  });
});
