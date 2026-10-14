"use client";

import { loiCounterEditableTermsV1Schema, loiEditableTermsV1Schema, loiCounterEditableDraftTermsV1Schema, loiEditableDraftTermsV1Schema, previewLoiCalculation, type LoiCalculationIssue, type LoiComputedSummary, type LoiTermsV1 } from "@liber/validators";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../icon";
import { getMessagingBrowserClient, logMessagingRealtimeJoinStatus } from "../messaging/realtime";
import { LoiEditor, type LoiTermsUpdater } from "./loi-editor";
import { loiCashEquations } from "./loi-cash-equation";
import { LoiSellerProceeds, LoiSellerProceedsBreakdown } from "./loi-seller-proceeds";
import { parseSellerLoanPayoff, sellerNetProceeds } from "./loi-seller-proceeds-values";
import { LoiCompletedDownload } from "./loi-completed-download";
import { loiFeeBreakdown } from "./loi-fee-breakdown";
import "./loi-cash-callout.css";
import "./loi-workspace.css";
import { LoiActionBar } from "./loi-action-bar";
import { LoiTemplateDialog } from "./loi-template-dialog";
import { applyLoiTemplate, type LoiTemplate } from "./loi-template-values";
import { createLoiRefreshGuard } from "./loi-refresh";
import {
  formatLoiDateTime,
  formatLoiMoney,
  loiInputIdForNormalizedErrors,
  loiRevisionHeading,
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
  savedLoiDraftTransition,
  type LoiWorkspaceViewState,
} from "./loi-workspace-state";
import type { LoiNegotiation, LoiRevision, LoiRevisionPage, LoiRole } from "./loi-types";

type Decision = "agree" | "decline" | "withdraw" | "discard";
type PendingOperation = Decision | "history" | "save" | "submit" | null;
type CanonicalMode = "INITIAL" | "RECONCILE" | "CURRENT";
const FINANCING_EVIDENCE_REQUIRED_MESSAGE = "Financed terms need a current pre-approval badge or an uploaded pre-approval letter. Your saved draft is safe. Upload a letter from your buyer profile, then return to review and submit.";

