import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { PublicBuyerPreviewDTO, SellerBuyerSummaryDTO, SellerBadgeDTO } from "../lib/buyer-dtos";
import * as buyerCardView from "../lib/buyer-card-view";
import * as testPreapprovalLib from "../lib/test-preapproval";

const nativeRequire = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path.resolve(file), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? nativeRequire(id), exports);
  return exports as T;
}
const icon = { Icon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }) };
const { BadgePill } = load<typeof import("./badge-pill")>("components/badge-pill.tsx", { "./icon": icon });
const { BuyerDemandCard } = load<typeof import("./buyer-demand-card")>("components/buyer-demand-card.tsx", {
  "next/link": { __esModule: true, default: ({ children, ...props }: { children: string }) => createElement("a", props, children) },
  "../lib/buyer-card-view": buyerCardView,
  "./generated-avatar": { GeneratedAvatar: () => createElement("span") },
  "./icon": icon,
  "./buyer-card.css": {},
});
const { BuyerCard } = load<typeof import("./buyer-card")>("components/buyer-card.tsx", {
  "../lib/buyer-card-view": buyerCardView,
  "./buyer-demand-card": { BuyerDemandCard },
});
const testBadge: SellerBadgeDTO = { type: "TEST_PRE_APPROVED", label: "Accidental verified label", status: "active", expiresInDays: 1 };
const realBadge: SellerBadgeDTO = { type: "PRE_APPROVED", label: "Pre-approved", status: "active", expiresInDays: 30 };
const buyer = (badges: SellerBadgeDTO[]): SellerBuyerSummaryDTO => ({
  id: "synthetic-admin-buyer", isDemo: true, avatarSeed: "synthetic", name: "Alex T. #TEST", location: "Los Angeles", city: "Los Angeles", state: "CA",
  type: "Conventional financing", purpose: "House", visibility: "active", budgetMin: 500_000, budgetMax: 1_000_000, downPaymentMin: 100_000,
  downPaymentMax: 200_000, bio: "Synthetic test profile", needs: [], wants: [], badges, criteria: [], criteriaDetails: [], propertySubtypes: [],
  refreshedAt: "", marketSlug: "los-angeles", serviceAreaSlug: "los-angeles", lat: 0, lng: 0, canInvite: false,
});

describe("test pre-approval display", () => {
  it("always labels synthetic badges as unverified and uses an information icon", () => {
    const html = renderToStaticMarkup(createElement(BadgePill, { badge: testBadge }));
    expect(html).toContain("Test pre-approval — not verified");
    expect(html).toContain('class="trust-badge pending"');
    expect(html).toContain('data-icon="info"');
    expect(html).not.toContain("Accidental verified label");
    expect(html).not.toContain("check-shield");
  });
  it("does not claim lender verification on a seller card with only a test badge", () => {
    const html = renderToStaticMarkup(createElement(BuyerCard, { buyer: buyer([testBadge]) }));
    expect(html).toContain('class="buyer-signal test"><span data-icon="info"></span><span>Test pre-approval — not verified</span>');
    expect(html).not.toContain("Accidental verified label");
    expect(html).not.toContain("check-shield");
    expect(html).not.toContain("buyer-signal verified");
  });
  it("preserves real pre-approval and its expiry beside the separate test marker", () => {
    const html = renderToStaticMarkup(createElement(BuyerCard, { buyer: buyer([testBadge, realBadge]) }));
    expect(html).toContain('class="buyer-signal verified"><span data-icon="check-shield"></span><span>Pre-approved · expires in 30 days</span>');
    expect(html).toContain('class="buyer-signal test"');
    expect(html).toContain("Test pre-approval — not verified");
  });
  it("keeps the test marker visible after every verified badge", () => {
    const badges: SellerBadgeDTO[] = [realBadge,
      { type: "VERIFIED_IDENTITY", label: "Identity verified", status: "active" },
      { type: "VERIFIED_FUNDS", label: "Funds verified", status: "active" }, testBadge];
    const html = renderToStaticMarkup(createElement(BuyerCard, { buyer: buyer(badges) }));
    expect(html).toContain("Test pre-approval — not verified");
    expect(html).toContain("Pre-approved");
    expect(html).toContain("Funds verified");
    expect(html).toContain("ID verified");
  });
  it("shows an unverified financed buyer as not pre-approved, with no test marker", () => {
    const html = renderToStaticMarkup(createElement(BuyerCard, { buyer: buyer([]) }));
    expect(html).toContain("Financed · $100K – $200K down");
    expect(html).toContain('class="buyer-signal unverified"><span data-icon="shield"></span><span>Not pre-approved</span>');
    expect(html).not.toContain("Test pre-approval");
  });
});

