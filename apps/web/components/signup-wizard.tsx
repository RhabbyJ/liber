"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { signupWithPassword } from "../server/auth-actions";
import { normalizeSignupName, publicNamePreview } from "../lib/public-identity";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";
import { SignupHeroIllustration, SignupRoleIllustration } from "./signup-illustration";

type Role = "buyer" | "seller" | "both";

type Notice = { tone: string; title: string; body: string };

type Props = {
  initialRole: Role | null;
  initialEmail: string;
  initialFocus: "name" | "email" | "password" | "notice" | null;
  initialStep: number | null;
  next: string;
  notice: Notice | null;
};

const SIGNUP_DRAFT_KEY = "liber.signup.draft";

const ROLE_CARDS: Array<{ value: Role; label: string; detail: string }> = [
  { value: "buyer", label: "Buy a home", detail: "Publish demand sellers can find and invite." },
  { value: "seller", label: "Sell a home", detail: "Search buyers and invite them privately." },
  { value: "both", label: "Buy and sell", detail: "Use buyer and seller tools in one account." },
];

type ValidationError = { field: "role" | "name" | "email" | "password"; message: string };

export function SignupWizard({ initialRole, initialEmail, initialFocus, initialStep, next, notice }: Props) {
  const startingStep = initialStep ?? 0;
  const [step, setStep] = useState(startingStep);
  const [role, setRole] = useState<Role>(initialRole ?? "buyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ValidationError | null>(null);

  const noticeRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const roleCardRefs = useRef<Partial<Record<Role, HTMLButtonElement | null>>>({});
  const initialFocusAppliedRef = useRef(false);

  const total = 2;

  useEffect(() => {
    if (!initialFocusAppliedRef.current && initialFocus) {
      initialFocusAppliedRef.current = true;
      const target = initialFocus === "notice"
        ? noticeRef
        : initialFocus === "email"
          ? emailRef
          : initialFocus === "password"
            ? passwordRef
            : nameRef;
      const id = window.setTimeout(() => target.current?.focus(), 220);
      return () => window.clearTimeout(id);
    }
    if (step !== 1) return;
    const id = window.setTimeout(() => nameRef.current?.focus(), 220);
    return () => window.clearTimeout(id);
  }, [initialFocus, step]);

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

  function validateCurrent(): ValidationError | null {
    if (step === 0 && !role) return { field: "role", message: "Pick one to continue." };
    if (step === 1) {
      if (!normalizeSignupName(name)) return { field: "name", message: "Enter your first and last name using letters, apostrophes, or hyphens." };
      if (!email.trim()) return { field: "email", message: "Enter your email." };
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { field: "email", message: "Use a valid email format." };
      if (!password) return { field: "password", message: "Create a password." };
      if (password.length < 12) return { field: "password", message: "Use at least 12 characters." };
    }
    return null;
  }

  function goNext() {
    const validationError = validateCurrent();
    if (validationError) {
      showValidationError(validationError);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, total - 1));
  }

  function goBack() {
    setError(null);
    setStep(0);
    window.requestAnimationFrame(() => roleCardRefs.current[role]?.focus());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const validationError = validateCurrent();
    if (validationError) {
      event.preventDefault();
      showValidationError(validationError);
      return;
    }
    saveSignupDraft({ email, name, role });
  }

  function showValidationError(validationError: ValidationError) {
    setError(validationError);
    window.requestAnimationFrame(() => {
      if (validationError.field === "name") nameRef.current?.focus();
      if (validationError.field === "email") emailRef.current?.focus();
      if (validationError.field === "password") passwordRef.current?.focus();
      if (validationError.field === "role") roleCardRefs.current[role]?.focus();
    });
  }

  return (
    <div className="signup-flow" data-signup-has-notice={notice ? "true" : undefined} data-signup-wizard>
      <ol className="signup-steps" aria-label={`Step ${step + 1} of ${total}`}>
        <li className={step === 0 ? "current" : "done"}>
          {step > 0 ? <Icon name="check" size={12} /> : <span>1</span>}
          <strong>Role</strong>
        </li>
        <li aria-current={step === 1 ? "step" : undefined} className={step === 1 ? "current" : undefined}>
          <span>2</span>
          <strong>Account</strong>
        </li>
      </ol>

      <form action={signupWithPassword} className="signup-form" data-signup-form onSubmit={handleSubmit}>
        <input name="next" type="hidden" value={next} />
        <input name="role" type="hidden" value={role} />

        {notice ? (
          <div className={`auth-alert ${notice.tone}`} ref={noticeRef} role="alert" tabIndex={-1}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ) : null}

        <section className="signup-pane" data-signup-pane hidden={step !== 0} aria-hidden={step !== 0}>
          <h1 className="signup-question">How will you use Liber?</h1>
          <p className="signup-helper">Pick a starting role. This routes your first workspace.</p>
          <div className="signup-role-cards">
            {ROLE_CARDS.map((card) => {
              const selected = role === card.value;
              return (
                <button
                  aria-pressed={selected}
                  className={`signup-role-card ${selected ? "selected" : ""}`}
                  data-signup-role={card.value}
                  key={card.value}
                  onClick={() => setRole(card.value)}
                  ref={(node) => { roleCardRefs.current[card.value] = node; }}
                  type="button"
                >
                  <SignupRoleIllustration motion="none" role={card.value} />
                  <span className="signup-role-text">
                    <strong>{card.label}</strong>
                    <small>{card.detail}</small>
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
          <SignupHeroIllustration motion="none" />
          <h1 className="signup-question">Create your account</h1>
          <p className="signup-helper">
            Continuing as {roleLabel(role)}. We&rsquo;ll verify your email.
          </p>
          <div className="signup-account-fields">
            <label className="signup-field" htmlFor="name">
              <span className="signup-field-label">Full name <small>Last name private</small></span>
              <input
                autoComplete="name"
                className="signup-input"
                id="name"
                maxLength={160}
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="First Last"
                ref={nameRef}
                required
                aria-describedby={`signup-identity-description${error?.field === "name" ? " signup-error" : ""}`}
                aria-invalid={error?.field === "name" || undefined}
                value={name}
              />
            </label>
            <p className="muted small" id="signup-identity-description">
              Buyers and sellers see your first name, last initial, and a unique code. Your avatar uses initials; your full last name stays private.
            </p>
            <SignupIdentityPreview name={name} />
            <label className="signup-field" htmlFor="email">
              <span className="signup-field-label">Email</span>
              <input
                autoComplete="email"
                className="signup-input"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                ref={emailRef}
                required
                type="email"
                aria-describedby={error?.field === "email" ? "signup-error" : undefined}
                aria-invalid={error?.field === "email" || undefined}
                value={email}
              />
            </label>
            <label className="signup-field" htmlFor="password">
              <span className="signup-field-label">Password <small>12+ characters</small></span>
              <input
                autoComplete="new-password"
                className="signup-input"
                id="password"
                minLength={12}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                ref={passwordRef}
                required
                type="password"
                aria-describedby={error?.field === "password" ? "signup-error" : undefined}
                aria-invalid={error?.field === "password" || undefined}
                value={password}
              />
            </label>
          </div>
        </section>

        <p className="signup-error" data-signup-error hidden={!error} id="signup-error" role="alert">
          {error?.message}
        </p>

        <div className={`signup-actions ${step === 0 ? "forward-only" : ""}`}>
          {step > 0 ? (
            <button className="button ghost" data-signup-back onClick={goBack} type="button">
              Back
            </button>
          ) : null}
          <button
            className="button primary lg"
            data-signup-next
            onClick={step < total - 1 ? goNext : undefined}
            type={step < total - 1 ? "button" : "submit"}
          >
            {step < total - 1 ? continueLabel(role) : "Create account"}
            <Icon name="arrow-right" size={14} />
          </button>
        </div>

        <p className="signup-foot muted small">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

function SignupIdentityPreview({ name }: { name: string }) {
  const identityPreview = publicNamePreview(name);
  return (
    <div aria-label="Public identity preview" className="card sage compact">
      <div className="card-row">
        <GeneratedAvatar
          alt="Your initials avatar preview"
          name={identityPreview}
          seed={identityPreview ?? "signup"}
          size="sm"
        />
        <div className="section-stack" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <strong>{identityPreview ?? "Your public identity"}</strong>
          <span className="muted small">Code assigned at signup</span>
        </div>
      </div>
    </div>
  );
}

function continueLabel(role: Role) {
  if (role === "seller") return "Continue as seller";
  if (role === "both") return "Continue with both";
  return "Continue as buyer";
}

function roleLabel(role: Role) {
  if (role === "seller") return "a seller";
  if (role === "both") return "buyer and seller";
  return "a buyer";
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
