import type { LoiTermsV1 } from "@liber/validators";
import type { LoiNegotiation, LoiRevision } from "./loi-types";

export type LoiViewMode = "CURRENT" | "EDITING" | "HISTORICAL" | "REVIEWING";

export type LoiWorkspaceViewState = {
  dirty: boolean;
  draftId: string | null;
  draftVersion: number;
  mode: LoiViewMode;
  selectedRevisionId: string | null;
  staleDraft: boolean;
  terms: LoiTermsV1 | null;
};

export function currentLoiRevision(negotiation: LoiNegotiation) {
  return negotiation.revisions.find((revision) => revision.sequence === negotiation.currentSequence)
    ?? negotiation.revisions.at(-1)
    ?? null;
}

export function canEditLoi(negotiation: LoiNegotiation) {
  return negotiation.allowedActions.includes("EDIT") || negotiation.allowedActions.includes("COUNTER");
}

export function currentLoiViewState(negotiation: LoiNegotiation): LoiWorkspaceViewState {
  return {
    dirty: false,
    draftId: null,
    draftVersion: 0,
    mode: "CURRENT",
    selectedRevisionId: currentLoiRevision(negotiation)?.id ?? null,
    staleDraft: false,
    terms: null,
  };
}

export function initialLoiViewState(negotiation: LoiNegotiation): LoiWorkspaceViewState {
  if (canEditLoi(negotiation) && negotiation.draft) {
    return {
      dirty: false,
      draftId: negotiation.draft.id,
      draftVersion: negotiation.draft.draftVersion,
      mode: "EDITING",
      selectedRevisionId: currentLoiRevision(negotiation)?.id ?? null,
      staleDraft: false,
      terms: negotiation.draft.terms,
    };
  }
  if (negotiation.allowedActions.includes("EDIT") && negotiation.starterTerms) {
    return {
      dirty: true,
      draftId: null,
      draftVersion: 0,
      mode: "EDITING",
      selectedRevisionId: null,
      staleDraft: false,
      terms: negotiation.starterTerms,
    };
  }
  return currentLoiViewState(negotiation);
}

export function editingLoiViewState(negotiation: LoiNegotiation): LoiWorkspaceViewState {
  const current = currentLoiRevision(negotiation);
  if (negotiation.draft) {
    return {
      dirty: false,
      draftId: negotiation.draft.id,
      draftVersion: negotiation.draft.draftVersion,
      mode: "EDITING",
      selectedRevisionId: current?.id ?? null,
      staleDraft: false,
      terms: negotiation.draft.terms,
    };
  }
  const terms = negotiation.currentSequence === 0 ? negotiation.starterTerms : current?.terms ?? null;
  return {
    dirty: Boolean(terms),
    draftId: null,
    draftVersion: 0,
    mode: terms ? "EDITING" : "CURRENT",
    selectedRevisionId: current?.id ?? null,
    staleDraft: false,
    terms,
  };
}

export function historicalLoiViewState(previous: LoiWorkspaceViewState, revisionId: string): LoiWorkspaceViewState {
  return {
    ...previous,
    dirty: false,
    draftId: null,
    draftVersion: 0,
    mode: "HISTORICAL",
    selectedRevisionId: revisionId,
    staleDraft: false,
    terms: null,
  };
}

export function loiCanonicalIdentity(negotiation: LoiNegotiation) {
  const current = currentLoiRevision(negotiation);
  return `${negotiation.currentSequence}:${current?.id ?? "draft"}:${negotiation.status}`;
}

export function reconcileLoiViewState(
  previousState: LoiWorkspaceViewState,
  previousNegotiation: LoiNegotiation,
  nextNegotiation: LoiNegotiation,
): LoiWorkspaceViewState {
  const canonicalChanged = loiCanonicalIdentity(previousNegotiation) !== loiCanonicalIdentity(nextNegotiation);

  if (previousState.mode === "HISTORICAL") {
    return { ...previousState, staleDraft: false, terms: null };
  }

  if ((previousState.mode === "EDITING" || previousState.mode === "REVIEWING") && !canEditLoi(nextNegotiation)) {
    return currentLoiViewState(nextNegotiation);
  }

  if (canonicalChanged) return currentLoiViewState(nextNegotiation);

  if (previousState.mode === "CURRENT") {
    return {
      ...previousState,
      selectedRevisionId: currentLoiRevision(nextNegotiation)?.id ?? null,
    };
  }

  const nextDraftVersion = nextNegotiation.draft?.draftVersion ?? 0;
  const nextDraftId = nextNegotiation.draft?.id ?? null;
  if (nextDraftVersion === previousState.draftVersion && nextDraftId === previousState.draftId) return previousState;

  if (previousState.dirty) {
    return {
      ...previousState,
      mode: "EDITING",
      staleDraft: true,
    };
  }

  if (nextNegotiation.draft) {
    return {
      ...previousState,
      dirty: false,
      draftId: nextNegotiation.draft.id,
      draftVersion: nextNegotiation.draft.draftVersion,
      mode: "EDITING",
      staleDraft: false,
      terms: nextNegotiation.draft.terms,
    };
  }

  return nextNegotiation.allowedActions.includes("EDIT") && nextNegotiation.starterTerms
    ? initialLoiViewState(nextNegotiation)
    : currentLoiViewState(nextNegotiation);
}

export function mergeLoiRevisions(existing: LoiRevision[], incoming: LoiRevision[]) {
  const revisions = new Map(existing.map((revision) => [revision.id, revision]));
  for (const revision of incoming) revisions.set(revision.id, revision);
  return [...revisions.values()].sort((left, right) => left.sequence - right.sequence);
}

export function missingLoiRevisionPredecessorLabel(sequence: number) {
  return sequence === 1 ? "Initial terms" : `Load version ${sequence - 1} to compare changes.`;
}
