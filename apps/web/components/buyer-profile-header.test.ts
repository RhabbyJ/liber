import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as buyerCardView from "../lib/buyer-card-view";
import type { SellerBadgeDTO, SellerBuyerDetailDTO } from "../lib/buyer-dtos";
import { TEST_PREAPPROVAL_LABEL } from "../lib/test-preapproval";

const nativeRequire = createRequire(import.meta.url);
const moduleExports: { BuyerProfileHeader?: typeof import("./buyer-profile-header")["BuyerProfileHeader"] } = {};
const compiled = ts.transpileModule(readFileSync(path.resolve("components/buyer-profile-header.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mocks: Record<string, unknown> = {
  "../lib/buyer-card-view": buyerCardView,
  "./generated-avatar": { GeneratedAvatar: () => createElement("span", { className: "avatar" }) },
  "./icon": { Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) },
  "./buyer-card.css": {},
};
new Function("require", "exports", compiled)((id: string) => mocks[id] ?? nativeRequire(id), moduleExports);
const { BuyerProfileHeader } = moduleExports as Required<typeof moduleExports>;

const badge = (type: SellerBadgeDTO["type"]): SellerBadgeDTO => ({ type, label: type, status: "active" });
const buyer = (overrides: Partial<SellerBuyerDetailDTO> = {}): SellerBuyerDetailDTO => ({
  avatarSeed: "seed", badges: [], bio: "", budgetMax: 1_100_000, budgetMin: 800_000, canInvite: true, city: "Los Angeles", criteria: [],
  criteriaDetails: [{ propertyCategory: "HOME", propertySubtype: "HOME", bedroomsMin: 3, bathroomsMin: 2, squareFeetMin: 1500, condition: "Mild fixer", features: ["Pool", "ADU"] }],
  downPaymentMax: 200_000, downPaymentMin: 150_000, id: "buyer-route-id", isDemo: false, lat: 0, lng: 0, location: "Northridge, CA",
  marketSlug: "los-angeles", name: "Jules P. #7C4E2A91B6D0", needs: [], propertySubtypes: ["HOME"], purpose: "House", refreshedAt: "2026-10-26",
  serviceAreaSlug: "northridge", state: "CA", type: "Conventional financing", visibility: "active", wants: [], ...overrides,
});
const render = (value: SellerBuyerDetailDTO, areaMapUrl: string | null = null) =>
  renderToStaticMarkup(createElement(BuyerProfileHeader, { areaMapUrl, buyer: value, now: new Date("2026-10-29T15:00:00Z") }));

describe("buyer profile header", () => {
  it("presents the buyer as demand, with no property photo", () => {
    const html = render(buyer({ isDemo: true }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("property-type-artwork");
    expect(html).toContain('<h1 class="hdp-hero-name" id="hdp-buyer-name"><span>Jules P.</span><span class="buyer-card-demo">Demo buyer</span></h1>');
    expect(html).toContain("Account #7C4E2A91B6D0");
    expect(html).toContain("Active buyer · Updated 3 days ago");
    expect(html).toContain("$800K – $1.1M");
    for (const [icon, label] of [["home", "Seeking a house"], ["map-pin", "Northridge, CA"], ["bed", "3+ beds"], ["bath", "2+ baths"], ["ruler", "1,500+ sqft"], ["wrench", "Mild fixer"], ["pool", "Pool"], ["adu", "ADU"]]) {
      expect(html).toContain(`<span data-icon="${icon}"></span>${label}`);
    }
  });

  it("shows financing and verification, keeping test pre-approvals visibly unverified", () => {
    const html = render(buyer({ badges: [badge("TEST_PRE_APPROVED")] }));
    expect(html).toContain("Financed · $150K – $200K down");
    expect(html).toContain(`<li class="buyer-signal test"><span data-icon="info"></span><span>${TEST_PREAPPROVAL_LABEL}</span></li>`);
    expect(html).not.toContain('data-icon="check-shield"');
    expect(render(buyer({ badges: [badge("PRE_APPROVED")] }))).toContain('<li class="buyer-signal verified"><span data-icon="check-shield"></span><span>Pre-approved</span></li>');
  });

  it("uses the approximate-area street tile only when one is available", () => {
    expect(render(buyer(), "https://api.mapbox.com/tile.png")).toContain('<img alt="" class="hdp-hero-map" loading="lazy" src="https://api.mapbox.com/tile.png"/>');
    expect(render(buyer())).toContain('<span data-icon="map-pin"></span><span>Approximate area · Northridge, CA</span>');
  });

  it("is the profile page header, replacing the property artwork", () => {
    const page = readFileSync(path.resolve("app/buyers/[buyerProfileId]/page.tsx"), "utf8");
    expect(page).toContain("<BuyerProfileHeader areaMapUrl={areaMapUrl} buyer={buyer} />");
    expect(page).not.toContain("PropertyTypeArtwork");
  });
});
