import { describe, expect, it } from "vitest";
import { cashTerms, financedTerms, negotiation, revision } from "./loi-test-fixtures.test-helper";
import {
  canEditLoi,
  editingLoiViewState,
  currentLoiViewState,
  historicalLoiViewState,
  initialLoiViewState,
  mergeLoiRevisions,
  missingLoiRevisionPredecessorLabel,
  reconcileLoiViewState,
  savedLoiDraftTransition,
} from "./loi-workspace-state";

describe("canonical saved LOI draft transition", () => {
  const savedDraft = {
    draftVersion: 2,
    id: "30000000-0000-4000-8000-000000000001",
    terms: financedTerms,
    updatedAt: "2026-07-16T01:00:00.000Z",
  };
  const previousDraft = { ...savedDraft, draftVersion: 1, terms: cashTerms };

  it.each(["EDITING", "REVIEWING"] as const)("uses the canonical response to enter %s without mutating the request basis", (mode) => {
    const basis = negotiation({ draft: previousDraft });
    const result = savedLoiDraftTransition({ basis, current: basis, draft: savedDraft, mode });
    expect(result).toEqual({
      negotiation: { ...basis, draft: savedDraft },
      view: { dirty: false, draftId: savedDraft.id, draftVersion: 2, mode, selectedRevisionId: null, staleDraft: false, terms: financedTerms },
    });
    expect(basis.draft).toBe(previousDraft);
  });

  it("accepts the first save and a poll that already observed that same save", () => {
    const basis = negotiation();
    const draft = { ...savedDraft, draftVersion: 1 };
    for (const current of [basis, { ...basis, draft }]) {
      expect(savedLoiDraftTransition({ basis, current, draft, mode: "REVIEWING" })?.view)
        .toMatchObject({ mode: "REVIEWING", dirty: false, draftId: draft.id, draftVersion: 1, terms: draft.terms });
    }
  });

  it("accepts an already-polled update and keeps the current counter basis selected", () => {
    const submitted = revision(1);
    const basis = negotiation({ allowedActions: ["COUNTER", "SUBMIT"], draft: previousDraft, revisions: [submitted], viewerRole: "SELLER" });
    const current = { ...basis, draft: savedDraft };
    expect(savedLoiDraftTransition({ basis, current, draft: savedDraft, mode: "REVIEWING" })?.view)
      .toMatchObject({ selectedRevisionId: submitted.id, mode: "REVIEWING", draftVersion: 2 });
  });

  it("rejects a different negotiation, viewer, sequence, revision, or lifecycle basis", () => {
    const first = revision(1);
    const basis = negotiation({ allowedActions: ["COUNTER"], draft: previousDraft, revisions: [first] });
    const changes = [
      { id: "different-negotiation" },
      { viewerRole: "SELLER" as const },
      { currentSequence: 2, revisions: [first, revision(2)] },
      { revisions: [{ ...first, id: "different-current-revision" }] },
      { status: "TERMS_ALIGNED" },
    ];
    for (const change of changes) {
      expect(savedLoiDraftTransition({ basis, current: { ...basis, ...change }, draft: savedDraft, mode: "REVIEWING" })).toBeNull();
    }
  });

  it("rejects lost edit permission and effective expiry even if the canonical identity is unchanged", () => {
    const basis = negotiation({ draft: previousDraft });
    for (const change of [{ allowedActions: [] }, { allowedActions: ["WITHDRAW"] }, { effectivelyExpired: true }]) {
      expect(savedLoiDraftTransition({ basis, current: { ...basis, ...change }, draft: savedDraft, mode: "REVIEWING" })).toBeNull();
    }
    const unavailableBasis = { ...basis, allowedActions: [] };
    expect(savedLoiDraftTransition({ basis: unavailableBasis, current: basis, draft: savedDraft, mode: "EDITING" })).toBeNull();
  });

  it("rejects a delayed result older than the current saved draft", () => {
    const basis = negotiation({ draft: previousDraft });
    const current = { ...basis, draft: { ...savedDraft, draftVersion: 3, terms: cashTerms } };
    expect(savedLoiDraftTransition({ basis, current, draft: savedDraft, mode: "REVIEWING" })).toBeNull();
    expect(current.draft.draftVersion).toBe(3);
  });

  it("rejects same-version mismatched identity and a deleted/recreated draft even when the delayed version is higher", () => {
    const basis = negotiation({ draft: previousDraft });
    const replacement = { ...previousDraft, id: "30000000-0000-4000-8000-000000000002" };
    expect(savedLoiDraftTransition({ basis, current: basis, draft: { ...replacement, draftVersion: 1 }, mode: "REVIEWING" })).toBeNull();
    expect(savedLoiDraftTransition({ basis, current: { ...basis, draft: replacement }, draft: savedDraft, mode: "REVIEWING" })).toBeNull();
    expect(savedLoiDraftTransition({ basis, current: { ...basis, draft: null }, draft: savedDraft, mode: "EDITING" })).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects unusable saved draft version %s", (draftVersion) => {
    const basis = negotiation();
    expect(savedLoiDraftTransition({ basis, current: basis, draft: { ...savedDraft, draftVersion }, mode: "REVIEWING" })).toBeNull();
  });

  it("rejects a missing saved draft identity", () => {
    const basis = negotiation();
    expect(savedLoiDraftTransition({ basis, current: basis, draft: { ...savedDraft, id: " " }, mode: "REVIEWING" })).toBeNull();
  });
});

describe("LOI workspace view-state reconciliation", () => {
  it.each(["BUYER", "SELLER"] as const)("keeps completed terms read-only for %s despite stale draft permissions", (viewerRole) => {
    const final = revision(2);
    const completed = negotiation({ viewerRole, status: "TERMS_ALIGNED", currentSequence: 2, revisions: [revision(1), final], allowedActions: ["EDIT", "COUNTER", "SUBMIT", "AGREE"], draft: { id: "stale", draftVersion: 1, terms: cashTerms, updatedAt: "2026-10-06T19:00:00Z" } });
    expect(canEditLoi(completed)).toBe(false);
    expect(initialLoiViewState(completed)).toMatchObject({ mode: "CURRENT", selectedRevisionId: final.id, terms: null });
    expect(editingLoiViewState(completed)).toEqual(currentLoiViewState(completed));
    const before = { ...completed, status: "AWAITING_SELLER_RESPONSE" };
    const editing = editingLoiViewState(before);
    expect(reconcileLoiViewState({ ...editing, dirty: true, mode: "REVIEWING" }, before, completed)).toEqual(currentLoiViewState(completed));
    expect(initialLoiViewState({ ...completed, draft: null })).toEqual(currentLoiViewState(completed));
  });

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