const { PublicBuyerPreviewCard } = load<typeof import("./public-buyer-preview-card")>("components/public-buyer-preview-card.tsx", {
  "../lib/buyer-card-view": buyerCardView,
  "../lib/public-demand-highlight": { syncPublicDemandPinHighlights: () => undefined },
  "./buyer-demand-card": { BuyerDemandCard },
});
const preview = (badges: string[]): PublicBuyerPreviewDTO => ({
  alias: "Alex T. #TEST", amenities: [], area: "Los Angeles, CA", avatarVariant: "synthetic", badges, budgetLabel: "$500K-$1M", label: "House",
});

describe("public preview test pre-approval display", () => {
  it("labels a test-only or demo-only preview without claiming verified details", () => {
    for (const badges of [[testPreapprovalLib.TEST_PREAPPROVAL_LABEL], ["Demo buyer", testPreapprovalLib.TEST_PREAPPROVAL_LABEL]]) {
      const html = renderToStaticMarkup(createElement(PublicBuyerPreviewCard, { index: 0, preview: preview(badges) }));
      expect(html).toContain('class="buyer-signal test"><span data-icon="info"></span><span>Test pre-approval — not verified</span>');
      expect(html).not.toContain("buyer-signal verified");
      expect(html).not.toContain("check-shield");
    }
  });
  it("keeps the verified look for real verification alongside a test marker", () => {
    const html = renderToStaticMarkup(createElement(PublicBuyerPreviewCard, { index: 0, preview: preview([testPreapprovalLib.TEST_PREAPPROVAL_LABEL, "Pre-approved"]) }));
    expect(html).toContain('class="buyer-signal verified"><span data-icon="check-shield"></span><span>Pre-approval verified</span>');
    expect(html).toContain('class="buyer-signal test"');
  });
});

function renderAdmin(active: boolean, state = { ok: false, message: "" }, pending = false) {
  const { AdminTestPreapproval } = load<typeof import("./admin-test-preapproval")>("components/admin-test-preapproval.tsx", {
    react: { ...nativeRequire("react"), useActionState: () => [state, "/synthetic-action", pending] },
    "next/link": { __esModule: true, default: ({ children, ...props }: { children: string }) => createElement("a", props, children) },
    "./icon": icon,
    "../app/admin/badges/test-actions": { submitSelfTestPreapproval: () => undefined },
  });
  return renderToStaticMarkup(createElement(AdminTestPreapproval, { active, buyerProfileId: "synthetic-self-only" }));
}

describe("admin self test badge controls", () => {
  it("requires an explicit testing acknowledgment and sends no target identity", () => {
    const html = renderAdmin(false);
    expect(html).toContain('name="decision" value="GRANT"');
    expect(html).toMatch(/<input[^>]*required=""[^>]*type="checkbox"[^>]*name="confirmTest"[^>]*value="true"/);
    expect(html).toContain("Give myself a test pre-approval badge");
    expect(html).toContain("expires after 24 hours");
    expect(html).not.toContain('name="buyerProfileId"');
    expect(html).not.toContain('name="userId"');
  });
  it("provides removal for an active test badge without altering real badge actions", () => {
    const html = renderAdmin(true);
    expect(html).toContain('name="decision" value="REVOKE"');
    expect(html).toContain("Remove my test pre-approval badge");
    expect(html).not.toContain('name="confirmTest"');
  });
  it("disables submission while pending and safely presents server feedback", () => {
    const html = renderAdmin(false, { ok: false, message: "Not allowed <script>" }, true);
    expect(html).toContain("Updating test badge…");
    expect(html).toContain('disabled=""');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Not allowed &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
