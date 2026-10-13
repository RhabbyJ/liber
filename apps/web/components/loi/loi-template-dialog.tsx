"use client";

import type { LoiTermsV1 } from "@liber/validators";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createLoiTemplate, type LoiTemplate } from "./loi-template-values";
import { loiTemplateStorageKey, readLoiTemplates, removeLoiTemplate, saveLoiTemplate, type LoiTemplateStorage } from "./loi-template-storage";
import "./loi-template-dialog.css";

function browserStorage(): LoiTemplateStorage | null {
  try { return window.localStorage; } catch { return null; }
}

export function LoiTemplateDialog({ mode, ownerId, terms, busy = false, onClose, onApply, onSaved }: {
  mode: "save" | "use";
  ownerId: string;
  terms: LoiTermsV1;
  busy?: boolean;
  onClose: () => void;
  onApply: (template: LoiTemplate) => void;
  onSaved: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(true);
  const initialFocusDone = useRef(false);
  const id = useId();
  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<LoiTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(true);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);

  useEffect(() => {
    initialFocusDone.current = false;
    const refresh = () => {
      const result = readLoiTemplates(browserStorage(), ownerId);
      setUnavailable(!result.ok);
      if (result.ok) { setTemplates(result.templates); setError(""); setSelectedId((current) => result.templates.some((item) => item.id === current) ? current : result.templates[0]?.id ?? ""); }
      else { setTemplates([]); setSelectedId(""); setError(result.error); }
      setLoadedOwner(ownerId);
    };
    refresh();
    const changed = (event: StorageEvent) => {
      try { if (event.key === null || event.key === loiTemplateStorageKey(ownerId)) refresh(); } catch { refresh(); }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [ownerId]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = active?.closest("details")?.querySelector<HTMLElement>("summary") ?? active;
    if (!element.open) element.showModal();
    initialFocusDone.current = false;
    return () => { element.close(); if (restoreTriggerFocus.current && trigger?.isConnected) trigger.focus(); };
  }, [mode]);

  useEffect(() => {
    if (loadedOwner !== ownerId || initialFocusDone.current || !dialog.current?.open) return;
    const frame = window.requestAnimationFrame(() => {
      if (initialFocusDone.current) return;
      const target = mode === "save" ? firstField.current : firstChoice.current;
      if (target && !target.disabled) target.focus(); else cancel.current?.focus();
      initialFocusDone.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadedOwner, mode, ownerId, unavailable, templates.length]);

  function save(event: FormEvent) {
    event.preventDefault();
    if (busy || unavailable || !name.trim()) return;
    try {
      const latest = readLoiTemplates(browserStorage(), ownerId);
      if (!latest.ok) { setError(latest.error); return; }
      const matching = latest.templates.find((template) => template.name.toLocaleLowerCase("en-US") === name.trim().normalize("NFC").toLocaleLowerCase("en-US"));
      if (matching && matching.id !== existing?.id) {
        setTemplates(latest.templates);
        setError("A template with this name was saved elsewhere. Review the replacement below, then choose Update template.");
        return;
      }
      const template = createLoiTemplate({ id: crypto.randomUUID(), name: name.trim(), terms, now: new Date().toISOString() });
      const result = saveLoiTemplate(browserStorage(), ownerId, template);
      if (!result.ok) { setError(result.error); return; }
      onSaved(result.saved.name);
      onClose();
    } catch { setError("Enter a template name and complete valid reusable terms before saving."); }
  }

  function apply() {
    if (busy || unavailable) return;
    const latest = readLoiTemplates(browserStorage(), ownerId);
    if (!latest.ok) { setError(latest.error); return; }
    const selected = latest.templates.find((item) => item.id === selectedId);
    if (!selected) { setTemplates(latest.templates); setError("This template changed or was removed. Choose an available template."); return; }
    restoreTriggerFocus.current = false;
    onApply(selected);
    onClose();
  }

  function remove() {
    if (busy || !removeId) return;
    const result = removeLoiTemplate(browserStorage(), ownerId, removeId);
    if (!result.ok) { setError(result.error); return; }
    setTemplates(result.templates);
    setSelectedId(result.templates[0]?.id ?? "");
    setRemoveId(null);
    setError("");
  }

  const existing = templates.find((template) => template.name.toLocaleLowerCase("en-US") === name.trim().normalize("NFC").toLocaleLowerCase("en-US"));
  const deleting = templates.find((template) => template.id === removeId);
  return <dialog aria-busy={busy} aria-labelledby={`${id}-title`} aria-describedby={`${id}-privacy`} className="loi-native-dialog loi-template-dialog" ref={dialog}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="stack loi-template-dialog-body">
      <div className="row between start"><h2 id={`${id}-title`}>{mode === "save" ? "Save LOI template" : "Use a saved LOI template"}</h2><button aria-label="Close template dialog" className="message-dialog-close" disabled={busy} onClick={onClose} type="button">×</button></div>
      <p className="small" id={`${id}-privacy`}>Templates are private to your account in this browser. They are not synced to your phone or another browser.</p>
      {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
      {deleting ? <section className="card stack tight" aria-label="Confirm template removal">
        <p>Remove <strong>{deleting.name}</strong> from this browser? Existing LOI drafts stay unchanged.</p>
        <div className="actions"><button className="button secondary" disabled={busy} onClick={() => setRemoveId(null)} type="button">Keep template</button><button className="button warning" disabled={busy} onClick={remove} type="button">Remove template</button></div>
      </section> : mode === "save" ? <form className="stack" onSubmit={save}>
        <div className="field"><label htmlFor={`${id}-name`}>Template name</label><input autoComplete="off" disabled={busy || unavailable} id={`${id}-name`} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Standard buyer terms" ref={firstField} required type="text" value={name} /></div>
        {templates.length ? <div className="field"><label htmlFor={`${id}-existing`}>Update a saved template (optional)</label><select disabled={busy || unavailable} id={`${id}-existing`} onChange={(event) => setName(event.target.value)} value={existing?.name ?? ""}><option value="">Save with a new name</option>{templates.map((template) => <option key={template.id} value={template.name}>{template.name}</option>)}</select></div> : null}
        <p className="small">Saves reusable preferences from the terms currently on this page. Buyer identity, purchase price, funding, seller credit, and disclosures are excluded. Review all saved amounts when using a template for another property.</p>
        {existing ? <p className="small">Saving will update <strong>{existing.name}</strong>.</p> : null}
        <div className="actions right"><button className="button secondary" disabled={busy} onClick={onClose} ref={cancel} type="button">Cancel</button><button className="button primary" disabled={busy || unavailable || !name.trim()} type="submit">{existing ? "Update template" : "Save template"}</button></div>
      </form> : <div className="stack">
        {templates.length ? <fieldset className="loi-template-choices stack tight" disabled={busy || unavailable}><legend>Choose a template</legend>{templates.map((template, index) => <label className="loi-template-choice" key={template.id}><input checked={selectedId === template.id} name={`${id}-template`} onChange={() => setSelectedId(template.id)} ref={index === 0 ? firstChoice : undefined} type="radio" value={template.id} /><span><strong>{template.name}</strong><span className="small">Updated {new Date(template.updatedAt).toLocaleDateString()}</span></span></label>)}</fieldset> : !unavailable ? <p>No saved templates in this browser yet. Use Save LOI template to create one.</p> : null}
        <p className="small">Applying replaces reusable preferences in the current draft. Buyer identity, purchase price, funding, seller credit, and disclosures stay unchanged. Review the resulting terms before saving or submitting.</p>
        <div className="actions right"><button className="button secondary" disabled={busy} onClick={onClose} ref={cancel} type="button">Cancel</button>{templates.length ? <button className="button secondary" disabled={busy || unavailable || !selectedId} onClick={() => setRemoveId(selectedId)} type="button">Remove selected template</button> : null}<button className="button primary" disabled={busy || unavailable || !selectedId} onClick={apply} type="button">Apply template</button></div>
      </div>}
    </div>
  </dialog>;
}
