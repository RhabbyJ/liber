import Link from "next/link";
import type { ReactNode } from "react";

export type AuthPresentation = "page" | "modal";

/**
 * The one sign-in surface: page and modal routes render the same card, with
 * Log in / New account tabs that swap in place (replace, so Back closes a modal).
 */
export function AuthCard({
  active,
  children,
  context,
  loginHref = "/login",
  presentation = "page",
  signupHref = "/signup",
  title = "Welcome to Liber",
}: {
  active?: "login" | "signup";
  children: ReactNode;
  context?: ReactNode;
  loginHref?: string;
  presentation?: AuthPresentation;
  signupHref?: string;
  title?: string;
}) {
  return (
    <section aria-labelledby="auth-title" className="auth-card">
      <header className="auth-card-head">
        <span aria-hidden="true" className="brand-mark" />
        <h1 id="auth-title">{title}</h1>
        {context ? <p>{context}</p> : null}
      </header>
      {active ? (
        <nav aria-label="Account access" className="auth-tabs">
          <AuthTab active={active === "login"} href={loginHref} presentation={presentation}>Log in</AuthTab>
          <AuthTab active={active === "signup"} href={signupHref} presentation={presentation}>New account</AuthTab>
        </nav>
      ) : null}
      {children}
    </section>
  );
}

function AuthTab({
  active,
  children,
  href,
  presentation,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
  presentation: AuthPresentation;
}) {
  if (active) return <span aria-current="page" className="auth-tab active">{children}</span>;
  // Full pages load the other tab as a page; a soft navigation would be intercepted into the modal.
  if (presentation === "page") return <a className="auth-tab" href={href}>{children}</a>;
  return <Link className="auth-tab" href={href} replace scroll={false}>{children}</Link>;
}
