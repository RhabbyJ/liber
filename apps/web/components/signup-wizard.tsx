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
  next: string;
  notice: Notice | null;
};

const STEP_LABELS = ["You", "Name", "Email", "Password"] as const;

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

export function SignupWizard({ initialRole, initialEmail, next, notice }: Props) {
  const [step, setStep] = useState(initialRole ? 1 : 0);
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
    }
  }

  return (
    <div className="signup-flow">
      <div className="signup-progress" aria-hidden="true">
        <div className="signup-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <ol className="signup-steps" aria-label="Signup steps">
        {STEP_LABELS.map((label, idx) => {
          const isActive = step === idx;
          const isDone = step > idx;
          return (
            <li
              key={label}
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

      <form action={signupWithPassword} className="signup-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <input name="next" type="hidden" value={next} />
        <input name="role" type="hidden" value={role} />

        {notice && step === 0 ? (
          <div className={`auth-alert ${notice.tone}`}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ) : null}

        <section className="signup-pane" hidden={step !== 0} aria-hidden={step !== 0} key={`pane-${step}`}>
          <p className="signup-eyebrow">Step 1 of {total}</p>
          <h1 className="signup-question">What brings you to Liber?</h1>
          <p className="signup-helper">Pick the path that fits today. You can add the other later.</p>
          <div className="signup-role-cards">
            {ROLE_CARDS.map((card) => {
              const selected = role === card.value;
              return (
                <button
                  className={`signup-role-card ${selected ? "selected" : ""}`}
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

        <section className="signup-pane" hidden={step !== 1} aria-hidden={step !== 1}>
          <p className="signup-eyebrow">Step 2 of {total}</p>
          <h1 className="signup-question">What should we call you?</h1>
          <p className="signup-helper">Sellers see this on invites and your profile.</p>
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

        <section className="signup-pane" hidden={step !== 2} aria-hidden={step !== 2}>
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

        <section className="signup-pane" hidden={step !== 3} aria-hidden={step !== 3}>
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

        {error ? <p className="signup-error">{error}</p> : null}

        <div className="signup-actions">
          <button className="button ghost" disabled={step === 0} onClick={goBack} type="button">
            Back
          </button>
          {step < total - 1 ? (
            <button className="button primary lg" onClick={goNext} type="button">
              Continue
              <Icon name="arrow-right" size={14} />
            </button>
          ) : (
            <button className="button primary lg" type="submit">
              <Icon name="sparkle" size={14} />
              Create account
            </button>
          )}
        </div>

        <p className="signup-foot muted small">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

function summarizeRole(role: Role) {
  if (role === "seller") return "Selling a home";
  if (role === "both") return "Buyer and seller";
  return "Buying a home";
}
