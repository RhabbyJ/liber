import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as validators from "@liber/validators";
import * as workspaceState from "./loi-workspace-state";
import { financedTerms, negotiation, revision } from "./loi-test-fixtures.test-helper";

// Next preserves JSX in this workspace; compile the actual action bar for SSR assertions.
const actionBarModule = { exports: {} as { LoiActionBar: typeof import("./loi-action-bar")["LoiActionBar"] } };
const nodeRequire = createRequire(import.meta.url);
const compiledActionBar = ts.transpileModule(readFileSync(path.resolve("components/loi/loi-action-bar.tsx"), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
new Function("require", "exports", compiledActionBar)((id: string) => id === "@liber/validators" ? validators : id === "./loi-workspace-state" ? workspaceState : nodeRequire(id), actionBarModule.exports);
const { LoiActionBar } = actionBarModule.exports;

type ActionBarProps = ComponentProps<typeof LoiActionBar>;

function reviewProps(overrides: Partial<ActionBarProps> = {}): ActionBarProps {
  const draft = { draftVersion: 1, id: "30000000-0000-4000-8000-000000000000", terms: financedTerms, updatedAt: "2026-10-06T19:00:00.000Z" };
  const current = negotiation({ draft });
  return {
    negotiation: current,
    view: { ...workspaceState.editingLoiViewState(current), mode: "REVIEWING" },
    pending: null,
    onCurrent: () => undefined,
    onEdit: () => undefined,
    onReview: () => undefined,
    onSave: () => undefined,
    onDiscard: () => undefined,
    onSubmit: () => undefined,
    onDecision: () => undefined,
    ...overrides,
  };
}

function render(overrides: Partial<ActionBarProps> = {}) {
  return renderToStaticMarkup(createElement(LoiActionBar, reviewProps(overrides)));
}

describe("LOI action bar submission feedback", () => {
  it.each(["BUYER", "SELLER"] as const)("shows completed LOI read-only actions for %s even with stale permissions", (viewerRole) => {
    const completed = negotiation({ viewerRole, status: "TERMS_ALIGNED", currentSequence: 1, revisions: [revision(1)], allowedActions: ["EDIT", "COUNTER", "SUBMIT", "AGREE", "DECLINE", "WITHDRAW"] });
    for (const mode of ["CURRENT", "EDITING", "REVIEWING"] as const) {
      const html = render({ negotiation: completed, view: { ...workspaceState.currentLoiViewState(completed), mode }, onSaveTemplate: () => undefined, onUseTemplate: () => undefined });
      expect(html).toContain("Completed LOI · Read-only");
      expect(html).toContain("Back to messages</a>");
      expect(html).toContain("Save LOI template");
      for (const action of ["Use saved template", "Propose changes", "Back to edit", "Submit LOI", "Submit counter", "Save draft for later", "Agree to terms", "Decline version", "Withdraw LOI"]) expect(html).not.toContain(action);
    }
  });

  it("offers named template actions in More options during edit and review without submitting", () => {
    const props = reviewProps();
    for (const mode of ["EDITING", "REVIEWING"] as const) {
      const html = render({ view: { ...props.view, mode }, onSaveTemplate: () => undefined, onUseTemplate: () => undefined });
      expect(html).toContain("<summary>More options</summary>");
      expect(html).toContain('type="button">Save LOI template</button>');
      expect(html).toContain('type="button">Use saved template</button>');
    }
  });

  it("allows saving a historical template without exposing draft or decision mutations", () => {
    const props = reviewProps();
    const html = render({ view: { ...props.view, mode: "HISTORICAL" }, onSaveTemplate: () => undefined });
    expect(html).toContain("Save LOI template");
    expect(html).not.toContain("Save draft for later");
    expect(html).not.toContain("Withdraw LOI</button>");
    expect(html).not.toContain("Use saved template");
  });
  const financingError = "Financed terms need a current pre-approval badge or an uploaded pre-approval letter.";

  it("shows missing financing evidence beside the review actions and links the buyer to upload", () => {
    const html = render({ error: financingError, financingEvidenceRequired: true });
    expect(html).toContain('aria-label="LOI actions"');
    expect(html).toContain('role="region"');
    expect(html).toContain(`<p class="field-hint invalid" role="alert">${financingError}</p>`);
    expect(html).toContain('href="/buyer/profile#buyer-verification-card"');
    expect(html).toContain("Upload pre-approval letter</a>");
    expect(html).toContain("Submit LOI · version 1</button>");
  });

  it("shows the financing error to a seller without linking into the buyer profile", () => {
    const html = render({
      negotiation: negotiation({ allowedActions: ["COUNTER", "SUBMIT"], currentSequence: 1, viewerRole: "SELLER" }),
      error: financingError,
      financingEvidenceRequired: true,
    });
    expect(html).toContain(financingError);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("/buyer/profile");
    expect(html).not.toContain("Upload pre-approval letter");
  });

  it("shows a generic request failure without offering an unrelated evidence upload", () => {
    const error = "The request could not be completed. Your current input remains on this page.";
    const html = render({ error });
    expect(html).toContain(error);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("/buyer/profile");
    expect(html).not.toContain("Upload pre-approval letter");
  });

  it("allows an exact saved review to submit and disables both review controls while submitting", () => {
    const ready = render();
    expect(ready).toContain('aria-busy="false"');
    expect(ready).toContain('type="button">Submit LOI · version 1</button>');
    expect(ready).not.toContain("disabled");

    const busy = render({ pending: "submit" });
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*>Back to edit<\/button>/);
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*>Submitting…<\/button>/);
  });

  it("keeps unsaved or stale reviews from submitting", () => {
    const view = reviewProps().view;
    for (const guardedView of [{ ...view, dirty: true }, { ...view, staleDraft: true }, { ...view, draftVersion: 0 }]) {
      expect(render({ view: guardedView })).toMatch(/<button[^>]*disabled=""[^>]*>Submit LOI · version 1<\/button>/);
    }
  });

  it("replaces submission with the exact conversation link after success", () => {
    const submitted = negotiation({ allowedActions: ["WITHDRAW"], revisions: [revision(1)] });
    const html = render({ negotiation: submitted, view: workspaceState.currentLoiViewState(submitted) });
    expect(html).toContain("LOI submitted");
    expect(html).toContain("Your terms were sent.");
    expect(html).toContain(`href="/messages/${submitted.conversationId}"`);
    expect(html).toContain("Back to messages</a>");
    expect(html).not.toContain("Submit LOI · version");
    expect(html).not.toContain("Upload pre-approval letter");
  });
});
