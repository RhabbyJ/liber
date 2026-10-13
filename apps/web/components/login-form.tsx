"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AuthPresentation } from "./auth-card";
import { Icon } from "./icon";

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

/**
 * Password login always posts to /api/auth/login. In the modal the post runs in the
 * background so a failed attempt keeps its notice in the dialog instead of leaving the page.
 */
export function LoginForm({
  email,
  next,
  notice,
  presentation,
}: {
  email: string;
  next: string;
  notice: Notice | null;
  presentation: AuthPresentation;
}) {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!notice) return;
    (emailRef.current?.value ? passwordRef : emailRef).current?.focus();
  }, [notice]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (presentation !== "modal") return;
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    try {
      const response = await fetch(form.action, { body: new FormData(form), method: "POST" });
      const destination = response.redirected ? new URL(response.url) : null;
      if (destination && destination.origin === window.location.origin) {
        if (destination.pathname === "/login") {
          setPending(false);
          router.replace(`${destination.pathname}${destination.search}`, { scroll: false });
        } else {
          window.location.assign(destination.href);
        }
        return;
      }
    } catch {
      // Fall back to the native post below.
    }
    form.submit();
  }

  return (
    <form action="/api/auth/login" className="auth-form" method="post" onSubmit={handleSubmit}>
      <input name="next" type="hidden" value={next} />
      {notice ? (
        <div className={`inline-alert ${notice.tone}`} role={notice.tone === "success" ? "status" : "alert"}>
          <Icon name={notice.tone === "success" ? "check" : "info"} size={20} />
          <p><strong>{notice.title}.</strong> {notice.body}</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input autoComplete="email" defaultValue={email} id="email" name="email" placeholder="you@example.com" ref={emailRef} required type="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input autoComplete="current-password" id="password" name="password" ref={passwordRef} required type="password" />
      </div>
      <button className="button primary block lg" disabled={pending} type="submit">
        {pending ? "Logging in…" : "Continue"}
      </button>
    </form>
  );
}
