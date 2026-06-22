"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { signupWithPassword } from "../server/auth-actions";
import { Icon } from "./icon";

type Role = "buyer" | "seller" | "both";

type Notice = { tone: string; title: string; body: string };

type Props = {
  initialRole: Role | null;
  initialEmail: string;
  initialStep: number | null;
  next: string;
  notice: Notice | null;
};

const STEP_LABELS = ["You", "Name", "Email", "Password"] as const;
const SIGNUP_DRAFT_KEY = "liber.signup.draft";
const SIGNUP_WIZARD_FALLBACK = String.raw`
(() => {
  const draftKey = "liber.signup.draft";

  function init(flow) {
    if (flow.dataset.signupFallbackReady === "true") return;
    flow.dataset.signupFallbackReady = "true";

    const form = flow.querySelector("[data-signup-form]");
    const panes = Array.from(flow.querySelectorAll("[data-signup-pane]"));
    const steps = Array.from(flow.querySelectorAll("[data-signup-step-item]"));
    const progress = flow.querySelector("[data-signup-progress]");
    const back = flow.querySelector("[data-signup-back]");
    const next = flow.querySelector("[data-signup-next]");
    const error = flow.querySelector("[data-signup-error]");
    const roleInput = form?.querySelector('input[name="role"]');
    const roleCards = Array.from(flow.querySelectorAll("[data-signup-role]"));
    if (!form || panes.length === 0) return;

    let step = panes.findIndex((pane) => !pane.hidden);
    if (step < 0) step = roleInput?.value ? 1 : 0;

    function text(name) {
      const input = form.querySelector('input[name="' + name + '"]');
      return input?.value.trim() || "";
    }

    function setRole(value) {
      if (roleInput) roleInput.value = value;
      roleCards.forEach((item) => {
        const selected = item.dataset.signupRole === value;
        item.classList.toggle("selected", selected);
        const check = item.querySelector(".signup-role-check");
        if (check) check.hidden = !selected;
      });
    }

    function restoreDraft() {
      try {
        if (flow.dataset.signupHasNotice !== "true") {
          window.sessionStorage.removeItem(draftKey);
          return;
        }
        const draft = JSON.parse(window.sessionStorage.getItem(draftKey) || "{}");
        if (draft.role && !roleInput?.value) setRole(draft.role);
        const nameInput = form.querySelector('input[name="name"]');
        const emailInput = form.querySelector('input[name="email"]');
        const emailMatches = !emailInput?.value || !draft.email || emailInput.value === draft.email;
        if (nameInput && draft.name && emailMatches) nameInput.value = draft.name;
        if (emailInput && !emailInput.value && draft.email) emailInput.value = draft.email;
      } catch {}
    }

    function saveDraft() {
      try {
        window.sessionStorage.setItem(
          draftKey,
          JSON.stringify({ email: text("email"), name: text("name"), role: roleInput?.value || "buyer" })
        );
      } catch {}
    }

    function setError(message) {
      if (!error) return;
      error.textContent = message || "";
      error.hidden = !message;
    }

    function validate() {
      if (step === 0 && !roleInput?.value) return "Pick one to continue.";
      if (step === 1 && text("name").length < 1) return "Add your name to continue.";
      if (step === 2) {
        const email = text("email");
        if (!email) return "Enter your email.";
        if (!/^\S+@\S+\.\S+$/.test(email)) return "Use a valid email format.";
      }
      if (step === 3) {
        const password = text("password");
        if (!password) return "Create a password.";
        if (password.length < 12) return "Use at least 12 characters.";
      }
      return null;
    }

    function render(shouldFocus) {
      panes.forEach((pane, index) => {
        const active = index === step;
        pane.hidden = !active;
        pane.setAttribute("aria-hidden", active ? "false" : "true");
      });
      steps.forEach((item, index) => {
        item.classList.toggle("active", index === step);
        item.classList.toggle("done", index < step);
        if (index === step) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
      if (progress) progress.style.width = ((step + 1) / panes.length) * 100 + "%";
      if (back) back.disabled = step === 0;
      if (next) next.type = step >= panes.length - 1 ? "submit" : "button";
      if (shouldFocus) window.setTimeout(() => panes[step]?.querySelector("input")?.focus(), 0);
    }

    function go(delta) {
      setError("");
      step = Math.max(0, Math.min(step + delta, panes.length - 1));
      render(true);
    }

    roleCards.forEach((card) => {
      card.addEventListener("click", () => {
        setRole(card.dataset.signupRole || "buyer");
      });
    });

    next?.addEventListener("click", (event) => {
      const message = validate();
      if (message) {
        event.preventDefault();
        return setError(message);
      }
      if (step >= panes.length - 1) return;
      event.preventDefault();
      go(1);
    });

    back?.addEventListener("click", (event) => {
      event.preventDefault();
      go(-1);
    });

    form.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || step >= panes.length - 1 || event.target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      const message = validate();
      if (message) return setError(message);
      go(1);
    });

    form.addEventListener("input", () => setError(""));
    form.addEventListener("submit", (event) => {
      const message = validate();
      if (message) {
        event.preventDefault();
        setError(message);
        return;
      }
      saveDraft();
    });

    restoreDraft();
    render(false);
  }

  function boot() {
    document.querySelectorAll("[data-signup-wizard]").forEach(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
`;

