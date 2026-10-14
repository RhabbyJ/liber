"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TourMutation, TourView } from "../../lib/tour-scheduling";
import { Icon } from "../icon";

type View = TourView & { emailRemindersAvailable?: boolean };

export function TourScheduler({ conversationId, muted }: { conversationId: string; muted: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [localTime, setLocalTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [clock, setClock] = useState(0);
  const mutationRef = useRef(false);
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const loadRef = useRef<AbortController | null>(null);
  const path = `/api/conversations/${encodeURIComponent(conversationId)}/tour`;

  const refresh = useCallback(async () => {
    if (loadRef.current || mutationRef.current) return;
    const controller = new AbortController();
    loadRef.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8_000);
    try {
      const next = await requestTour(path, { signal: controller.signal, cache: "no-store" });
      if (!controller.signal.aborted && !mutationRef.current) { setView(next); setLoadError(false); }
    } catch { if (timedOut || !controller.signal.aborted) setLoadError(true); }
    finally { window.clearTimeout(timer); if (loadRef.current === controller) loadRef.current = null; }
  }, [path]);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setClock(Date.now());
    void refresh();
    const tick = () => { setClock(Date.now()); if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      // Clear the in-flight marker too, so a remount (Strict Mode, fast refresh) loads immediately.
      loadRef.current?.abort();
      loadRef.current = null;
    };
  }, [refresh]);

  const schedule = view?.schedule;
  const past = schedule ? new Date(schedule.startsAt).getTime() <= clock : false;
  const finished = schedule ? new Date(schedule.startsAt).getTime() + schedule.durationMinutes * 60_000 <= clock : false;
  const status = schedule?.status === "CANCELLED" ? "Tour cancelled"
    : schedule?.status === "CONFIRMED" ? finished ? "Follow up on your tour" : "Tour confirmed"
      : schedule ? past ? "Proposal expired" : schedule.proposedByYou ? "Waiting for tour confirmation" : "New tour time proposed"
        : "Schedule a tour";

  async function mutate(input: Omit<Extract<TourMutation, { action: "PROPOSE" }>, "clientActionId"> | Omit<Extract<TourMutation, { action: "CONFIRM" | "CANCEL" }>, "clientActionId">) {
    if (mutationRef.current) return;
    mutationRef.current = true;
    loadRef.current?.abort();
    const signature = JSON.stringify(input);
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
    setPending(true); setError(""); setNotice("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const next = await requestTour(path, {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, clientActionId: requestRef.current.id }),
      });
      setView((current) => ({ ...current, ...next }));
      requestRef.current = null;
      setEditing(false); setCancelOpen(false);
      setNotice(input.action === "CONFIRM" ? "Tour confirmed." : input.action === "CANCEL" ? "Tour cancelled." : "Tour time proposed. The other participant needs to confirm it.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The tour could not be updated. Please try again."); }
    finally { window.clearTimeout(timer); mutationRef.current = false; setPending(false); void refresh(); }
  }

  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = new Date(localTime);
    if (Number.isNaN(date.getTime()) || toLocalInput(date) !== localTime) {
      setError("Choose a valid local date and time. This time may not exist because of daylight saving time.");
      return;
    }
    void mutate({ action: "PROPOSE", expectedRevision: schedule?.revision ?? 0, startsAt: date.toISOString(), timeZone, durationMinutes: duration as 30 | 60 | 90 | 120 });
  }

  if (!view) return loadError ? <div className="tour-scheduler tour-load-error"><Icon name="calendar" size={18} /><span>Tour scheduling could not load.</span><button className="button secondary sm" onClick={() => void refresh()} type="button">Retry tour scheduling</button></div> : null;
  if (!view.canSchedule && !schedule) return null;
  return (
    <section aria-label="Property tour" className="tour-scheduler">
      <button aria-controls={`tour-${conversationId}`} aria-expanded={open} className="tour-toggle" onClick={() => setOpen(!open)} type="button">
        <span aria-hidden="true" className="tour-toggle-icon"><Icon name="calendar" size={20} /></span>
        <span className="tour-toggle-copy"><strong>{status}</strong>{schedule ? <span className="tour-date">{formatTime(schedule.startsAt, schedule.timeZone)}</span> : <span className="tour-date">Agree on a time together in Liber</span>}</span>
        <Icon className="tour-toggle-chevron" name="chevron-down" size={20} />
      </button>
      {open ? <div className="tour-content" id={`tour-${conversationId}`}>
        {error ? <div className="inline-alert danger" role="alert"><Icon name="info" size={20} /><p>{error}</p></div> : null}
        {notice ? <p className="tour-notice" role="status">{notice}</p> : null}
        {loadError ? <p className="tour-notice" role="status">The latest tour could not be refreshed. Reconnect before making changes.</p> : null}
        {schedule ? <p className="tour-meta">{schedule.durationMinutes} minutes · {schedule.timeZone}{timeZone !== schedule.timeZone ? ` · Your time: ${formatTime(schedule.startsAt, timeZone)}` : ""}</p> : null}
        {!view.canSchedule ? <p>This conversation is read-only. The tour cannot be changed and reminders will not be sent.</p> : <>
          {schedule?.status === "CONFIRMED" && finished ? <div className="tour-follow-up"><strong>How did the tour go?</strong><p>Use the chat below to ask follow-up questions or discuss next steps. When you are ready, open the LOI from Conversation details.</p><button className="button secondary sm" onClick={() => { setOpen(false); document.getElementById("message-draft")?.focus(); }} type="button">Back to messages</button></div> : null}
          {schedule?.status === "PROPOSED" && !past ? <p>{schedule.proposedByYou ? "The other participant must confirm before this is a scheduled tour." : "Review this time, then confirm or propose another time."}</p> : null}
          {!editing ? <div className="tour-actions">
            {schedule?.status === "PROPOSED" && !schedule.proposedByYou && !past ? <button className="button primary sm" disabled={pending} onClick={() => void mutate({ action: "CONFIRM", expectedRevision: schedule.revision })} type="button">Confirm tour</button> : null}
            <button className="button secondary sm" disabled={pending} onClick={() => { setEditing(true); setCancelOpen(false); setError(""); }} type="button">{schedule && schedule.status !== "CANCELLED" && !past ? "Propose another time" : "Propose a tour time"}</button>
            {schedule && schedule.status !== "CANCELLED" && !past && !cancelOpen ? <button className="button ghost sm" disabled={pending} onClick={() => setCancelOpen(true)} type="button">Cancel tour</button> : null}
          </div> : <form className="tour-form" onSubmit={propose}>
            <div className="tour-form-fields">
              <div className="field">
                <label htmlFor={`tour-time-${conversationId}`}>Date and time <span>({timeZone})</span></label>
                <input disabled={pending} id={`tour-time-${conversationId}`} onChange={(event) => setLocalTime(event.target.value)} required type="datetime-local" value={localTime} />
              </div>
              <div className="field">
                <label htmlFor={`tour-duration-${conversationId}`}>Tour length</label>
                <select disabled={pending} id={`tour-duration-${conversationId}`} onChange={(event) => setDuration(Number(event.target.value))} value={duration}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>1½ hours</option><option value={120}>2 hours</option></select>
              </div>
            </div>
            <p className="field-hint">A new proposal replaces the current time and needs confirmation from the other participant.</p>
            <div className="tour-actions"><button className="button primary sm" disabled={pending} type="submit">{pending ? "Saving…" : "Send time proposal"}</button><button className="button secondary sm" disabled={pending} onClick={() => setEditing(false)} type="button">Keep current schedule</button></div>
          </form>}
          {cancelOpen && schedule ? <div className="tour-cancel"><p>Cancel this tour and its reminders?</p><div className="tour-actions"><button className="button secondary sm" disabled={pending} onClick={() => void mutate({ action: "CANCEL", expectedRevision: schedule.revision })} type="button">Yes, cancel tour</button><button className="button ghost sm" disabled={pending} onClick={() => setCancelOpen(false)} type="button">Keep tour</button></div></div> : null}
          <p className="tour-delivery-note">{muted ? "This conversation is muted. You will not receive tour emails." : view.emailRemindersAvailable ? "Email reminders and a post-tour follow-up are scheduled after confirmation. Tour details stay in Liber." : "Your tour is saved in Liber. Email reminders are currently unavailable; check this conversation for updates."}</p>
        </>}
      </div> : null}
    </section>
  );
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

async function requestTour(path: string, init: RequestInit): Promise<View> {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The tour could not be updated.");
  if (typeof body.canSchedule !== "boolean" || !(body.schedule === null || (
    body.schedule && ["PROPOSED", "CONFIRMED", "CANCELLED"].includes(body.schedule.status)
    && Number.isInteger(body.schedule.revision) && Number.isFinite(new Date(body.schedule.startsAt).getTime())
  ))) throw new Error("The tour response could not be loaded.");
  return body as View;
}
