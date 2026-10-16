"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import { changePassword, completePasswordReset, requestPasswordReset } from "../server/auth-actions";
import { Icon } from "./icon";

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };
type FieldError = { field: string; message: string };

const MIN_PASSWORD_LENGTH = 12;
const emailPattern = /^\S+@\S+\.\S+$/;
const tooShortMessage = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

// Server results arrive as a `status` query value and render as a notice; client checks
// render as field errors. Passwords are trimmed on the server, as at signup and login.

/** /forgot-password: one email field. The server answers every address the same way. */
export function ForgotPasswordForm({ status }: { status: string }) {
  const notice = forgotPasswordNotice(status);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useFocusOnce(emailRef, !notice);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (emailPattern.test(emailRef.current?.value.trim() ?? "")) {
      setError(null);
      return;
    }
    event.preventDefault();
    setError("Enter a valid email address.");
    emailRef.current?.focus();
  }

  return (
    <form action={requestPasswordReset} className="auth-form" noValidate onSubmit={handleSubmit}>
      <FormNotice notice={notice} />
      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          aria-describedby={error ? "email-error" : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="email"
          id="email"
          maxLength={254}
          name="email"
          placeholder="you@example.com"
          ref={emailRef}
          required
          type="email"
        />
        {error ? <p className="field-error" id="email-error">{error}</p> : null}
      </div>
      <SubmitButton idle="Send reset link" pending="Sending…" />
      <p className="auth-switch">
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

/** /reset-password: rendered only for a verified recovery link (the page checks session and marker). */
export function ResetPasswordForm({ email, status }: { email: string; status: string }) {
  const notice = passwordUpdateNotice(status);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  useFocusOnce(passwordRef, !notice);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if ((passwordRef.current?.value.trim().length ?? 0) >= MIN_PASSWORD_LENGTH) {
      setError(null);
      return;
    }
    event.preventDefault();
    setError(tooShortMessage);
    passwordRef.current?.focus();
  }

  return (
    <form action={completePasswordReset} className="auth-form" noValidate onSubmit={handleSubmit}>
      <AccountUsername email={email} />
      <FormNotice notice={notice} />
      <PasswordField
        autoComplete="new-password"
        error={error}
        hint={`${MIN_PASSWORD_LENGTH}+ characters`}
        id="password"
        inputRef={passwordRef}
        label="New password"
        name="password"
      />
      <SubmitButton idle="Save password" pending="Saving…" />
      <p className="auth-fineprint">Saving signs you out of Liber on your other devices.</p>
    </form>
  );
}

/** Profile password change: the current password, then the new one. */
export function ChangePasswordForm({ email, status }: { email: string; status: string }) {
  const notice = passwordUpdateNotice(status);
  const [error, setError] = useState<FieldError | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const problem = !currentRef.current?.value.trim()
      ? { field: "currentPassword", message: "Enter your current password." }
      : (nextRef.current?.value.trim().length ?? 0) < MIN_PASSWORD_LENGTH
        ? { field: "newPassword", message: tooShortMessage }
        : null;
    setError(problem);
    if (!problem) return;
    event.preventDefault();
    (problem.field === "currentPassword" ? currentRef : nextRef).current?.focus();
  }

  return (
    <form action={changePassword} className="password-change-form" noValidate onSubmit={handleSubmit}>
      <AccountUsername email={email} />
      <FormNotice notice={notice} />
      <PasswordField
        autoComplete="current-password"
        error={error?.field === "currentPassword" ? error.message : null}
        id="current-password"
        inputRef={currentRef}
        label="Current password"
        name="currentPassword"
      />
      <PasswordField
        autoComplete="new-password"
        error={error?.field === "newPassword" ? error.message : null}
        hint={`${MIN_PASSWORD_LENGTH}+ characters`}
        id="new-password"
        inputRef={nextRef}
        label="New password"
        name="newPassword"
      />
      <div className="form-actions">
        <SubmitButton block={false} idle="Update password" pending="Updating…" />
        <Link className="text-link" href="/forgot-password">Forgot your current password?</Link>
      </div>
      <p className="fine-print">Updating your password signs you out of Liber on your other devices.</p>
    </form>
  );
}

