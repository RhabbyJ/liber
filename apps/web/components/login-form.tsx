"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Icon } from "./icon";

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

const emailPattern = /^\S+@\S+\.\S+$/;
const subscribeToNothing = () => () => {};

/**
 * Email first, then password, as on Zillow. Revealing the password field is client-only and never
 * asks whether an account exists; both steps post the same native form to /api/auth/login, so the
 * page still works before hydration (an email-only post comes back with the password step open).
 */
export function LoginForm({
  email: initialEmail,
  next,
  notice,
  signupHref,
}: {
  email: string;
  next: string;
  notice: Notice | null;
  signupHref: string;
}) {
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState<"email" | "password">(initialEmail ? "password" : "email");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (step === "password" ? passwordRef : emailRef).current?.focus();
  }, [step]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!emailPattern.test(email.trim())) {
      event.preventDefault();
      setEmailError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    if (step === "email") {
      event.preventDefault();
      setStep("password");
      return;
    }
    if (!passwordRef.current?.value) {
      event.preventDefault();
      passwordRef.current?.focus();
    }
  }

  return (
    <form action="/api/auth/login" className="auth-form" method="post" noValidate={hydrated} onSubmit={handleSubmit}>
      <input name="next" type="hidden" value={next} />
      {notice ? (
        <div className={`inline-alert ${notice.tone}`} role={notice.tone === "success" ? "status" : "alert"}>
          <Icon name={notice.tone === "success" ? "check" : "info"} size={20} />
          <p><strong>{notice.title}.</strong> {notice.body}</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          aria-describedby={emailError ? "email-error" : undefined}
          aria-invalid={emailError ? true : undefined}
          autoComplete="username"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          ref={emailRef}
          required
          type="email"
          value={email}
        />
        {emailError ? <p className="field-error" id="email-error">{emailError}</p> : null}
      </div>
      {step === "password" ? (
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              ref={passwordRef}
              required
              type={showPassword ? "text" : "password"}
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
          <Link className="auth-inline-link" href="/forgot-password">Forgot password?</Link>
        </div>
      ) : null}
      <button className="button primary block lg" disabled={hydrated && !email.trim()} type="submit">
        {step === "password" ? "Log in" : "Continue"}
      </button>
      <p className="auth-switch">
        New to Liber? <Link href={signupHref}>Create account</Link>
      </p>
    </form>
  );
}
