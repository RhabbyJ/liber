"use client";

import { calculateLoiPreview, loiTermsV1Schema, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { getMessagingBrowserClient, logMessagingRealtimeJoinStatus } from "../messaging/realtime";
import { LoiEditor, type LoiTermsUpdater } from "./loi-editor";
import {
  formatLoiDateTime,
  formatLoiMoney,
  loiInputIdForNormalizedErrors,
  loiSummaryRows,
  loiTermSections,
  normalizeLoiFieldErrors,
  normalizePropertyIdentity,
  recalculatedDiffs,
  semanticTermDiffs,
  type LoiSemanticDiff,
} from "./loi-presentation";
import {
  canEditLoi,
  currentLoiRevision,
  currentLoiViewState,
  editingLoiViewState,
  historicalLoiViewState,
  initialLoiViewState,
  loiCanonicalIdentity,
  mergeLoiRevisions,
  missingLoiRevisionPredecessorLabel,
  reconcileLoiViewState,
  type LoiWorkspaceViewState,
} from "./loi-workspace-state";
import type { LoiNegotiation, LoiRevision, LoiRevisionPage, LoiRole } from "./loi-types";

type Decision = "agree" | "decline" | "withdraw";
type PendingOperation = Decision | "discard" | "history" | "save" | "submit" | null;
type CanonicalMode = "INITIAL" | "RECONCILE" | "CURRENT";

export function LoiWorkspace({ initialNegotiation }: { initialNegotiation: LoiNegotiation }) {
  const [negotiation, setNegotiation] = useState(initialNegotiation);
  const negotiationRef = useRef(initialNegotiation);
  const [history, setHistory] = useState(() => initialNegotiation.revisions);
  const [historyPageInfo, setHistoryPageInfo] = useState(initialNegotiation.revisionPageInfo);
  const loadedOlderHistory = useRef(false);
  const [view, setView] = useState<LoiWorkspaceViewState>(() => initialLoiViewState(initialNegotiation));
  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [pending, setPending] = useState<PendingOperation>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const fallbackFocus = useRef<HTMLAnchorElement | null>(null);
  const viewHeading = useRef<HTMLHeadingElement | null>(null);
  const actionAttempts = useRef(new Map<string, { id: string; signature: string }>());

  const current = currentLoiRevision(negotiation);
  const selectedRevision = history.find((revision) => revision.id === view.selectedRevisionId) ?? current;
  const displayedRevision = view.mode === "HISTORICAL" ? selectedRevision : current;
  const previousDisplayedRevision = displayedRevision
    ? history.find((revision) => revision.sequence === displayedRevision.sequence - 1) ?? null
    : null;
  const canEdit = canEditLoi(negotiation);

  const localSummary = useMemo(() => {
    return view.terms ? calculateLoiPreview(view.terms) : null;
  }, [view.terms]);

  const sidebarTerms = view.mode === "EDITING" || view.mode === "REVIEWING"
    ? view.terms
    : displayedRevision?.terms ?? null;
  const sidebarSummary = view.mode === "EDITING" || view.mode === "REVIEWING"
    ? localSummary
    : displayedRevision?.computedSummary ?? null;

  const applyCanonical = useCallback((next: LoiNegotiation, mode: CanonicalMode = "RECONCILE") => {
    const previous = negotiationRef.current;
    const canonicalChanged = loiCanonicalIdentity(previous) !== loiCanonicalIdentity(next);
    const shouldRestoreDecisionFocus = document.activeElement instanceof HTMLElement
      && Boolean(document.activeElement.closest(".loi-native-dialog"));
    negotiationRef.current = next;
    setNegotiation(next);
    setHistory((currentHistory) => mergeLoiRevisions(currentHistory, next.revisions));
    if (!loadedOlderHistory.current) setHistoryPageInfo(next.revisionPageInfo);
    setView((currentView) => mode === "CURRENT"
      ? currentLoiViewState(next)
      : mode === "INITIAL" ? initialLoiViewState(next) : reconcileLoiViewState(currentView, previous, next));
    if (canonicalChanged) {
      actionAttempts.current.clear();
      setDecision(null);
      setDecisionError("");
      setFieldErrors({});
      if (mode === "RECONCILE") setNotice("The current LOI state changed. Review the current version before taking another action.");
      if (shouldRestoreDecisionFocus) {
        window.requestAnimationFrame(() => {
          const target = returnFocus.current;
          if (target?.isConnected && !target.matches(":disabled")) target.focus();
          else fallbackFocus.current?.focus();
        });
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    try {
      do {
        refreshQueued.current = false;
        try {
          const result = await request(`/api/loi/negotiations/${initialNegotiation.id}`, { cache: "no-store" }) as LoiNegotiation;
          applyCanonical(result);
          setRefreshError("");
        } catch {
          setRefreshError("The latest LOI state could not be refreshed.");
        }
      } while (refreshQueued.current);
    } finally {
      refreshInFlight.current = false;
    }
  }, [applyCanonical, initialNegotiation.id]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 5_000);
    const recover = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    };
    window.addEventListener("focus", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [refresh]);

  useEffect(() => {
    const client = getMessagingBrowserClient();
    if (!client) return;
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;
    void (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      channel = client.channel(`loi:${initialNegotiation.id}`, { config: { private: true } })
        .on("broadcast", { event: "loi_changed" }, () => void refresh())
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") void refresh();
          else logMessagingRealtimeJoinStatus(status);
        });
    })().catch(() => logMessagingRealtimeJoinStatus("AUTH_ERROR"));
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [initialNegotiation.id, refresh]);

  const updateTerms: LoiTermsUpdater = (fieldPath, next) => {
    setView((currentView) => ({
      ...currentView,
      dirty: true,
      mode: "EDITING",
      staleDraft: false,
      terms: currentView.terms ? next(currentView.terms) : currentView.terms,
    }));
    setFieldErrors((currentErrors) => Object.fromEntries(Object.entries(currentErrors).filter(([path]) => path !== fieldPath && !path.startsWith(`${fieldPath}.`) && !fieldPath.startsWith(`${path}.`))));
    setError("");
    setNotice("");
  };

  async function saveDraft() {
    if (!view.terms || pending) return;
    const validation = loiTermsV1Schema.safeParse(view.terms);
    if (!validation.success) {
      showFieldErrors(normalizeLoiFieldErrors(Object.fromEntries(validation.error.issues.map((issue) => [issue.path.join("."), issue.message])), view.terms));
      setError("Review the highlighted fields. Your private draft remains on this page.");
      return;
    }
    setPending("save");
    setError("");
    setNotice("");
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/draft`, {
        body: JSON.stringify({ expectedDraftVersion: view.draftVersion, expectedSequence: negotiation.currentSequence, terms: validation.data }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }) as { draft: { draftVersion: number; id: string; terms: LoiTermsV1; updatedAt?: string } };
      const updatedNegotiation: LoiNegotiation = {
        ...negotiationRef.current,
        draft: {
          draftVersion: result.draft.draftVersion,
          id: result.draft.id,
          terms: result.draft.terms,
          updatedAt: result.draft.updatedAt ?? new Date().toISOString(),
        },
      };
      negotiationRef.current = updatedNegotiation;
      setNegotiation(updatedNegotiation);
      setView((currentView) => ({ ...currentView, dirty: false, draftId: result.draft.id, draftVersion: result.draft.draftVersion, staleDraft: false, terms: result.draft.terms }));
      setFieldErrors({});
      setNotice("Private draft saved.");
    } catch (requestError) {
      handleMutationError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function submit() {
    if (!view.terms || view.draftVersion < 1 || view.dirty || view.mode !== "REVIEWING" || pending || !canEdit) {
      setError("Review the exact saved draft before submitting it.");
      return;
    }
    const deadlineDate = new Date(deadline);
    if (!validDeadline(deadlineDate)) {
      setError("Choose a response deadline between one hour and 30 days from now.");
      window.requestAnimationFrame(() => document.getElementById("loi-response-deadline")?.focus());
      return;
    }
    const expectedDraftId = view.draftId;
    if (!expectedDraftId || negotiation.draft?.id !== expectedDraftId) {
      setError("The saved private draft identity is unavailable. Refresh before submitting.");
      return;
    }
    const signature = `${negotiation.currentSequence}:${expectedDraftId}:${view.draftVersion}:${deadlineDate.toISOString()}`;
    setPending("submit");
    setError("");
    setNotice("");
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/submit`, {
        body: JSON.stringify({
          clientActionId: actionIdFor("submit", signature),
          expectedDraftId,
          expectedDraftVersion: view.draftVersion,
          expectedSequence: negotiation.currentSequence,
          responseDeadline: deadlineDate.toISOString(),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }) as LoiNegotiation;
      actionAttempts.current.delete("submit");
      applyCanonical(result, "CURRENT");
      setFieldErrors({});
      setNotice(negotiation.currentSequence ? "Counter submitted." : "LOI submitted.");
    } catch (requestError) {
      handleMutationError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function decide(action: "agree" | "decline") {
    const revision = currentLoiRevision(negotiationRef.current);
    if (!revision || pending) return;
    const signature = `${revision.id}:${revision.sequence}`;
    setPending(action);
    setError("");
    setDecisionError("");
    setNotice("");
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/${action}`, {
        body: JSON.stringify({
          clientActionId: actionIdFor(action, signature),
          expectedSequence: revision.sequence,
          revisionId: revision.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }) as LoiNegotiation;
      actionAttempts.current.delete(action);
      applyCanonical(result, "CURRENT");
      closeDecision();
      setNotice(action === "agree" ? `Terms aligned on version ${revision.sequence} for contract preparation.` : `Version ${revision.sequence} declined.`);
    } catch (requestError) {
      handleDecisionError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function withdraw() {
    if (pending) return;
    const revision = currentLoiRevision(negotiationRef.current);
    const signature = `${negotiation.currentSequence}:${revision?.id ?? "draft"}`;
    setPending("withdraw");
    setError("");
    setDecisionError("");
    setNotice("");
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/withdraw`, {
        body: JSON.stringify({
          clientActionId: actionIdFor("withdraw", signature),
          expectedSequence: negotiation.currentSequence,
          revisionId: revision?.id ?? null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }) as LoiNegotiation;
      actionAttempts.current.delete("withdraw");
      applyCanonical(result, "CURRENT");
      closeDecision();
      setNotice("LOI withdrawn.");
    } catch (requestError) {
      handleDecisionError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function discardDraft() {
    if (pending || !canEdit) return;
    const initial = negotiation.currentSequence === 0;
    setPending("discard");
    setError("");
    setNotice("");
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/draft`, {
        body: JSON.stringify({ expectedDraftVersion: view.draftVersion, expectedSequence: negotiation.currentSequence }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      }) as LoiNegotiation;
      applyCanonical(result, initial ? "INITIAL" : "CURRENT");
      setFieldErrors({});
      setNotice(initial ? "Initial draft reset to fresh starter terms." : "Counter draft discarded. The current submitted version is unchanged.");
    } catch (requestError) {
      handleMutationError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function loadOlderHistory() {
    if (pending || !historyPageInfo.hasOlder || historyPageInfo.oldestSequence === null) return;
    setPending("history");
    try {
      const page = await request(`/api/loi/negotiations/${negotiation.id}/revisions?beforeSequence=${historyPageInfo.oldestSequence}`, { cache: "no-store" }) as LoiRevisionPage;
      setHistory((currentHistory) => mergeLoiRevisions(currentHistory, page.revisions));
      setHistoryPageInfo(page.pageInfo);
      loadedOlderHistory.current = true;
      setError("");
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setPending(null);
    }
  }

  function startOrResume() {
    if (!canEdit) return;
    setView(editingLoiViewState(negotiation));
    setFieldErrors({});
    setError("");
    setNotice(negotiation.draft ? "Resumed your saved private draft." : "Started a new private draft from the current terms.");
    focusWorkspaceView();
  }

  function enterReview() {
    if (!view.terms || view.dirty || view.draftVersion < 1 || view.staleDraft || !canEdit) {
      setError("Save the private draft before reviewing it.");
      return;
    }
    if (!validDeadline(new Date(deadline))) setDeadline(defaultDeadline());
    setView((currentView) => ({ ...currentView, mode: "REVIEWING" }));
    setError("");
    focusWorkspaceView();
  }

  function showCurrent() {
    setView(currentLoiViewState(negotiation));
    setError("");
    focusWorkspaceView();
  }

  function showRevision(revision: LoiRevision) {
    if ((view.mode === "EDITING" || view.mode === "REVIEWING") && view.dirty) {
      setError("Save or reset your private draft before viewing submitted history.");
      return;
    }
    if (revision.id === current?.id) {
      showCurrent();
      return;
    }
    setView((currentView) => historicalLoiViewState(currentView, revision.id));
    setError("");
    focusWorkspaceView();
  }

  function reloadCanonicalDraft() {
    setView(editingLoiViewState(negotiation));
    setFieldErrors({});
    setError("");
    setNotice("Loaded the latest saved private draft.");
    focusWorkspaceView();
  }

  function openDecision(next: Decision) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setDecisionError("");
    setDecision(next);
  }

  function closeDecision() {
    setDecision(null);
    setDecisionError("");
    window.requestAnimationFrame(() => {
      const target = returnFocus.current;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
      else fallbackFocus.current?.focus();
    });
  }

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    window.requestAnimationFrame(() => {
      const renderedInvalid = document.querySelector<HTMLElement>("#loi-editor [aria-invalid='true']");
      const fallbackId = loiInputIdForNormalizedErrors(errors, view.terms ?? undefined);
      const target = renderedInvalid ?? (fallbackId ? document.getElementById(fallbackId) : null);
      target?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }

  function handleMutationError(requestError: unknown) {
    if (requestError instanceof LoiRequestError) {
      const normalized = normalizeLoiFieldErrors(requestError.fieldErrors, view.terms ?? undefined);
      if (Object.keys(normalized).length) showFieldErrors(normalized);
    }
    setError(message(requestError));
  }

  function handleDecisionError(requestError: unknown) {
    const nextMessage = decisionMessage(requestError);
    setDecisionError(nextMessage);
    setError("");
  }

  function actionIdFor(kind: string, signature: string) {
    const existing = actionAttempts.current.get(kind);
    if (existing?.signature === signature) return existing.id;
    const attempt = { id: crypto.randomUUID(), signature };
    actionAttempts.current.set(kind, attempt);
    return attempt.id;
  }

  function focusWorkspaceView() {
    window.requestAnimationFrame(() => viewHeading.current?.focus({ preventScroll: true }));
  }

  const historical = view.mode === "HISTORICAL" && displayedRevision && displayedRevision.id !== current?.id;
  const hasActionBar = historical || canEdit || negotiation.allowedActions.some((action) => ["AGREE", "DECLINE", "WITHDRAW"].includes(action));

  return (
    <div className={`page wide loi-page stack${hasActionBar ? " has-action-bar" : ""}`}>
      <header className="loi-header">
        <div className="stack tight">
          <Link className="link-button" href={`/messages/${encodeURIComponent(negotiation.conversationId)}`} ref={fallbackFocus}>← Conversation</Link>
          <p className="eyebrow">Non-binding term alignment</p>
          <h1>LOI workspace</h1>
          <p>Version {negotiation.currentSequence || "draft"} · {negotiation.viewerRole === "BUYER" ? "Buyer" : "Seller"} view</p>
        </div>
        <span className="status-dot info">{statusLabel(negotiation.status)}</span>
      </header>

      <div aria-atomic="true" aria-live="polite" className="loi-live-region">
        {refreshError ? <p className="auth-alert warning" role="status">{refreshError}</p> : null}
        {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
        {notice ? <p className="auth-alert success" role="status">{notice}</p> : null}
      </div>

      {historical ? (
        <section className="auth-alert warning loi-history-banner" role="status">
          <strong>Viewing historical version {displayedRevision.sequence}</strong>
          <span>Version {negotiation.currentSequence} is current. Current-version actions are hidden until you return to it.</span>
          <button className="button secondary sm" onClick={showCurrent} type="button">Return to current version {negotiation.currentSequence}</button>
        </section>
      ) : null}

      {view.staleDraft ? (
        <section className="auth-alert warning loi-draft-conflict" role="alert">
          <strong>Your saved draft changed elsewhere</strong>
          <span>Your unsaved input is still on this page. Load the latest saved draft before continuing.</span>
          <button className="button secondary sm" onClick={reloadCanonicalDraft} type="button">Load latest saved draft</button>
        </section>
      ) : null}

      <div className="loi-layout">
        <main className="stack">
          <h2 className="visually-hidden" ref={viewHeading} tabIndex={-1}>LOI {viewModeLabel(view.mode)}</h2>
          {view.mode === "REVIEWING" && view.terms && localSummary ? (
            <TermsReview
              computedSummary={localSummary}
              heading="Review saved private draft"
              propertySnapshot={negotiation.propertySnapshot}
              responseDeadline={deadline}
              role={negotiation.viewerRole}
              terms={view.terms}
            />
          ) : view.mode === "EDITING" && view.terms ? (
            <LoiEditor fieldErrors={fieldErrors} terms={view.terms} update={updateTerms} />
          ) : displayedRevision ? (
            <TermsReview
              computedSummary={displayedRevision.computedSummary}
              heading={`Submitted version ${displayedRevision.sequence}`}
              previousRevision={previousDisplayedRevision}
              propertySnapshot={negotiation.propertySnapshot}
              revision={displayedRevision}
              role={negotiation.viewerRole}
              terms={displayedRevision.terms}
            />
          ) : (
            <section className="card stack tight">
              <h2>No submitted LOI version</h2>
              <p>{negotiation.allowedActions.includes("EDIT") ? "Start or resume the buyer's private draft below." : "Only the buyer can prepare the first LOI draft."}</p>
            </section>
          )}

          <RevisionTimeline
            currentRevisionId={current?.id ?? null}
            history={history}
            loading={pending === "history"}
            onLoadOlder={() => void loadOlderHistory()}
            onSelect={showRevision}
            pageInfo={historyPageInfo}
            role={negotiation.viewerRole}
            selectedRevisionId={displayedRevision?.id ?? null}
          />
        </main>

        <aside aria-label="LOI deal snapshot" className="loi-summary stack">
          <section className="card sage stack tight">
            <p className="eyebrow">{historical ? `Version ${displayedRevision.sequence} snapshot` : view.mode === "EDITING" || view.mode === "REVIEWING" ? "Draft deal snapshot" : "Current deal snapshot"}</p>
            <Summary summary={sidebarSummary} terms={sidebarTerms} />
          </section>
          <section className="card stack tight">
            <strong>Important</strong>
            <p className="muted small">Submitting or aligning records proposed terms for contract preparation. It does not sign a contract, open escrow, transfer money, or confirm a deposit.</p>
          </section>
        </aside>
      </div>

      {hasActionBar ? (
        <div aria-busy={Boolean(pending)} aria-label="LOI actions" className="loi-action-bar" role="region">
          {historical ? (
            <button className="button primary" disabled={Boolean(pending)} onClick={showCurrent} type="button">Return to current version {negotiation.currentSequence}</button>
          ) : view.mode === "REVIEWING" && canEdit ? (
            <>
              <button className="button secondary" disabled={Boolean(pending)} onClick={() => setView((currentView) => ({ ...currentView, mode: "EDITING" }))} type="button">Back to edit</button>
              <label className="loi-deadline" htmlFor="loi-response-deadline">
                Response deadline
                <input id="loi-response-deadline" max={maxDeadline()} min={minDeadline()} onChange={(event) => setDeadline(event.target.value)} type="datetime-local" value={deadline} />
                <span className="muted small">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
              </label>
              <button className="button primary" disabled={Boolean(pending) || view.dirty || view.draftVersion < 1 || view.staleDraft} onClick={() => void submit()} type="button">
                {pending === "submit" ? "Submitting…" : negotiation.currentSequence ? `Submit counter as version ${negotiation.currentSequence + 1}` : "Submit LOI as version 1"}
              </button>
            </>
          ) : view.mode === "EDITING" && canEdit ? (
            <>
              {negotiation.allowedActions.includes("WITHDRAW") ? <button className="button warning" disabled={Boolean(pending)} onClick={() => openDecision("withdraw")} type="button">Withdraw LOI</button> : null}
              <button className="button secondary" disabled={Boolean(pending) || !view.dirty || view.staleDraft} onClick={() => void saveDraft()} type="button">{pending === "save" ? "Saving…" : view.dirty ? "Save private draft" : "Saved"}</button>
              <button className="button secondary" disabled={Boolean(pending) || view.staleDraft} onClick={() => void discardDraft()} type="button">{pending === "discard" ? (negotiation.currentSequence === 0 ? "Resetting…" : "Discarding…") : negotiation.currentSequence === 0 ? "Reset initial draft" : "Discard counter draft"}</button>
              <button className="button primary" disabled={Boolean(pending) || view.dirty || view.draftVersion < 1 || view.staleDraft} onClick={enterReview} type="button">Review saved LOI</button>
            </>
          ) : (
            <>
              {negotiation.allowedActions.includes("WITHDRAW") ? <button className="button warning" disabled={Boolean(pending)} onClick={() => openDecision("withdraw")} type="button">Withdraw LOI</button> : null}
              {canEdit ? <button className="button secondary" disabled={Boolean(pending)} onClick={startOrResume} type="button">{negotiation.draft ? "Resume private draft" : negotiation.currentSequence === 0 ? "Start initial draft" : "Counter current version"}</button> : null}
              {negotiation.allowedActions.includes("DECLINE") ? <button className="button warning" disabled={Boolean(pending)} onClick={() => openDecision("decline")} type="button">Decline version {negotiation.currentSequence}</button> : null}
              {negotiation.allowedActions.includes("AGREE") ? <button className="button primary" disabled={Boolean(pending)} onClick={() => openDecision("agree")} type="button">Align on version {negotiation.currentSequence} for contract preparation</button> : null}
            </>
          )}
        </div>
      ) : null}

      {decision ? (
        <LoiDecisionDialog
          busy={Boolean(pending)}
          current={current}
          decision={decision}
          error={decisionError}
          onClose={closeDecision}
          onConfirm={() => void (decision === "withdraw" ? withdraw() : decide(decision))}
          propertySnapshot={negotiation.propertySnapshot}
          role={negotiation.viewerRole}
        />
      ) : null}
    </div>
  );
}

function RevisionTimeline({ currentRevisionId, history, loading, onLoadOlder, onSelect, pageInfo, role, selectedRevisionId }: {
  currentRevisionId: string | null;
  history: LoiRevision[];
  loading: boolean;
  onLoadOlder: () => void;
  onSelect: (revision: LoiRevision) => void;
  pageInfo: LoiNegotiation["revisionPageInfo"];
  role: LoiRole;
  selectedRevisionId: string | null;
}) {
  return (
    <section className="card stack tight" aria-labelledby="loi-history-title">
      <div className="section-head">
        <h2 id="loi-history-title">Revision timeline</h2>
        <span className="muted small">Immutable after submission</span>
      </div>
      {pageInfo.hasOlder ? <button className="button secondary sm" disabled={loading} onClick={onLoadOlder} type="button">{loading ? "Loading…" : "Load older versions"}</button> : null}
      {history.length ? (
        <ol className="loi-revision-list">
          {history.map((revision) => {
            const previous = history.find((candidate) => candidate.sequence === revision.sequence - 1) ?? null;
            const termDiffs = previous ? semanticTermDiffs(previous.terms, revision.terms, role) : [];
            const calculatedDiffs = previous ? recalculatedDiffs(previous.computedSummary, revision.computedSummary) : [];
            const selected = revision.id === selectedRevisionId;
            return (
              <li key={revision.id}>
                <article className={`loi-revision-row${selected ? " selected" : ""}`}>
                  <div className="stack tight">
                    <strong>Version {revision.sequence} · {revision.submittedByRole === "BUYER" ? "Buyer" : "Seller"}{revision.id === currentRevisionId ? " · Current" : ""}</strong>
                    <span>Submitted {formatLoiDateTime(revision.submittedAt)}</span>
                    <span>Response due {formatLoiDateTime(revision.responseDeadline)}</span>
                  </div>
                  <button aria-current={selected ? "true" : undefined} className="link-button" onClick={() => onSelect(revision)} type="button">View version {revision.sequence}</button>
                  {previous ? <CompactDiffs calculatedDiffs={calculatedDiffs} termDiffs={termDiffs} /> : <span>{missingLoiRevisionPredecessorLabel(revision.sequence)}</span>}
                </article>
              </li>
            );
          })}
        </ol>
      ) : <p className="muted">No submitted revisions yet.</p>}
    </section>
  );
}

function CompactDiffs({ calculatedDiffs, termDiffs }: { calculatedDiffs: LoiSemanticDiff[]; termDiffs: LoiSemanticDiff[] }) {
  return (
    <div className="loi-compact-diffs">
      <span>{termDiffs.length} {termDiffs.length === 1 ? "term change" : "term changes"}</span>
      {termDiffs.slice(0, 3).map((diff) => <span key={diff.fieldId}>{diff.label}: {diff.from} → {diff.to}</span>)}
      {termDiffs.length > 3 ? <span>+ {termDiffs.length - 3} more term changes</span> : null}
      <span>{calculatedDiffs.length} recalculated {calculatedDiffs.length === 1 ? "value" : "values"}</span>
    </div>
  );
}

function TermsReview({ computedSummary, heading, previousRevision = null, propertySnapshot, responseDeadline, revision, role, terms }: {
  computedSummary: LoiComputedSummary;
  heading: string;
  previousRevision?: LoiRevision | null;
  propertySnapshot: unknown;
  responseDeadline?: string;
  revision?: LoiRevision;
  role: LoiRole;
  terms: LoiTermsV1;
}) {
  const instanceId = useId();
  const headingId = `${instanceId}-heading`;
  const diffHeadingId = `${instanceId}-diffs`;
  const recalculatedHeadingId = `${instanceId}-recalculated`;
  const property = normalizePropertyIdentity(propertySnapshot);
  const sections = loiTermSections(terms, role);
  const termDiffs = previousRevision ? semanticTermDiffs(previousRevision.terms, terms, role) : [];
  const calculatedDiffs = previousRevision ? recalculatedDiffs(previousRevision.computedSummary, computedSummary) : [];
  return (
    <section className="card stack loi-terms-review" aria-labelledby={headingId}>
      <div className="section-head">
        <div>
          <p className="eyebrow">Complete proposed-term snapshot</p>
          <h2 id={headingId}>{heading}</h2>
        </div>
        {revision ? <span className="status-dot info">Immutable</span> : <span className="status-dot warning">Private draft</span>}
      </div>

      <PropertyIdentity property={property} />

      <dl className="loi-review-meta">
        {revision ? <><div><dt>Version</dt><dd>{revision.sequence}</dd></div><div><dt>Authored by</dt><dd>{revision.submittedByRole === "BUYER" ? "Buyer" : "Seller"}</dd></div><div><dt>Submitted</dt><dd><time dateTime={revision.submittedAt}>{formatLoiDateTime(revision.submittedAt)}</time></dd></div></> : <><div><dt>Version</dt><dd>Next draft</dd></div><div><dt>Prepared by</dt><dd>{role === "BUYER" ? "Buyer" : "Seller"}</dd></div></>}
        {(revision?.responseDeadline ?? responseDeadline) ? <div><dt>Exact response deadline</dt><dd><time dateTime={revision?.responseDeadline ?? responseDeadline}>{formatLoiDateTime(revision?.responseDeadline ?? responseDeadline ?? "")}</time></dd></div> : null}
      </dl>

      {previousRevision ? (
        <section className="loi-review-diffs stack tight" aria-labelledby={diffHeadingId}>
          <h3 id={diffHeadingId}>Changes from version {previousRevision.sequence}</h3>
          {termDiffs.length ? <DiffList diffs={termDiffs} /> : <p className="muted">No material term changes.</p>}
          <h4>Recalculated</h4>
          {calculatedDiffs.length ? <DiffList diffs={calculatedDiffs} recalculated /> : <p className="muted">No calculated values changed.</p>}
        </section>
      ) : null}

      <div className="loi-review-sections">
        {sections.map((section) => (
          <section className="loi-review-section" key={section.id} aria-labelledby={`${instanceId}-${section.id}`}>
            <h3 id={`${instanceId}-${section.id}`}>{section.title}</h3>
            <dl className="loi-review-grid">
              {section.rows.map((row) => <div key={row.fieldId}><dt>{row.label}</dt><dd>{row.formattedValue}</dd></div>)}
            </dl>
          </section>
        ))}
      </div>

      <section className="loi-recalculated stack tight" aria-labelledby={recalculatedHeadingId}>
        <div className="section-head compact"><h3 id={recalculatedHeadingId}>Calculated values</h3><span className="status-dot info">Recalculated</span></div>
        <dl className="loi-review-grid">
          {loiSummaryRows(computedSummary).map((row) => <div key={row.fieldId}><dt>{row.label}</dt><dd>{row.formattedValue}</dd></div>)}
        </dl>
      </section>

      <div className="auth-alert info loi-nonbinding-notice">
        <strong>Non-binding contract-preparation notice</strong>
        <span>These proposed terms record alignment for preparing formal documents. They are not a signature, binding acceptance, escrow instruction, payment request, deposit confirmation, or transfer of money.</span>
      </div>
    </section>
  );
}

function PropertyIdentity({ property }: { property: ReturnType<typeof normalizePropertyIdentity> }) {
  return (
    <section className="loi-property-identity" aria-label="Immutable property identity">
      <p className="eyebrow">Property captured with this negotiation</p>
      <strong>{property.title}</strong>
      {property.location ? <span>{property.location}</span> : null}
      <span>{property.identityVersion === null ? "Captured invite property identity" : `Property identity version ${property.identityVersion}`}</span>
    </section>
  );
}

function DiffList({ diffs, recalculated = false }: { diffs: LoiSemanticDiff[]; recalculated?: boolean }) {
  return (
    <dl className="loi-diff-list">
      {diffs.map((diff) => (
        <div key={`${diff.section}:${diff.fieldId}`}>
          <dt>{diff.label}{recalculated ? <span className="status-dot info">Recalculated</span> : null}</dt>
          <dd><span>{diff.from}</span><span aria-hidden="true">→</span><strong>{diff.to}</strong></dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({ summary, terms }: { summary: LoiComputedSummary | null; terms: LoiTermsV1 | null }) {
  if (!summary || !terms) return <p className="muted">Complete valid draft fields to see the calculated summary.</p>;
  return (
    <dl className="loi-summary-list">
      <div><dt>Purchase price</dt><dd>{formatLoiMoney(terms.purchasePriceCents)}</dd></div>
      <div><dt>Loan amount</dt><dd>{formatLoiMoney(summary.loanAmountCents)}</dd></div>
      <div><dt>Earnest money</dt><dd>{formatLoiMoney(summary.earnestMoneyCents)}</dd></div>
      <div><dt>Effective price after credit</dt><dd>{formatLoiMoney(summary.effectivePriceAfterSellerCreditCents)}</dd></div>
    </dl>
  );
}

function LoiDecisionDialog({ busy, current, decision, error, onClose, onConfirm, propertySnapshot, role }: {
  busy: boolean;
  current: LoiRevision | null;
  decision: Decision;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
  propertySnapshot: unknown;
  role: LoiRole;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = "loi-decision-title";
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    window.requestAnimationFrame(() => cancel.current?.focus());
  }, []);

  const title = decision === "agree"
    ? `Align on version ${current?.sequence ?? "draft"}?`
    : decision === "decline" ? `Decline version ${current?.sequence ?? "draft"}?` : "Withdraw this LOI?";
  const confirmLabel = decision === "agree"
    ? `Align on version ${current?.sequence} for contract preparation`
    : decision === "decline" ? `Decline version ${current?.sequence}` : current ? `Withdraw version ${current.sequence}` : "Withdraw initial draft";

  return (
    <dialog
      aria-busy={busy}
      aria-labelledby={titleId}
      className="loi-native-dialog"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      ref={dialog}
    >
      <div className="loi-dialog-content stack">
        <div className="section-head">
          <div><p className="eyebrow">Confirm exact LOI version</p><h2 id={titleId}>{title}</h2></div>
          <button aria-label="Close decision dialog" className="message-dialog-close" disabled={busy} onClick={onClose} type="button">×</button>
        </div>
        {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
        {current ? (
          <>
            <section className="card sage stack tight loi-decision-summary" aria-label={`Version ${current.sequence} decision summary`}>
              <PropertyIdentity property={normalizePropertyIdentity(propertySnapshot)} />
              <Summary summary={current.computedSummary} terms={current.terms} />
              <p><strong>Exact response deadline:</strong> <time dateTime={current.responseDeadline}>{formatLoiDateTime(current.responseDeadline)}</time></p>
            </section>
            <TermsReview computedSummary={current.computedSummary} heading={`Version ${current.sequence} complete terms`} propertySnapshot={propertySnapshot} revision={current} role={role} terms={current.terms} />
          </>
        ) : (
          <section className="card sage stack tight">
            <PropertyIdentity property={normalizePropertyIdentity(propertySnapshot)} />
            <p>No terms have been submitted. Withdrawal will close the initial private-draft workflow.</p>
          </section>
        )}
        <p className="muted">This records non-binding proposed-term status for contract preparation. It is not a signature or binding acceptance.</p>
        <div className="actions right">
          <button className="button secondary" disabled={busy} onClick={onClose} ref={cancel} type="button">Cancel</button>
          <button className={decision === "agree" ? "button primary" : "button warning"} disabled={busy} onClick={onConfirm} type="button">{busy ? "Recording…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const fieldErrors = body && typeof body === "object" && "fieldErrors" in body
      ? (body as { fieldErrors?: unknown }).fieldErrors
      : {};
    throw new LoiRequestError(response.status, fieldErrors);
  }
  return body;
}

class LoiRequestError extends Error {
  constructor(readonly status: number, readonly fieldErrors: unknown) {
    super("LOI request failed.");
  }
}

function message(error: unknown) {
  if (error instanceof LoiRequestError && error.status === 409) return "This negotiation or private draft changed elsewhere. Refresh or load the latest saved draft before continuing.";
  if (error instanceof LoiRequestError && error.status === 429) return "Please wait a moment before trying again. Your current input remains on this page.";
  if (error instanceof LoiRequestError && error.fieldErrors && typeof error.fieldErrors === "object" && Object.keys(error.fieldErrors).length) return "Review the highlighted fields. Your private draft remains on this page.";
  return "The request could not be completed. Your current input remains on this page.";
}

function decisionMessage(error: unknown) {
  if (error instanceof LoiRequestError && error.status === 409) return "The current LOI changed. Close this dialog and review the latest version before trying again.";
  if (error instanceof LoiRequestError && error.status === 429) return "Please wait a moment before trying this decision again.";
  return "This decision could not be recorded. The LOI remains unchanged.";
}

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function minDeadline() {
  return localDateTime(new Date(Date.now() + 65 * 60 * 1000));
}

function maxDeadline() {
  return localDateTime(new Date(Date.now() + 30 * 86_400_000));
}

function defaultDeadline() {
  return localDateTime(new Date(Date.now() + 3 * 86_400_000));
}

function validDeadline(value: Date) {
  const time = value.getTime();
  return Number.isFinite(time) && time >= Date.now() + 60 * 60 * 1000 && time <= Date.now() + 30 * 86_400_000;
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    AWAITING_BUYER_RESPONSE: "Waiting for buyer",
    AWAITING_BUYER_SUBMISSION: "Buyer drafting",
    AWAITING_SELLER_RESPONSE: "Waiting for seller",
    DECLINED: "Declined",
    EXPIRED: "Expired",
    READ_ONLY: "Read-only",
    TERMS_ALIGNED: "Terms aligned",
    WITHDRAWN: "Withdrawn",
  };
  return status ? labels[status] ?? "LOI" : "LOI";
}

function viewModeLabel(mode: LoiWorkspaceViewState["mode"]) {
  return mode === "CURRENT" ? "current version" : mode === "HISTORICAL" ? "historical version" : mode === "EDITING" ? "private draft editor" : "saved draft review";
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
