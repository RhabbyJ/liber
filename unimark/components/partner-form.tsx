"use client";

import { useId, useState, type FormEvent } from "react";
import { partners } from "@/content/pages";
import { site } from "@/content/site";
import { track } from "@/lib/track";
import { Placeholder } from "./ui";

type Status = { kind: "idle" | "sending" | "sent" | "mail" | "error"; message?: string };

const FIELD =
  "mt-2 block w-full rounded-xl border-0 bg-paper px-4 py-3.5 text-[1rem] text-ink ring-1 ring-line transition-shadow placeholder:text-muted/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal";
const LABEL = "block text-[0.9rem] font-bold text-ink";

/**
 * Partner inquiry form. Submits JSON to `site.partnerFormEndpoint` when set
 * (any Formspree-style service); otherwise opens a pre-filled email to
 * `site.contact.partnerEmail`. With neither configured it shows a placeholder.
 */
export function PartnerForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const uid = useId();
  const endpoint = site.partnerFormEndpoint;
  const email = site.contact.partnerEmail;
  const configured = Boolean(endpoint || email);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    // Honeypot: real people never see or fill this field.
    if (data.company_url) return;
    delete data.company_url;
    const interest = data.interest || "Not specified";

    if (endpoint) {
      setStatus({ kind: "sending" });
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ...data, _subject: `Partner inquiry: ${data.organization}` }),
        });
        if (!res.ok) throw new Error(String(res.status));
        track({ name: "partner_inquiry_submit", props: { method: "endpoint", type: interest } });
        setStatus({ kind: "sent" });
        form.reset();
      } catch {
        setStatus({
          kind: "error",
          message: email ? `Something went wrong. Please try again, or email us at ${email}.` : "Something went wrong. Please try again in a moment.",
        });
      }
      return;
    }

    if (email) {
      const body = [
        `Name: ${data.name}`,
        `Email: ${data.email}`,
        `Organization: ${data.organization}`,
        data.website ? `Website: ${data.website}` : null,
        `Interested in: ${interest}`,
        "",
        data.message,
      ]
        .filter((l) => l !== null)
        .join("\n");
      track({ name: "partner_inquiry_submit", props: { method: "email", type: interest } });
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(`Partner inquiry: ${data.organization}`)}&body=${encodeURIComponent(body)}`;
      setStatus({ kind: "mail" });
    }
  }

  if (status.kind === "sent") {
    return (
      <div role="status" className="rounded-[1.5rem] bg-teal-soft p-8 text-center ring-1 ring-teal/30 sm:p-12">
        <p className="text-[1.6rem] font-extrabold tracking-[-0.03em]">Thanks, we’ve got it.</p>
        <p className="mt-3 text-muted">We read every inquiry and will get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-describedby={configured ? undefined : `${uid}-notice`} className="relative grid gap-6">
      {!configured ? (
        <p id={`${uid}-notice`} className="rounded-xl bg-amber-50 p-4 text-[0.9rem] text-amber-950 ring-1 ring-amber-300">
          <Placeholder label="partner inquiry destination" />
          <span className="mt-2 block">
            Set <code className="font-mono text-[0.85em]">partnerFormEndpoint</code> or <code className="font-mono text-[0.85em]">contact.partnerEmail</code> in{" "}
            <code className="font-mono text-[0.85em]">content/site.ts</code> to receive inquiries.
          </span>
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <label className={LABEL}>
          Your name <span className="text-teal-ink" aria-hidden="true">*</span>
          <input name="name" required autoComplete="name" className={FIELD} />
        </label>
        <label className={LABEL}>
          Work email <span className="text-teal-ink" aria-hidden="true">*</span>
          <input name="email" type="email" required autoComplete="email" className={FIELD} />
        </label>
        <label className={LABEL}>
          Business or organization <span className="text-teal-ink" aria-hidden="true">*</span>
          <input name="organization" required autoComplete="organization" className={FIELD} />
        </label>
        <label className={LABEL}>
          Website <span className="font-medium text-muted">(optional)</span>
          <input name="website" type="url" inputMode="url" autoComplete="url" placeholder="https://" className={FIELD} />
        </label>
      </div>

      <label className={LABEL}>
        What are you interested in?
        <span className="relative block">
          <select name="interest" defaultValue="" className={`${FIELD} appearance-none pr-11`}>
            <option value="" disabled>
              Choose one
            </option>
            {partners.form.interests.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 top-1/2 mt-1 size-5 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </label>

      <label className={LABEL}>
        Tell us about your idea <span className="text-teal-ink" aria-hidden="true">*</span>
        <textarea name="message" required rows={5} className={`${FIELD} resize-y`} />
      </label>

      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <button type="submit" disabled={!configured || status.kind === "sending"} className="btn btn-dark self-start disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
          {status.kind === "sending" ? "Sending…" : "Send inquiry"}
        </button>
        <p role="status" aria-live="polite" className="text-[0.9rem] text-muted">
          {status.kind === "mail" ? "Your email app should open with your message ready to send." : null}
          {status.kind === "error" ? <span className="text-red-700">{status.message}</span> : null}
        </p>
      </div>
      <p className="text-[0.82rem] text-muted">Fields marked * are required.</p>
    </form>
  );
}
