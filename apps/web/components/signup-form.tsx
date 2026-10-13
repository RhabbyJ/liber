"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { normalizeSignupName, publicNamePreview } from "../lib/public-identity";
import { signupWithPassword } from "../server/auth-actions";
import { GeneratedAvatar } from "./generated-avatar";
import { Icon } from "./icon";

type Role = "buyer" | "seller" | "both";

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

type Props = {
  initialEmail: string;
  initialFocus: "name" | "email" | "password" | "notice" | null;
  initialRole: Role | null;
  loginHref: string;
  next: string;
  notice: Notice | null;
};

const SIGNUP_DRAFT_KEY = "liber.signup.draft";

const ROLE_OPTIONS: Array<{ value: Role; label: string; detail: string }> = [
  { value: "buyer", label: "Buy a home", detail: "Publish demand sellers can find and invite." },
  { value: "seller", label: "Sell a home", detail: "Search buyers and invite them privately." },
  { value: "both", label: "Buy and sell", detail: "Use buyer and seller tools in one account." },
];

type ValidationError = { field: "name" | "email" | "password"; message: string };

/** Single-step signup: role (asked once), private name, email, and password. */
export function SignupForm({ initialEmail, initialFocus, initialRole, loginHref, next, notice }: Props) {
  const [role, setRole] = useState<Role>(initialRole ?? "buyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ValidationError | null>(null);

  const noticeRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const initialFocusAppliedRef = useRef(false);

  useEffect(() => {
    if (initialFocusAppliedRef.current || !initialFocus) return;
    initialFocusAppliedRef.current = true;
    const target = initialFocus === "notice"
      ? noticeRef
      : initialFocus === "email"
        ? emailRef
        : initialFocus === "password"
          ? passwordRef
          : nameRef;
    target.current?.focus();
  }, [initialFocus]);

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

  function validate(): ValidationError | null {
    if (!normalizeSignupName(name)) return { field: "name", message: "Enter your first and last name using letters, apostrophes, or hyphens." };
    if (!email.trim()) return { field: "email", message: "Enter your email." };
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return { field: "email", message: "Use a valid email format." };
    if (!password) return { field: "password", message: "Create a password." };
    if (password.length < 12) return { field: "password", message: "Use at least 12 characters." };
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const validationError = validate();
    if (validationError) {
      event.preventDefault();
      setError(validationError);
      window.requestAnimationFrame(() => {
        if (validationError.field === "name") nameRef.current?.focus();
        if (validationError.field === "email") emailRef.current?.focus();
        if (validationError.field === "password") passwordRef.current?.focus();
      });
      return;
    }
    setError(null);
    saveSignupDraft({ email, name, role });
  }

  const selectedRole = ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[0];

  return (
    <form action={signupWithPassword} className="auth-form" data-signup-form noValidate onSubmit={handleSubmit}>
      <input name="next" type="hidden" value={next} />

      {notice ? (
        <div className={`inline-alert ${notice.tone}`} ref={noticeRef} role="alert" tabIndex={-1}>
          <Icon name="info" size={20} />
          <p><strong>{notice.title}.</strong> {notice.body}</p>
        </div>
      ) : null}

      <fieldset className="role-choice">
        <legend>How will you use Liber?</legend>
        <div className="role-choice-options">
          {ROLE_OPTIONS.map((option) => (
            <label className={`role-choice-option${role === option.value ? " selected" : ""}`} key={option.value}>
              <input
                checked={role === option.value}
                name="role"
                onChange={() => setRole(option.value)}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <p className="role-choice-hint">{selectedRole.detail}</p>
      </fieldset>

      <div className="field">
        <label htmlFor="name">
          Full name <span className="field-label-hint">Last name private</span>
        </label>
        <input
          aria-describedby={`signup-identity-description${error?.field === "name" ? " signup-error" : ""}`}
          aria-invalid={error?.field === "name" || undefined}
          autoComplete="name"
          id="name"
          maxLength={160}
          name="name"
          onChange={(event) => setName(event.target.value)}
          placeholder="First Last"
          ref={nameRef}
          required
          value={name}
        />
        <p className="field-hint" id="signup-identity-description">
          Others see your first name, last initial, and a unique code.
        </p>
        <SignupIdentityPreview name={name} />
      </div>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          aria-describedby={error?.field === "email" ? "signup-error" : undefined}
          aria-invalid={error?.field === "email" || undefined}
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          ref={emailRef}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="field">
        <label htmlFor="password">
          Password <span className="field-label-hint">12+ characters</span>
        </label>
        <div className="password-field">
          <input
            aria-describedby={error?.field === "password" ? "signup-error" : undefined}
            aria-invalid={error?.field === "password" || undefined}
            autoComplete="new-password"
            id="password"
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            ref={passwordRef}
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-controls="password"
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="password-toggle"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <p className="field-error" hidden={!error} id="signup-error" role="alert">
        {error?.message}
      </p>

      <SubmitButton />
      <p className="auth-switch">
        Already have an account? <Link href={loginHref}>Log in</Link>
      </p>
      <p className="auth-fineprint">We’ll email you a link to confirm your address.</p>
    </form>
  );
}

function SignupIdentityPreview({ name }: { name: string }) {
  const identityPreview = publicNamePreview(name);
  return (
    <div aria-label="Public identity preview" className="identity-preview">
      <GeneratedAvatar
        alt="Your initials avatar preview"
        name={identityPreview}
        seed={identityPreview ?? "signup"}
        size="sm"
      />
      <span className="identity-preview-text">
        <strong>{identityPreview ?? "Your public identity"}</strong>
        <span>Code assigned at signup</span>
      </span>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button primary block lg" disabled={pending} type="submit">
      {pending ? "Creating account…" : "Create your account"}
    </button>
  );
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
