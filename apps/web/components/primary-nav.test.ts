import { describe, expect, it } from "vitest";
import { primaryNavItems } from "./primary-nav-items";

describe("primary navigation", () => {
  it("keeps useful guest destinations in the navbar", () => {
    expect(primaryNavItems(false, []).map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/", label: "Demand map" },
      { href: "/signup?role=buyer&next=%2Fbuyer%2Fprofile", label: "For buyers" },
      { href: "/signup?role=seller&next=%2Fseller%2Fsearch", label: "For sellers" },
    ]);
  });

  it("uses distinct action labels for dual-role accounts", () => {
    const labels = primaryNavItems(true, ["BUYER", "SELLER"]).map((item) => item.label);

    expect(labels).toEqual([
      "Demand map",
      "Received invites",
      "Find buyers",
      "Properties",
      "Sent invites",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
