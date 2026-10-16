import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { PublicBuyerPreviewDTO, SellerBuyerSummaryDTO } from "../lib/buyer-dtos";
import * as testPreapprovalLib from "../lib/test-preapproval";

const nativeRequire = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const moduleExports = {};
  const compiled = ts.transpileModule(readFileSync(path.resolve(file), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? nativeRequire(id), moduleExports);
  return moduleExports as T;
}

const shared = {
  "./generated-avatar": { GeneratedAvatar: () => createElement("span") },
  "./icon": { Icon: () => createElement("span") },
  "./property-type-artwork": { PropertyTypeArtwork: () => createElement("img", { alt: "" }) },
  "../lib/listing-format": load("lib/listing-format.ts", {}),
};
const { PublicBuyerPreviewCard } = load<typeof import("./public-buyer-preview-card")>("components/public-buyer-preview-card.tsx", {
  ...shared,
  "../lib/public-demand-highlight": { syncPublicDemandPinHighlights: () => undefined },
  "../lib/test-preapproval": testPreapprovalLib,
});
const { BuyerCard } = load<typeof import("./buyer-card")>("components/buyer-card.tsx", {
  ...shared,
  "next/link": { __esModule: true, default: (props: Record<string, unknown>) => createElement("a", props) },
});

const preview = (badges: string[]): PublicBuyerPreviewDTO => ({
  alias: "Liber D. #0A1B2C3D4E5F", amenities: [], area: "Encino, CA", avatarVariant: "pine", badges, budgetLabel: "$700K–$950K", label: "House",
});
const renderPreview = (badges: string[]) =>
  renderToStaticMarkup(createElement(PublicBuyerPreviewCard, { index: 0, preview: preview(badges) }));

describe("buyer card photo and demo labels", () => {
  it("labels the representative photo on preview cards as a sample", () => {
    expect(renderPreview([])).toContain('<span class="sample-photo-tag">Sample photo</span>');
  });

  it("labels the representative photo on approved seller cards as a sample", () => {
    const buyer = {
      avatarSeed: "seed", badges: [], bio: "", budgetMax: 950_000, budgetMin: 700_000, canInvite: true, city: "Los Angeles", criteria: [],
      criteriaDetails: [], downPaymentMax: 0, downPaymentMin: 0, id: "buyer-route-id", isDemo: false, lat: 0, lng: 0, location: "Encino, CA",
      marketSlug: "los-angeles", name: "Julie P. #7C4E2A91B6D0", needs: [], propertySubtypes: [], purpose: "House", refreshedAt: "Today",
      serviceAreaSlug: "encino", state: "CA", type: "Conventional", visibility: "active", wants: [],
    } satisfies SellerBuyerSummaryDTO;

    expect(renderToStaticMarkup(createElement(BuyerCard, { buyer }))).toContain('<span class="sample-photo-tag">Sample photo</span>');
  });

  it("shows the Demo buyer label first, in the demo style, even beside trust badges", () => {
    const html = renderPreview(["Demo buyer", "Pre-approved", "Verified funds"]);

    expect(html).toContain('<span class="listing-flag demo">Demo buyer</span>');
    expect(html.indexOf("Demo buyer</span>")).toBeLessThan(html.indexOf("Pre-approved</span>"));
    expect(html).not.toContain("Verified funds</span>");
  });

  it("keeps demo and test labels ahead of trust badges in the two photo tags", () => {
    const html = renderPreview(["Pre-approved", "Demo buyer", testPreapprovalLib.TEST_PREAPPROVAL_LABEL]);

    expect(html).toContain('<span class="listing-flag demo">Demo buyer</span>');
    expect(html).toContain(`<span class="listing-flag unverified">${testPreapprovalLib.TEST_PREAPPROVAL_LABEL}</span>`);
    expect(html).not.toContain('class="listing-flag">Pre-approved');
  });

  it("names a demo preview as a demo buyer for screen readers", () => {
    expect(renderPreview(["Demo buyer"])).toContain('aria-label="Demo buyer Liber D. #0A1B2C3D4E5F: ');
    expect(renderPreview([])).toContain('aria-label="Liber D. #0A1B2C3D4E5F: ');
  });
});