export function LoiWorkspace({ initialNegotiation, templateOwnerId }: { initialNegotiation: LoiNegotiation; templateOwnerId?: string }) {
  const [negotiation, setNegotiation] = useState(initialNegotiation);
  const negotiationRef = useRef(initialNegotiation);
  const [history, setHistory] = useState(() => initialNegotiation.revisions);
  const [historyPageInfo, setHistoryPageInfo] = useState(initialNegotiation.revisionPageInfo);
  const loadedOlderHistory = useRef(false);
  const [view, setView] = useState<LoiWorkspaceViewState>(() => initialLoiViewState(initialNegotiation));
  const [decision, setDecision] = useState<Decision | null>(null);
  const [templateMode, setTemplateMode] = useState<"save" | "use" | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const [pending, setPending] = useState<PendingOperation>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const [sellerPayoff, setSellerPayoff] = useState({ negotiationId: initialNegotiation.id, value: "" });
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const refreshGuard = useRef(createLoiRefreshGuard());
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

  // One calculation per edit feeds the editor, snapshot, fee details, and action bar.
  const livePreview = useMemo(() => view.terms ? previewLoiCalculation(view.terms) : null, [view.terms]);
  const localSummary = livePreview?.summary ?? null;

  const drafting = view.mode === "EDITING" || view.mode === "REVIEWING";
  const sidebarTerms = drafting ? view.terms : displayedRevision?.terms ?? null;
  const sidebarSummary = drafting ? localSummary : displayedRevision?.computedSummary ?? null;
  const sidebarIssues = drafting ? livePreview?.issues ?? [] : [];
  const payoff = sellerPayoff.negotiationId === negotiation.id ? sellerPayoff.value : "";
  const liveTotal = view.mode === "EDITING" ? liveCalculatorTotal(localSummary, negotiation.viewerRole, payoff) : null;

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
      setTemplateMode(null);
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
          const applied = await refreshGuard.current.read(
            () => request(`/api/loi/negotiations/${initialNegotiation.id}`, { cache: "no-store" }) as Promise<LoiNegotiation>,
            applyCanonical,
          );
          if (!applied) {
            refreshQueued.current = true;
            continue;
          }
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

  // Stable identity keeps the editor's normalization effects from re-running on every keystroke.
  const updateTerms = useCallback<LoiTermsUpdater>((fieldPath, next) => {
    setView((currentView) => ({
      ...currentView,
      dirty: true,
      mode: "EDITING",
      terms: currentView.terms ? next(currentView.terms) : currentView.terms,
    }));
    setFieldErrors((currentErrors) => {
      const remaining = Object.entries(currentErrors).filter(([path]) => path !== fieldPath && !path.startsWith(`${fieldPath}.`) && !fieldPath.startsWith(`${path}.`));
      return remaining.length === Object.keys(currentErrors).length ? currentErrors : Object.fromEntries(remaining);
    });
    setError("");
    setNotice("");
  }, []);

  async function saveDraft(reviewAfterSave = false) {
    if (!view.terms || pending || view.staleDraft || !canEdit) return;
    const schema = reviewAfterSave
      ? (negotiation.currentSequence > 0 ? loiCounterEditableTermsV1Schema : loiEditableTermsV1Schema)
      : (negotiation.currentSequence > 0 ? loiCounterEditableDraftTermsV1Schema : loiEditableDraftTermsV1Schema);
    const validation = schema.safeParse(view.terms);
    if (!validation.success) {
      showFieldErrors(normalizeLoiFieldErrors(Object.fromEntries(validation.error.issues.map((issue) => [issue.path.join("."), issue.message])), view.terms));
      setError("Review the highlighted fields. Your private draft remains on this page.");
      return;
    }
    if (reviewAfterSave && !view.dirty && view.draftVersion > 0) {
      enterReview();
      return;
    }
    setPending("save");
    setError("");
    setNotice("");
    const basis = negotiationRef.current;
    try {
      const result = await request(`/api/loi/negotiations/${negotiation.id}/draft`, {
        body: JSON.stringify({ expectedDraftVersion: view.draftVersion, expectedSequence: negotiation.currentSequence, terms: validation.data }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      }) as { draft: { draftVersion: number; id: string; terms: LoiTermsV1; updatedAt?: string } };
      refreshGuard.current.invalidate();
      const saved = savedLoiDraftTransition({
        basis,
        current: negotiationRef.current,
        draft: {
          draftVersion: result.draft.draftVersion,
          id: result.draft.id,
          terms: result.draft.terms,
          updatedAt: result.draft.updatedAt ?? new Date().toISOString(),
        },
        mode: reviewAfterSave ? "REVIEWING" : "EDITING",
      });
      if (!saved) {
        setError("The LOI changed while saving. Review the latest state before continuing.");
        void refresh();
        return;
      }
      negotiationRef.current = saved.negotiation;
      setNegotiation(saved.negotiation);
      setView(saved.view);
      setFieldErrors({});
      setNotice("Private draft saved.");
      if (reviewAfterSave) focusWorkspaceView();
    } catch (requestError) {
      handleMutationError(requestError);
    } finally {
      setPending(null);
    }
  }

  async function submit() {
    if (!view.terms || view.draftVersion < 1 || view.dirty || view.staleDraft || view.mode !== "REVIEWING" || pending || !canEdit) {
      setError("Review the exact saved draft before submitting it.");
      return;
    }
    const expectedDraftId = view.draftId;
    if (!expectedDraftId || negotiation.draft?.id !== expectedDraftId) {
      setError("The saved private draft identity is unavailable. Refresh before submitting.");
      return;
    }
    const signature = `${negotiation.currentSequence}:${expectedDraftId}:${view.draftVersion}`;
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
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }) as LoiNegotiation;
      refreshGuard.current.invalidate();
      actionAttempts.current.delete("submit");
      applyCanonical(result, "CURRENT");
      setFieldErrors({});
      setNotice(negotiation.currentSequence ? "Counter submitted." : "LOI submitted.");
      focusWorkspaceView();
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
      refreshGuard.current.invalidate();
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
      refreshGuard.current.invalidate();
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
      refreshGuard.current.invalidate();
      applyCanonical(result, initial ? "INITIAL" : "CURRENT");
      closeDecision();
      setFieldErrors({});
      setNotice(initial ? "Initial draft reset to fresh starter terms." : "Counter draft discarded. The current submitted version is unchanged.");
    } catch (requestError) {
      handleDecisionError(requestError);
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
    if (view.mode === "REVIEWING") {
      setView((currentView) => ({ ...currentView, mode: "EDITING" }));
      focusWorkspaceView();
      return;
    }
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
    setView((currentView) => ({ ...currentView, mode: "REVIEWING" }));
    setError("");
    focusWorkspaceView();
  }

  function showCurrent() {
    setView(currentLoiViewState(negotiation));
    setError("");
    focusWorkspaceView();
  }

  function openTemplate(mode: "save" | "use") {
    if (pending || view.staleDraft || !templateOwnerId || !sidebarTerms) return;
    setTemplateMode(mode);
  }

  function useTemplate(template: LoiTemplate) {
    if (pending || view.staleDraft || !canEdit || !view.terms) return;
    const terms = applyLoiTemplate(view.terms, template, { counter: negotiation.currentSequence > 0 });
    setView((currentView) => ({ ...currentView, mode: "EDITING", terms, dirty: true }));
    setFieldErrors({});
    setError("");
    setNotice(`Applied template “${template.name}”. Review your changes, then save and review the draft.`);
    setTemplateMode(null);
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
      if (target?.isConnected && target.getClientRects().length && !target.matches(":disabled")) target.focus();
      else if (document.querySelector<HTMLElement>(".loi-more-actions summary")) document.querySelector<HTMLElement>(".loi-more-actions summary")?.focus();
      else fallbackFocus.current?.focus();
    });
  }

  function showFieldErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    setView((currentView) => currentView.terms ? { ...currentView, mode: "EDITING" } : currentView);
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
    window.requestAnimationFrame(() => {
      viewHeading.current?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      viewHeading.current?.focus({ preventScroll: true });
    });
  }

  const historical = view.mode === "HISTORICAL" && displayedRevision && displayedRevision.id !== current?.id;
  const hasActionBar = historical || canEdit || (view.mode === "CURRENT" && negotiation.currentSequence > 0) || negotiation.allowedActions.some((action) => ["AGREE", "DECLINE", "WITHDRAW"].includes(action));

  return (
    <div className={`page wide loi-page stack${hasActionBar ? " has-action-bar" : ""}`}>
      <header className="loi-header">
        <Link className="page-back" href={`/messages/${encodeURIComponent(negotiation.conversationId)}`} ref={fallbackFocus}><Icon name="chevron-left" size={18} />Back to messages</Link>
        <div className="loi-header-row">
          <div className="loi-header-text">
            <h1>LOI workspace</h1>
            <p className="meta-line">Non-binding term alignment · Version {negotiation.currentSequence || "draft"} · {negotiation.viewerRole === "BUYER" ? "Buyer" : "Seller"} view</p>
          </div>
          <span className={`status-tag ${statusTone(negotiation.status)}`}>{statusLabel(negotiation.status)}</span>
        </div>
      </header>

      {negotiation.status === "TERMS_ALIGNED" ? (
        <section className="loi-aligned-celebration" role="status">
          <span aria-hidden="true" className="loi-aligned-mark"><Icon name="check" size={24} strokeWidth={2.4} /></span>
          <div className="loi-aligned-copy">
            <h2>Completed LOI</h2>
            <p className="meta-line">Terms aligned</p>
            <p>Both buyer and seller can view the final terms. This LOI is read-only.</p>
            <p>You aligned on these terms for contract preparation. This is not a signed offer or escrow instruction.</p>
          </div>
        </section>
      ) : null}

      <div aria-atomic="true" aria-live="polite" className="loi-live-region">
        {refreshError ? <div className="inline-alert warning" role="status"><Icon name="info" size={20} /><p>{refreshError}</p></div> : null}
        {error && !hasActionBar ? <div className="inline-alert danger" role="alert"><Icon name="info" size={20} /><p>{error}</p></div> : null}
        {notice ? <div className="inline-alert success" role="status"><Icon name="check" size={20} /><p>{notice}</p></div> : null}
      </div>

      {historical ? (
        <section className="inline-alert warning loi-history-banner" role="status">
          <Icon name="info" size={20} />
          <p><strong>Viewing historical version {displayedRevision.sequence}</strong> <span>Version {negotiation.currentSequence} is current. Current-version actions are hidden until you return to it.</span></p>
          <button className="button secondary sm" onClick={showCurrent} type="button">Return to current version {negotiation.currentSequence}</button>
        </section>
      ) : null}

      {view.staleDraft ? (
        <section className="inline-alert warning loi-draft-conflict" role="alert">
          <Icon name="info" size={20} />
          <p><strong>Your saved draft changed elsewhere</strong> <span>Your unsaved input is still on this page. Load the latest saved draft before continuing.</span></p>
          <button className="button secondary sm" onClick={reloadCanonicalDraft} type="button">Load latest saved draft</button>
        </section>
      ) : null}

      <div className="loi-layout">
        <section aria-labelledby="loi-view-title" className="stack">
          <h2 className="loi-view-heading" id="loi-view-title" ref={viewHeading} tabIndex={-1}>{negotiation.status === "TERMS_ALIGNED" && view.mode !== "HISTORICAL" ? "Final terms · Read-only" : view.mode === "EDITING" ? "Draft your terms" : view.mode === "REVIEWING" ? "Review before you submit" : `LOI ${viewModeLabel(view.mode)}`}</h2>
          {view.mode === "CURRENT" && negotiation.viewerRole === "SELLER" && negotiation.allowedActions.includes("COUNTER") && current?.terms.disclosures.deathOnPropertyProvidedBy !== "SELLER" ? <section className="card stack tight loi-callout-card">
            <h3>Add your seller disclosure</h3>
            <p>The death-on-property question is yours to answer. Add your answer in a counter so the buyer can review the exact updated terms before alignment.</p>
            <button className="button secondary" disabled={Boolean(pending)} onClick={startOrResume} type="button">Add seller disclosure</button>
          </section> : null}
          {view.mode === "EDITING" || view.mode === "REVIEWING" ? (
            <ol aria-label="LOI progress" className="loi-progress">
              <li aria-current={view.mode === "EDITING" ? "step" : undefined}><span aria-hidden="true">1</span>Draft terms</li>
              <li aria-current={view.mode === "REVIEWING" ? "step" : undefined}><span aria-hidden="true">2</span>Review</li>
              <li><span aria-hidden="true">3</span>Submit</li>
            </ol>
          ) : null}
          {view.mode === "REVIEWING" && view.terms && localSummary ? (
            <>
            {view.terms.funding.type === "FINANCED" ? <section className="card stack tight loi-callout-card">
              <h3>Loan submission requirements</h3>
              {negotiation.financingEvidenceExceptionExpiresAt ? <p>A temporary testing exception allows this LOI to be submitted without pre-approval evidence until {formatLoiDateTime(negotiation.financingEvidenceExceptionExpiresAt)}. This does not verify financing or grant a badge.</p> : <>
                <p>The buyer needs a current pre-approval badge or an uploaded pre-approval letter before these financed terms can be sent. A pending letter is sufficient; badge approval is not required to submit.</p>
                {negotiation.viewerRole === "BUYER" ? <Link href="/buyer/profile#buyer-verification-card" rel="noopener noreferrer" target="_blank">Upload or review pre-approval (opens a new tab)</Link> : <p>The buyer can upload their letter from their profile.</p>}
              </>}
            </section> : null}
            <TermsReview
              computedSummary={localSummary}
              heading="Review saved private draft"
              propertySnapshot={negotiation.propertySnapshot}
              role={negotiation.viewerRole}
              terms={view.terms}
            />
            </>
          ) : view.mode === "EDITING" && view.terms ? (
            <>
            <PropertyIdentity property={normalizePropertyIdentity(negotiation.propertySnapshot)} />
            <LoiEditor counterBaseTerms={current?.terms} disabled={Boolean(pending)} fieldErrors={fieldErrors} mode={negotiation.currentSequence > 0 ? "COUNTER" : "INITIAL"} preview={livePreview} terms={view.terms} update={updateTerms} viewerRole={negotiation.viewerRole} />
            </>
          ) : displayedRevision ? (
            <TermsReview
              computedSummary={displayedRevision.computedSummary}
              heading={loiRevisionHeading(displayedRevision, negotiation.viewerRole)}
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

          {history.length ? <details className="loi-history-disclosure" key={view.mode} open={view.mode !== "EDITING" && view.mode !== "REVIEWING"}>
          <summary>Submitted versions ({history.length}{historyPageInfo.hasOlder ? "+" : ""})</summary>
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
          </details> : null}
        </section>

        <aside aria-label="LOI deal snapshot" className={`loi-summary stack ${negotiation.viewerRole === "SELLER" ? "seller" : "buyer"}`}>
          <section className="card stack tight loi-snapshot">
            <h2 className="loi-snapshot-title">{historical ? `Version ${displayedRevision.sequence} snapshot` : view.mode === "EDITING" || view.mode === "REVIEWING" ? "Draft deal snapshot" : "Current deal snapshot"}</h2>
            <Summary summary={sidebarSummary} terms={sidebarTerms} compact viewerRole={negotiation.viewerRole} issues={sidebarIssues} />
            {sidebarTerms ? <a className="text-link loi-snapshot-link" href="#loi-financial-details-title">View fees and calculations <Icon name="chevron-down" size={16} /></a> : null}
            <p className="fine-print">Non-binding term alignment for contract preparation only.</p>
          </section>
          {negotiation.viewerRole === "SELLER" && sidebarTerms ? <LoiSellerProceeds key={negotiation.id} summary={sidebarSummary} terms={sidebarTerms} showDetails={false} payoff={payoff} onPayoffChange={(value) => setSellerPayoff({ negotiationId: negotiation.id, value })} /> : null}
        </aside>
      </div>

      {sidebarTerms ? <section className="loi-financial-details stack" aria-labelledby="loi-financial-details-title">
        <div className="loi-financial-details-head"><h2 id="loi-financial-details-title">Fees and calculation details</h2><p className="meta-line">Updates with your offer terms.</p></div>
        <div className="loi-financial-details-grid">
          {negotiation.viewerRole === "BUYER" ? <section className="card stack">
            <Summary summary={sidebarSummary} terms={sidebarTerms} detailsOnly viewerRole="BUYER" />
          </section> : <LoiSellerProceedsBreakdown summary={sidebarSummary} terms={sidebarTerms} payoff={payoff} />}
        </div>
      </section> : null}

      <LoiCompletedDownload negotiation={negotiation} historical={Boolean(historical)} />

      {hasActionBar ? (
        <LoiActionBar error={error} financingEvidenceRequired={error === FINANCING_EVIDENCE_REQUIRED_MESSAGE} liveTotal={liveTotal} negotiation={negotiation} onCurrent={showCurrent} onDecision={openDecision} onDiscard={() => openDecision("discard")} onEdit={startOrResume} onReview={() => void saveDraft(true)} onSave={() => void saveDraft()} onSaveTemplate={templateOwnerId && sidebarTerms ? () => openTemplate("save") : undefined} onUseTemplate={templateOwnerId && view.terms && canEdit && (view.mode === "EDITING" || view.mode === "REVIEWING") ? () => openTemplate("use") : undefined} onSubmit={() => void submit()} pending={pending} view={view} />
      ) : null}

      {decision ? (
        <LoiDecisionDialog
          busy={Boolean(pending)}
          current={current}
          decision={decision}
          error={decisionError}
          onClose={closeDecision}
          onConfirm={() => void (decision === "discard" ? discardDraft() : decision === "withdraw" ? withdraw() : decide(decision))}
          payoff={payoff}
          propertySnapshot={negotiation.propertySnapshot}
          role={negotiation.viewerRole}
        />
      ) : null}
      {templateMode && templateOwnerId && sidebarTerms ? <LoiTemplateDialog
        busy={Boolean(pending) || view.staleDraft}
        mode={templateMode}
        onApply={useTemplate}
        onClose={() => setTemplateMode(null)}
        onSaved={(name) => { setTemplateMode(null); setNotice(`Saved LOI template “${name}” in this browser.`); }}
        ownerId={templateOwnerId}
        terms={sidebarTerms}
      /> : null}
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
  // Immutable revisions only need diffing when history changes, not on every draft keystroke.
  const rows = useMemo(() => history.map((revision) => {
    const previous = history.find((candidate) => candidate.sequence === revision.sequence - 1) ?? null;
    return {
      calculatedDiffs: previous ? recalculatedDiffs(previous.computedSummary, revision.computedSummary) : [],
      previous,
      revision,
      termDiffs: previous ? semanticTermDiffs(previous.terms, revision.terms, role) : [],
    };
  }), [history, role]);
  return (
    <section className="card stack tight" aria-labelledby="loi-history-title">
      <div className="loi-card-head">
        <div>
          <h2 id="loi-history-title">Revision timeline</h2>
          <p className="meta-line">Immutable after submission</p>
        </div>
      </div>
      {pageInfo.hasOlder ? <button className="button secondary sm" disabled={loading} onClick={onLoadOlder} type="button">{loading ? "Loading…" : "Load older versions"}</button> : null}
      {history.length ? (
        <ol className="loi-revision-list">
          {rows.map(({ calculatedDiffs, previous, revision, termDiffs }) => {
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
      <div className="loi-card-head">
        <div>
          <h2 id={headingId}>{heading}</h2>
          <p className="meta-line">Complete proposed-term snapshot</p>
        </div>
        {revision ? <span className="status-tag">Immutable</span> : <span className="status-tag pending">Private draft</span>}
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
        <div className="loi-recalculated-head"><h3 id={recalculatedHeadingId}>Calculated values</h3><span className="status-tag pending">Recalculated</span></div>
        <dl className="loi-review-grid">
          {loiSummaryRows(computedSummary).map((row) => <div key={row.fieldId}><dt>{row.label}</dt><dd>{row.formattedValue}</dd></div>)}
        </dl>
      </section>

      <div className="inline-alert loi-nonbinding-notice">
        <Icon name="info" size={20} />
        <p><strong>Non-binding</strong> <span>Proposed terms for contract preparation — not a signature, escrow instruction, or payment.</span></p>
      </div>
    </section>
  );
}

function PropertyIdentity({ property }: { property: ReturnType<typeof normalizePropertyIdentity> }) {
  return (
    <section className="loi-property-identity" aria-label="Immutable property identity">
      <span aria-hidden="true" className="loi-property-mark"><Icon name="home" size={22} /></span>
      <span className="loi-property-text">
        <strong>{property.title}</strong>
        {property.location ? <span>{property.location}</span> : null}
        <span className="meta-line">
          Captured with this negotiation{property.identityVersion === null ? "" : ` · identity version ${property.identityVersion}`}
        </span>
      </span>
    </section>
  );
}

function DiffList({ diffs, recalculated = false }: { diffs: LoiSemanticDiff[]; recalculated?: boolean }) {
  return (
    <dl className="loi-diff-list">
      {diffs.map((diff) => (
        <div key={`${diff.section}:${diff.fieldId}`}>
          <dt>{diff.label}{recalculated ? <span className="status-tag pending">Recalculated</span> : null}</dt>
          <dd><span>{diff.from}</span><span aria-hidden="true">→</span><strong>{diff.to}</strong></dd>
        </div>
      ))}
    </dl>
  );
}

function Summary({ summary, terms, viewerRole = "BUYER", compact = false, detailsOnly = false, issues = [] }: { summary: LoiComputedSummary | null; terms: LoiTermsV1 | null; viewerRole?: LoiRole; compact?: boolean; detailsOnly?: boolean; issues?: LoiCalculationIssue[] }) {
  if (!summary || !terms) return <p className="muted">Complete valid draft fields to see your calculated summary.</p>;
  if (detailsOnly && summary.calculationVersion === 1) return <p className="muted">Closing costs were not calculated in this historical version.</p>;
  const isBuyer = viewerRole === "BUYER";
  return <div className="stack tight">
    {issues.length ? <div className="loi-calculator-issues" role="status">
      <strong>Figures use the amounts entered</strong>
      {issues.map((issue) => <span key={issue.path}>{issue.message}</span>)}
    </div> : null}
    {!detailsOnly && isBuyer && summary.calculationVersion !== 1 ? <section className="loi-cash-callout" aria-label="Buyer cash needed">
      <div aria-live="polite" aria-atomic="true">
        <p className="loi-cash-callout-label">Estimated total cash needed</p>
        <strong className="loi-cash-callout-amount">{formatLoiMoney(summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents)}</strong>
        <p className="loi-cash-callout-caption">Includes your deposit and entered closing fees</p>
      </div>
      <dl className="loi-cash-callout-breakdown">
        <div><dt>Earnest-money deposit</dt><dd>{formatLoiMoney(summary.earnestMoneyCents)}</dd></div>
        <div><dt>Expected cash to close<br /><span className="muted small">Remaining balance</span></dt><dd>{formatLoiMoney(summary.buyerCashDueAtClosingCents)}</dd></div>
      </dl>
      <p className="field-hint">Deposit + remaining closing balance. If your deposit is already paid, use the remaining balance.</p>
    </section> : null}
    {!detailsOnly ? <dl className="loi-summary-list">
      <div><dt>Purchase price</dt><dd>{formatLoiMoney(terms.purchasePriceCents)}</dd></div>
      {isBuyer ? <>
        <div><dt>Loan amount</dt><dd>{formatLoiMoney(summary.loanAmountCents)}</dd></div>
        {!compact || summary.calculationVersion === 1 ? <div><dt>Earnest money</dt><dd>{formatLoiMoney(summary.earnestMoneyCents)}</dd></div> : null}
      </> : terms.funding.type === "SELLER_FINANCING" ? <div><dt>Seller-financed principal</dt><dd>{formatLoiMoney(summary.loanAmountCents)}</dd></div> : null}
    </dl> : null}
    {!compact && summary.calculationVersion !== 1 ? <section className="stack tight" aria-label={isBuyer ? "Buyer fee estimates" : "Seller fee estimates"}>
      <h3>{isBuyer ? "Your buyer fees" : "Your seller fees"}</h3>
      <dl className="loi-summary-list">
        {loiFeeBreakdown(terms, summary).map((row) => {
          const cents = isBuyer ? row.buyerCents : row.sellerCents;
          return <div key={row.label}><dt>{row.label}</dt><dd>{cents === null ? "Not estimated" : formatLoiMoney(cents)}</dd></div>;
        })}
        <div><dt><strong>{isBuyer ? "Buyer closing-cost estimate" : "Seller closing-cost estimate"}</strong></dt><dd><strong>{formatLoiMoney(isBuyer ? summary.buyerClosingCostsCents : summary.sellerClosingCostsCents)}</strong></dd></div>
      </dl>
      <p className="field-hint">Your share only. Fees paid by the other party show $0.00. {(summary.calculationVersion === 4 || summary.calculationVersion === 5) ? "Escrow includes the scheduled fee unless you enter a quote." : "Escrow reflects the quotes stored with this version."}</p>
    </section> : null}
    {!compact ? loiCashEquations(terms, summary).filter((equation) => equation.label === (isBuyer ? "Buyer cash calculation" : "Seller cash calculation")).map((equation) => <section className="stack tight" aria-label={equation.label} key={equation.label}>
      <h3>{equation.label}</h3>
      <dl className="loi-summary-list">
        {equation.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.operator} {formatLoiMoney(row.cents)}</dd></div>)}
        <div><dt><strong>{equation.totalLabel}</strong></dt><dd><strong>= {formatLoiMoney(equation.totalCents)}</strong></dd></div>
      </dl>
    </section>) : null}
    {!compact && (summary.calculationVersion === 3 || (summary.calculationVersion === 4 || summary.calculationVersion === 5)) && summary.monthlyRentBackCents ? <p className="small">Monthly rent-back (separate from {isBuyer ? "closing cash" : "proceeds"}): {formatLoiMoney(summary.monthlyRentBackCents)}</p> : null}
    {compact && summary.calculationVersion !== 1 && !summary.closingCostEstimateComplete ? <p className="field-hint">Estimate incomplete. Add remaining fees below.</p> : null}
    {!compact && summary.calculationVersion !== 1 ? <p className="small">{summary.closingCostEstimateComplete ? "Based on your provided estimates; actual charges may differ." : "Estimates incomplete. Missing fees are excluded from these subtotals."} {isBuyer ? "Your cash calculation credits the deposit and seller credit once." : "Your proceeds subtract your fees, seller credit, and any seller-financed principal. Existing loan payoffs are separate."} Prorations and charges not entered are excluded. A negative balance is a modeled credit, subject to lender and escrow approval.</p> : null}
  </div>;
}

function LoiDecisionDialog({ busy, current, decision, error, onClose, onConfirm, payoff, propertySnapshot, role }: {
  busy: boolean;
  current: LoiRevision | null;
  decision: Decision;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
  payoff: string;
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
    : decision === "decline" ? `Decline version ${current?.sequence ?? "draft"}?`
    : decision === "discard" ? current ? "Discard your counter draft?" : "Reset your initial draft?" : "Withdraw this LOI?";
  const confirmLabel = decision === "agree"
    ? `Align on version ${current?.sequence} for contract preparation`
    : decision === "decline" ? `Decline version ${current?.sequence}`
    : decision === "discard" ? current ? "Discard counter draft" : "Reset initial draft"
    : current ? `Withdraw version ${current.sequence}` : "Withdraw initial draft";

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
        <div className="loi-dialog-head">
          <div><h2 id={titleId}>{title}</h2><p className="meta-line">{decision === "discard" ? "Private draft only" : "Confirm exact LOI version"}</p></div>
          <button aria-label="Close decision dialog" className="message-dialog-close loi-dialog-close" disabled={busy} onClick={onClose} type="button"><Icon name="close" size={20} /></button>
        </div>
        {error ? <div className="inline-alert danger" role="alert"><Icon name="info" size={20} /><p>{error}</p></div> : null}
        {decision === "discard" ? (
          <p>{current ? "This removes your saved counter and unsaved changes. The submitted version stays unchanged." : "This removes your saved draft and unsaved changes, then starts again with the original suggested terms."}</p>
        ) : current ? (
          <>
            <section className="card stack tight loi-decision-summary" aria-label={`Version ${current.sequence} decision summary`}>
              <PropertyIdentity property={normalizePropertyIdentity(propertySnapshot)} />
              {role === "SELLER"
                ? <LoiSellerProceedsBreakdown summary={current.computedSummary} terms={current.terms} payoff={payoff} />
                : <Summary summary={current.computedSummary} terms={current.terms} viewerRole={role} />}
              <p><strong>Exact response deadline:</strong> <time dateTime={current.responseDeadline}>{formatLoiDateTime(current.responseDeadline)}</time></p>
            </section>
            <TermsReview computedSummary={current.computedSummary} heading={`Version ${current.sequence} complete terms`} propertySnapshot={propertySnapshot} revision={current} role={role} terms={current.terms} />
          </>
        ) : (
          <section className="card stack tight loi-decision-summary">
            <PropertyIdentity property={normalizePropertyIdentity(propertySnapshot)} />
            <p>No terms have been submitted. Withdrawal will close the initial private-draft workflow.</p>
          </section>
        )}
        {decision !== "discard" ? <p className="fine-print">This records non-binding proposed-term status for contract preparation. It is not a signature or binding acceptance.</p> : null}
        <div className="actions right loi-dialog-actions">
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
    const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : "";
    throw new LoiRequestError(response.status, fieldErrors, code);
  }
  return body;
}

class LoiRequestError extends Error {
  constructor(readonly status: number, readonly fieldErrors: unknown, readonly code = "") {
    super("LOI request failed.");
  }
}

function message(error: unknown) {
  if (error instanceof LoiRequestError && error.code === "FINANCING_EVIDENCE_REQUIRED") return FINANCING_EVIDENCE_REQUIRED_MESSAGE;
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

function statusTone(status: string | null) {
  if (status === "TERMS_ALIGNED") return "active";
  if (status === "AWAITING_BUYER_RESPONSE" || status === "AWAITING_BUYER_SUBMISSION" || status === "AWAITING_SELLER_RESPONSE") return "pending";
  if (status === "DECLINED" || status === "WITHDRAWN" || status === "EXPIRED") return "expired";
  return "";
}

function viewModeLabel(mode: LoiWorkspaceViewState["mode"]) {
  return mode === "CURRENT" ? "current version" : mode === "HISTORICAL" ? "historical version" : mode === "EDITING" ? "private draft editor" : "saved draft review";
}

// The key figure stays in the fixed action bar so phone users see each edit's effect without scrolling.
function liveCalculatorTotal(summary: LoiComputedSummary | null, role: LoiRole, payoff: string) {
  if (!summary || summary.calculationVersion === 1) return null;
  if (role === "BUYER") return { label: "Total cash needed", value: formatLoiMoney(summary.buyerCashDueAtClosingCents + summary.earnestMoneyCents) };
  const net = sellerNetProceeds(summary, parseSellerLoanPayoff(payoff).cents);
  return net === null
    ? { label: "Seller cash before loan payoff", value: formatLoiMoney(summary.sellerCashBeforePayoffsCents) }
    : { label: "Net proceeds", value: formatLoiMoney(net) };
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
