import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as buyerCardView from "../lib/buyer-card-view";
import type { PublicBuyerPreviewDTO, SellerBuyerSummaryDTO } from "../lib/buyer-dtos";

const nativeRequire = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const moduleExports = {};
  const compiled = ts.transpileModule(readFileSync(path.resolve(file), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? nativeRequire(id), moduleExports);
  return moduleExports as T;
}

const { BuyerDemandCard } = load<typeof import("./buyer-demand-card")>("components/buyer-demand-card.tsx", {
  "next/link": { __esModule: true, default: (props: Record<string, unknown>) => createElement("a", props) },
  "../lib/buyer-card-view": buyerCardView,
  "./generated-avatar": { GeneratedAvatar: () => createElement("span", { className: "avatar" }) },
  "./icon": { Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) },
  "./buyer-card.css": {},
});
const { PublicBuyerPreviewCard } = load<typeof import("./public-buyer-preview-card")>("components/public-buyer-preview-card.tsx", {
  "../lib/buyer-card-view": buyerCardView,
  "../lib/public-demand-highlight": { syncPublicDemandPinHighlights: () => undefined },
  "./buyer-demand-card": { BuyerDemandCard },
});
const { BuyerCard } = load<typeof import("./buyer-card")>("components/buyer-card.tsx", {
  "../lib/buyer-card-view": buyerCardView,
  "./buyer-demand-card": { BuyerDemandCard },
});

const preview = (badges: string[], overrides: Partial<PublicBuyerPreviewDTO> = {}): PublicBuyerPreviewDTO => ({
  alias: "Liber D. #0A1B2C3D4E5F", amenities: ["Pool"], area: "Encino, CA", avatarVariant: "pine", badges, budgetLabel: "$700K–$950K",
  label: "House", ...overrides,
});
const renderPreview = (badges: string[]) =>
  renderToStaticMarkup(createElement(PublicBuyerPreviewCard, { index: 0, preview: preview(badges) }));
const buyer: SellerBuyerSummaryDTO = {
  avatarSeed: "seed", badges: [], bio: "", budgetMax: 950_000, budgetMin: 700_000, canInvite: true, city: "Los Angeles", criteria: [],
  criteriaDetails: [], downPaymentMax: 0, downPaymentMin: 0, id: "buyer-route-id", isDemo: true, lat: 0, lng: 0, location: "Encino, CA",
  marketSlug: "los-angeles", name: "Julie P. #7C4E2A91B6D0", needs: [], propertySubtypes: [], purpose: "House", refreshedAt: "",
  serviceAreaSlug: "encino", state: "CA", type: "Conventional financing", visibility: "active", wants: [],
};

describe("buyer demand cards", () => {
  it("shows buyers as demand, never with a property photo that could read as a listing", () => {
    for (const html of [renderPreview(["Pre-approved"]), renderToStaticMarkup(createElement(BuyerCard, { buyer }))]) {
      expect(html).not.toContain("<img");
      expect(html).not.toContain("Sample photo");
      expect(html).toContain('class="buyer-card');
    }
  });

  it("shows the Demo buyer label beside the name, ahead of every trust signal", () => {
    const html = renderPreview(["Demo buyer", "Pre-approved", "Verified funds"]);
    expect(html).toContain('<span class="buyer-card-demo">Demo buyer</span>');
    expect(html.indexOf("Demo buyer</span>")).toBeLessThan(html.indexOf("Pre-approval verified"));
    expect(html).toContain("Funds verified");
  });

  it("names a demo preview as a demo buyer for screen readers", () => {
    expect(renderPreview(["Demo buyer"])).toContain('aria-label="Demo buyer Liber D. #0A1B2C3D4E5F: ');
    expect(renderPreview([])).toContain('aria-label="Liber D. #0A1B2C3D4E5F: ');
  });

  it("keeps guest previews unlinked and links approved-seller cards to the profile", () => {
    expect(renderPreview(["Pre-approved"])).not.toMatch(/<a[\s>]/);
    const html = renderToStaticMarkup(createElement(BuyerCard, { buyer }));
    expect(html).toContain('href="/buyers/buyer-route-id"');
    expect(html).toContain('aria-label="View demo buyer Julie P. #7C4E2A91B6D0 buyer profile"');
    expect(html).toContain('data-buyer-id="buyer-route-id"');
  });

  it("shows what the buyer wants with feature icons", () => {
    const html = renderToStaticMarkup(createElement(PublicBuyerPreviewCard, {
      index: 0,
      preview: preview([], { bedroomsMin: 3, bathroomsMin: 2, condition: "Fixer", amenities: ["Pool", "ADU"] }),
    }));
    for (const [icon, label] of [["home", "Seeking a house"], ["bed", "3+ beds"], ["bath", "2+ baths"], ["wrench", "Fixer"], ["pool", "Pool"], ["adu", "ADU"]]) {
      expect(html).toContain(`<span data-icon="${icon}"></span>${label}`);
    }
  });
});