function PasswordField({
  autoComplete,
  error,
  hint,
  id,
  inputRef,
  label,
  name,
}: {
  autoComplete: "current-password" | "new-password";
  error: string | null;
  hint?: string;
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  name: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint ? <> <span className="field-label-hint">{hint}</span></> : null}
      </label>
      <div className="password-field">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete={autoComplete}
          id={id}
          maxLength={1024}
          name={name}
          ref={inputRef}
          required
          type={visible ? "text" : "password"}
        />
        <button
          aria-controls={id}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className="password-toggle"
          onClick={() => setVisible((value) => !value)}
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <p className="field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}

// Lets password managers file the new password under the right account; it is never submitted.
function AccountUsername({ email }: { email: string }) {
  return <input autoComplete="username" hidden readOnly type="email" value={email} />;
}

/**
 * Hidden while the form submits, so the server's answer (even an identical one) is inserted
 * again afterwards: screen readers announce it and focus moves to it.
 */
function FormNotice({ notice }: { notice: Notice | null }) {
  const { pending } = useFormStatus();
  if (!notice || pending) return null;
  return <NoticeAlert notice={notice} />;
}

function NoticeAlert({ notice }: { notice: Notice }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className={`inline-alert ${notice.tone}`} ref={ref} role={notice.tone === "success" ? "status" : "alert"} tabIndex={-1}>
      <Icon name={notice.tone === "success" ? "check" : "info"} size={20} />
      <p><strong>{notice.title}.</strong> {notice.body}</p>
    </div>
  );
}

function SubmitButton({ block = true, idle, pending }: { block?: boolean; idle: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={`button primary${block ? " block lg" : ""}`} disabled={isPending} type="submit">
      {isPending ? pending : idle}
    </button>
  );
}

function useFocusOnce(ref: RefObject<HTMLInputElement | null>, enabled: boolean) {
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current || !enabled) return;
    appliedRef.current = true;
    ref.current?.focus();
  }, [enabled, ref]);
}

function forgotPasswordNotice(status: string): Notice | null {
  if (status === "link-expired") {
    return {
      body: "It may have expired or already been used. Enter your email and we’ll send a new one.",
      title: "That reset link didn’t work",
      tone: "danger",
    };
  }
  if (status === "invalid-email") {
    return { body: "Enter the email address you use to log in.", title: "Check your email address", tone: "danger" };
  }
  if (status === "rate-limited") {
    return { body: "Too many reset emails were requested. Wait an hour, then try again.", title: "Try again later", tone: "warning" };
  }
  if (status === "unavailable") {
    return { body: "Password reset isn’t available right now. Try again later.", title: "Something went wrong", tone: "danger" };
  }
  return null;
}

function passwordUpdateNotice(status: string): Notice | null {
  switch (status) {
    case "password-updated":
      return { body: "Use your new password the next time you log in.", title: "Password updated", tone: "success" };
    case "wrong-password":
      return { body: "Check it and try again, or reset it by email.", title: "Current password is incorrect", tone: "danger" };
    case "missing-current":
      return { body: "Enter your current password to confirm it’s you.", title: "Current password required", tone: "danger" };
    case "too-short":
      return { body: tooShortMessage, title: "New password is too short", tone: "danger" };
    case "too-long":
      return { body: "Use at most 1,024 characters.", title: "New password is too long", tone: "danger" };
    case "same-password":
      return { body: "Choose a password you aren’t already using.", title: "That’s your current password", tone: "danger" };
    case "weak-password":
      return { body: "Try a longer password, or add numbers or symbols.", title: "Choose a stronger password", tone: "danger" };
    case "rate-limited":
      return { body: "Too many attempts were made. Wait a few minutes, then try again.", title: "Try again later", tone: "warning" };
    case "error":
      return { body: "Your password wasn’t changed. Try again.", title: "Something went wrong", tone: "danger" };
    default:
      return null;
  }
}
