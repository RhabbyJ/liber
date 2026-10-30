import { describe, expect, it } from "vitest";
import type { PublicBuyerPreviewDTO, SellerBadgeDTO, SellerBuyerSummaryDTO } from "./buyer-dtos";
import {
  needChips, previewCardView, previewSignals, seekingChip, sellerCardView, sellerSignals, splitPublicIdentity, updatedLabel, wantChips,
} from "./buyer-card-view";
import { TEST_PREAPPROVAL_LABEL } from "./test-preapproval";

const badge = (type: SellerBadgeDTO["type"], expiresInDays?: number): SellerBadgeDTO => ({ type, label: type, status: "active", expiresInDays });
const seller = (overrides: Partial<SellerBuyerSummaryDTO> = {}): SellerBuyerSummaryDTO => ({
  avatarSeed: "seed", badges: [], bio: "", budgetMax: 1_100_000, budgetMin: 800_000, canInvite: true, city: "Los Angeles", criteria: [],
  criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME", bedroomsMin: 3, bathroomsMin: 2, squareFeetMin: 1500, condition: "Mild fixer", features: ["Pool", "ADU"] }],
  downPaymentMax: 200_000, downPaymentMin: 150_000, id: "buyer-route-id", isDemo: false, lat: 0, lng: 0, location: "Northridge, CA",
  marketSlug: "los-angeles", name: "Jules P. #7C4E2A91B6D0", needs: [], propertySubtypes: ["HOME"], purpose: "House", refreshedAt: "2026-10-26",
  serviceAreaSlug: "northridge", state: "CA", type: "Conventional financing", visibility: "active", wants: [], ...overrides,
});
const preview = (overrides: Partial<PublicBuyerPreviewDTO> = {}): PublicBuyerPreviewDTO => ({
  alias: "Noor S. #0A1B2C3D4E5F", amenities: ["Yard"], area: "Reseda, CA", avatarVariant: "pine", badges: [], bathroomsMin: 2, bedroomsMin: 3,
  budgetLabel: "$650K–$900K", condition: "Move-in ready", label: "Condo", ...overrides,
});
const labels = (signals: { label: string }[]) => signals.map((signal) => signal.label);

describe("buyer card view", () => {
  it("splits the public label into name and account code, keeping legacy labels whole", () => {
    expect(splitPublicIdentity("Jules P. #7C4E2A91B6D0")).toEqual({ name: "Jules P.", code: "#7C4E2A91B6D0" });
    expect(splitPublicIdentity("Member")).toEqual({ name: "Member", code: undefined });
  });

  it("describes what and how much home the buyer wants with feature icons", () => {
    expect(seekingChip("Townhouse")).toEqual({ icon: "townhouse", label: "Seeking a townhouse" });
    expect(seekingChip("buyer")).toEqual({ icon: "home", label: "Buyer demand" });
    expect(needChips({ bedroomsMin: 1, bathroomsMin: 2, squareFeetMin: 1500 })).toEqual([
      { icon: "bed", label: "1+ bed" }, { icon: "bath", label: "2+ baths" }, { icon: "ruler", label: "1,500+ sqft" },
    ]);
    expect(needChips({ lotSizeMin: 7200 })).toEqual([{ icon: "land", label: "7,200+ sqft lot" }]);
    expect(wantChips("Fixer", ["Pool", "Parking", "Garage", "ADU", "Yard", "pool", "Fireplace"])).toEqual([
      { icon: "wrench", label: "Fixer" }, { icon: "pool", label: "Pool" }, { icon: "car", label: "Parking" }, { icon: "car", label: "Garage" },
      { icon: "adu", label: "ADU" }, { icon: "tree", label: "Yard" }, { icon: "tag", label: "Fireplace" },
    ]);
  });

  it("orders public trust signals and never shows a test or demo marker as verified", () => {
    expect(labels(previewSignals(["Pre-approved", "Cash buyer", "Verified funds", "ID verified"])))
      .toEqual(["Pre-approval verified", "Cash buyer · funds verified", "ID verified"]);
    const test = previewSignals([TEST_PREAPPROVAL_LABEL, "Demo buyer"]);
    expect(test).toEqual([{ icon: "info", label: TEST_PREAPPROVAL_LABEL, tone: "test" }]);
    expect(previewSignals([])).toEqual([{ icon: "shield", label: "Not verified yet", tone: "unverified" }]);
  });

  it("shows sellers the financing method, down payment, expiry, and every active badge", () => {
    expect(labels(sellerSignals(seller({ badges: [badge("PRE_APPROVED", 30), badge("VERIFIED_IDENTITY"), badge("TEST_PRE_APPROVED")] }))))
      .toEqual(["Financed · $150K – $200K down", "Pre-approved · expires in 30 days", "ID verified", TEST_PREAPPROVAL_LABEL]);
    expect(labels(sellerSignals(seller({ type: "Cash", badges: [badge("CASH_BUYER"), badge("VERIFIED_FUNDS")] }))))
      .toEqual(["Cash purchase", "Cash buyer · funds verified"]);
    expect(sellerSignals(seller()).at(-1)).toEqual({ icon: "shield", label: "Not pre-approved", tone: "unverified" });
    expect(labels(sellerSignals(seller({ type: "", downPaymentMin: 0, downPaymentMax: 0 })))).toEqual(["Not verified yet"]);
    const testOnly = sellerSignals(seller({ badges: [badge("TEST_PRE_APPROVED")] }));
    expect(testOnly.filter((signal) => signal.icon === "check-shield")).toEqual([]);
  });

  it("labels profile freshness by calendar day and drops unknown dates", () => {
    const now = new Date("2026-10-29T15:00:00Z");
    expect(updatedLabel("2026-10-29", now)).toBe("Updated today");
    expect(updatedLabel("2026-10-28", now)).toBe("Updated yesterday");
    expect(updatedLabel("2026-10-26", now)).toBe("Updated 3 days ago");
    expect(updatedLabel("2026-09-29", now)).toBe("Updated 4 weeks ago");
    expect(updatedLabel("2026-01-29", now)).toBe("Updated 9 months ago");
    expect(updatedLabel("", now)).toBeUndefined();
    expect(updatedLabel("2026-11-02", now)).toBeUndefined();
  });

  it("builds the guest card only from preview fields, with no profile link", () => {
    const view = previewCardView(preview({ badges: ["Demo buyer"] }));
    expect(view).toMatchObject({
      ariaLabel: "Demo buyer Noor S. #0A1B2C3D4E5F: seeking a condo near Reseda, CA",
      budget: "$650K–$900K", code: "#0A1B2C3D4E5F", isDemo: true, name: "Noor S.",
      seeking: { icon: "condo", label: "Seeking a condo" },
      wants: [{ icon: "sparkle", label: "Move-in ready" }, { icon: "tree", label: "Yard" }],
    });
    expect(view.href).toBeUndefined();
    expect(view.updated).toBeUndefined();
  });

  it("links the approved-seller card to the profile and shows freshness", () => {
    const view = sellerCardView(seller({ isDemo: true }), new Date("2026-10-29T15:00:00Z"));
    expect(view).toMatchObject({
      ariaLabel: "View demo buyer Jules P. #7C4E2A91B6D0 buyer profile", area: "Northridge, CA", budget: "$800K – $1.1M",
      href: "/buyers/buyer-route-id", updated: "Updated 3 days ago",
      wants: [{ icon: "wrench", label: "Mild fixer" }, { icon: "pool", label: "Pool" }, { icon: "adu", label: "ADU" }],
    });
    expect(sellerCardView(seller({ location: "" })).area).toBe("Liber service area");
  });
});