const ROLE_CARDS: Array<{
  value: Role;
  label: string;
  description: string;
  icon: "user" | "search" | "compass";
}> = [
  {
    value: "buyer",
    label: "Looking to buy a home",
    description: "Publish a verified buyer profile and let serious sellers reach out.",
    icon: "user",
  },
  {
    value: "seller",
    label: "Looking to sell a home",
    description: "Search the buyer directory before you list and send manual invites.",
    icon: "search",
  },
  {
    value: "both",
    label: "Both, actually",
    description: "Run buyer and seller workflows from one Liber account.",
    icon: "compass",
  },
];

export function SignupWizard({ initialRole, initialEmail, initialStep, next, notice }: Props) {
  const startingStep = initialStep ?? (initialRole ? 1 : 0);
  const [step, setStep] = useState(startingStep);
  const [role, setRole] = useState<Role>(initialRole ?? "buyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const total = STEP_LABELS.length;
  const progress = ((step + 1) / total) * 100;

  useEffect(() => {
    const ref = step === 1 ? nameRef : step === 2 ? emailRef : step === 3 ? passwordRef : null;
    if (ref?.current) {
      const id = window.setTimeout(() => ref.current?.focus(), 220);
      return () => window.clearTimeout(id);
    }
  }, [step]);

  useEffect(() => {
    if (!notice) {
      clearSignupDraft();
      return;
    }

    const draft = readSignupDraft();
    if (!draft) return;
    const emailMatches = !initialEmail || !draft.email || initialEmail === draft.email;
    if (!initialRole && draft.role) setRole(draft.role);
    if (draft.name && emailMatches) setName(draft.name);
    if (!initialEmail && draft.email) setEmail(draft.email);
  }, [initialEmail, initialRole, notice]);

  function validateCurrent(): string | null {
    if (step === 0 && !role) return "Pick one to continue.";
    if (step === 1 && name.trim().length < 1) return "Add your name to continue.";
    if (step === 2) {
      if (!email.trim()) return "Enter your email.";
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Use a valid email format.";
    }
    if (step === 3) {
      if (!password) return "Create a password.";
      if (password.length < 12) return "Use at least 12 characters.";
    }
    return null;
  }

  function goNext() {
    const message = validateCurrent();
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    if (step === total - 1) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    event.preventDefault();
    goNext();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const message = validateCurrent();
    if (message) {
      event.preventDefault();
      setError(message);
      return;
    }
    saveSignupDraft({ email, name, role });
  }

  return (
    <div className="signup-flow" data-signup-has-notice={notice ? "true" : undefined} data-signup-wizard>
      <div className="signup-progress" aria-hidden="true">
        <div className="signup-progress-fill" data-signup-progress style={{ width: `${progress}%` }} />
      </div>
      <ol className="signup-steps" aria-label="Signup steps">
        {STEP_LABELS.map((label, idx) => {
          const isActive = step === idx;
          const isDone = step > idx;
          return (
            <li
              key={label}
              data-signup-step-item
              className={`signup-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="signup-step-num">
                {isDone ? <Icon name="check" size={11} /> : idx + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      <form action={signupWithPassword} className="signup-form" data-signup-form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <input name="next" type="hidden" value={next} />
        <input name="role" type="hidden" value={role} />

        {notice ? (
          <div className={`auth-alert ${notice.tone}`}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ) : null}

        <section className="signup-pane" data-signup-pane hidden={step !== 0} aria-hidden={step !== 0} key={`pane-${step}`}>
          <p className="signup-eyebrow">Step 1 of {total}</p>
          <h1 className="signup-question">What brings you to Liber?</h1>
          <p className="signup-helper">Pick the path that fits today. You can add the other later.</p>
          <div className="signup-role-cards">
            {ROLE_CARDS.map((card) => {
              const selected = role === card.value;
              return (
                <button
                  className={`signup-role-card ${selected ? "selected" : ""}`}
                  data-signup-role={card.value}
                  key={card.value}
                  onClick={() => setRole(card.value)}
                  type="button"
                >
                  <span className="signup-role-icon">
                    <Icon name={card.icon} size={20} />
                  </span>
                  <span className="signup-role-text">
                    <strong>{card.label}</strong>
                    <span>{card.description}</span>
                  </span>
                  {selected ? (
                    <span className="signup-role-check">
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="signup-pane" data-signup-pane hidden={step !== 1} aria-hidden={step !== 1}>
          <p className="signup-eyebrow">Step 2 of {total}</p>
          <h1 className="signup-question">What should we call you?</h1>
          <p className="signup-helper">Only you see this in your buyer portal. You choose a seller-facing display name later.</p>
          <input
            autoComplete="name"
            className="signup-input"
            id="name"
            name="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="First Last"
            ref={nameRef}
            value={name}
          />
        </section>

        <section className="signup-pane" data-signup-pane hidden={step !== 2} aria-hidden={step !== 2}>
          <p className="signup-eyebrow">Step 3 of {total}</p>
          <h1 className="signup-question">What&rsquo;s your email?</h1>
          <p className="signup-helper">We&rsquo;ll send a verification link before your account goes live.</p>
          <input
            autoComplete="email"
            className="signup-input"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            ref={emailRef}
            type="email"
            value={email}
          />
        </section>

        <section className="signup-pane" data-signup-pane hidden={step !== 3} aria-hidden={step !== 3}>
          <p className="signup-eyebrow">Step 4 of {total}</p>
          <h1 className="signup-question">Create a password</h1>
          <p className="signup-helper">Use at least 12 characters with letters and numbers.</p>
          <input
            autoComplete="new-password"
            className="signup-input"
            id="password"
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            ref={passwordRef}
            type="password"
            value={password}
          />
          <div className="signup-summary">
            <span className="signup-summary-row">
              <Icon name="user" size={13} /> {summarizeRole(role)}
            </span>
            <span className="signup-summary-row">
              <Icon name="mail" size={13} /> {email || "—"}
            </span>
          </div>
        </section>

        <p className="signup-error" data-signup-error hidden={!error}>
          {error}
        </p>

        <div className="signup-actions">
          <button className="button ghost" data-signup-back disabled={step === 0} onClick={goBack} type="button">
            Back
          </button>
          <button
            className="button primary lg"
            data-signup-next
            onClick={step < total - 1 ? goNext : undefined}
            type={step < total - 1 ? "button" : "submit"}
          >
            Continue
            <Icon name="arrow-right" size={14} />
          </button>
        </div>

        <p className="signup-foot muted small">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Log in</Link>
        </p>
      </form>
      <script dangerouslySetInnerHTML={{ __html: SIGNUP_WIZARD_FALLBACK }} />
    </div>
  );
}

function summarizeRole(role: Role) {
  if (role === "seller") return "Selling a home";
  if (role === "both") return "Buyer and seller";
  return "Buying a home";
}

function saveSignupDraft(draft: { email: string; name: string; role: Role }) {
  try {
    window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Session storage is best-effort recovery for same-browser signup errors.
  }
}

function readSignupDraft(): { email?: string; name?: string; role?: Role } | null {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { email?: unknown; name?: unknown; role?: unknown };
    return {
      email: typeof draft.email === "string" ? draft.email : undefined,
      name: typeof draft.name === "string" ? draft.name : undefined,
      role: draft.role === "buyer" || draft.role === "seller" || draft.role === "both" ? draft.role : undefined,
    };
  } catch {
    return null;
  }
}

function clearSignupDraft() {
  try {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    // Ignore blocked storage; the form still works without draft recovery.
  }
}
