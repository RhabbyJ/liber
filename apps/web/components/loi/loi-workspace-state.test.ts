import { describe, expect, it } from "vitest";
import { cashTerms, financedTerms, negotiation, revision } from "./loi-test-fixtures.test-helper";
import {
  currentLoiViewState,
  historicalLoiViewState,
  initialLoiViewState,
  mergeLoiRevisions,
  missingLoiRevisionPredecessorLabel,
  reconcileLoiViewState,
} from "./loi-workspace-state";

describe("LOI workspace view-state reconciliation", () => {
  it("never opens a terminal sequence-zero negotiation as an editor", () => {
    const terminal = negotiation({ allowedActions: [], starterTerms: null, status: "WITHDRAWN" });
    expect(initialLoiViewState(terminal)).toMatchObject({ mode: "CURRENT", terms: null });
  });

  it("exits editing when the canonical current version changes", () => {
    const first = revision(1, cashTerms);
    const before = negotiation({
      allowedActions: ["AGREE", "COUNTER", "DECLINE"],
      currentSequence: 1,
      revisions: [first],
      starterTerms: null,
      status: "AWAITING_SELLER_RESPONSE",
      viewerRole: "SELLER",
    });
    const editing = { ...initialLoiViewState(before), dirty: true, mode: "EDITING" as const, terms: cashTerms };
    const second = revision(2, financedTerms);
    const after = negotiation({
      allowedActions: ["AGREE", "COUNTER", "DECLINE"],
      currentSequence: 2,
      revisions: [first, second],
      starterTerms: null,
      status: "AWAITING_BUYER_RESPONSE",
      viewerRole: "BUYER",
    });
    expect(reconcileLoiViewState(editing, before, after)).toMatchObject({ mode: "CURRENT", selectedRevisionId: second.id, terms: null });
  });

  it("keeps deliberately pinned history selected when a new counter arrives", () => {
    const first = revision(1, cashTerms);
    const before = negotiation({ allowedActions: ["AGREE", "COUNTER", "DECLINE"], currentSequence: 1, revisions: [first], starterTerms: null, status: "AWAITING_SELLER_RESPONSE", viewerRole: "SELLER" });
    const historical = historicalLoiViewState(currentLoiViewState(before), first.id);
    const second = revision(2, financedTerms);
    const after = negotiation({ allowedActions: ["AGREE", "COUNTER", "DECLINE"], currentSequence: 2, revisions: [first, second], starterTerms: null, status: "AWAITING_BUYER_RESPONSE" });
    expect(reconcileLoiViewState(historical, before, after)).toMatchObject({ mode: "HISTORICAL", selectedRevisionId: first.id });
  });

  it("adopts a newer clean saved draft but protects dirty local input", () => {
    const before = negotiation({ draft: { draftVersion: 1, id: "30000000-0000-4000-8000-000000000001", terms: cashTerms, updatedAt: "2026-07-16T00:00:00.000Z" }, starterTerms: null });
    const clean = initialLoiViewState(before);
    const after = negotiation({ draft: { draftVersion: 2, id: "30000000-0000-4000-8000-000000000001", terms: financedTerms, updatedAt: "2026-07-16T01:00:00.000Z" }, starterTerms: null });
    expect(reconcileLoiViewState(clean, before, after)).toMatchObject({ draftVersion: 2, mode: "EDITING", staleDraft: false, terms: financedTerms });

    const dirty = { ...clean, dirty: true, terms: cashTerms };
    expect(reconcileLoiViewState(dirty, before, after)).toMatchObject({ draftVersion: 1, mode: "EDITING", staleDraft: true, terms: cashTerms });
  });

  it("reconciles a replaced draft identity even when its version number is unchanged", () => {
    const before = negotiation({ draft: { draftVersion: 1, id: "30000000-0000-4000-8000-000000000001", terms: cashTerms, updatedAt: "2026-07-16T00:00:00.000Z" }, starterTerms: null });
    const clean = initialLoiViewState(before);
    const after = negotiation({ draft: { draftVersion: 1, id: "30000000-0000-4000-8000-000000000002", terms: financedTerms, updatedAt: "2026-07-16T01:00:00.000Z" }, starterTerms: null });
    expect(reconcileLoiViewState(clean, before, after)).toMatchObject({ draftId: "30000000-0000-4000-8000-000000000002", staleDraft: false, terms: financedTerms });
    expect(reconcileLoiViewState({ ...clean, dirty: true }, before, after)).toMatchObject({ draftId: "30000000-0000-4000-8000-000000000001", staleDraft: true, terms: cashTerms });
  });

  it("merges paginated and canonical revisions without duplicates", () => {
    const one = revision(1);
    const two = revision(2, financedTerms);
    expect(mergeLoiRevisions([two], [one, { ...two, responseDeadline: "2026-08-02T19:00:00.000Z" }])).toEqual([
      one,
      expect.objectContaining({ id: two.id, responseDeadline: "2026-08-02T19:00:00.000Z" }),
    ]);
  });

  it("does not call a capped revision page's oldest item the initial terms", () => {
    expect(missingLoiRevisionPredecessorLabel(1)).toBe("Initial terms");
    expect(missingLoiRevisionPredecessorLabel(4)).toBe("Load version 3 to compare changes.");
  });
});
