import Link from "next/link";
import { PageTitle } from "../../components/page-title";
import { safeInternalPath } from "../../lib/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; status?: string }>;
}) {
  const { email = "", next = "/", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next);
  const context = authContextFromNext(safeNext);
  const notice = authNotice(status, email);

  return (
    <div className="page narrow">
      <PageTitle eyebrow="Account" title={context.loginTitle}>
        {context.description}
      </PageTitle>
      <section className="card stack">
        {notice ? (
          <div className={`auth-alert ${notice.tone}`}>
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ) : null}
        <form action="/api/auth/login" className="form-grid" method="post">
          <input name="next" type="hidden" value={safeNext} />
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="you@example.com" defaultValue={email} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required />
          </div>
          <button className="button" type="submit">Log in</button>
        </form>
        <p className="muted">
          New to Liber? <Link href={context.signupHref}>Create {context.signupLabel}</Link>.
        </p>
      </section>
    </div>
  );
}

function authNotice(status: string, email: string) {
  if (status === "signed-out") {
    return {
      body: "Your session was cleared on this device.",
      title: "You are logged out",
      tone: "success",
    };
  }

  if (status === "confirm-email") {
    return {
      body: email
        ? `We sent a confirmation link to ${email}. Confirm it before logging in.`
        : "Check your email for a confirmation link before logging in.",
      title: "Confirm your email",
      tone: "info",
    };
  }

  if (status === "auth-error") {
    return {
      body: "The confirmation link is invalid or expired. Request a new email and try again.",
      title: "Confirmation failed",
      tone: "info",
    };
  }

  if (status === "account-unavailable") {
    return {
      body: "Your Supabase login exists, but this Liber account is not active. Contact an admin or sign up again.",
      title: "Account unavailable",
      tone: "info",
    };
  }

  if (status === "invalid-login") {
    return {
      body: "Check your email and password. If you recently signed up, confirm your email before logging in.",
      title: "Login failed",
      tone: "info",
    };
  }

  if (status === "missing-credentials") {
    return {
      body: "Enter your email and password to log in.",
      title: "Email and password required",
      tone: "info",
    };
  }

  return null;
}

function authContextFromNext(next: string) {
  if (next.startsWith("/seller")) {
    return {
      description: "Continue to seller search, property management, and invite tools.",
      loginTitle: "Log in as a seller",
      signupHref: `/signup?role=seller&next=${encodeURIComponent(next)}`,
      signupLabel: "a seller account",
    };
  }

  if (next.startsWith("/buyer") || next.startsWith("/buyers")) {
    return {
      description: "Continue to buyer profile, criteria, verification, and invite tools.",
      loginTitle: "Log in as a buyer",
      signupHref: `/signup?role=buyer&next=${encodeURIComponent(next)}`,
      signupLabel: "a buyer account",
    };
  }

  if (next.startsWith("/admin")) {
    return {
      description: "Admin access requires an existing account with a server-assigned admin role.",
      loginTitle: "Log in for admin",
      signupHref: "/signup",
      signupLabel: "a buyer or seller account",
    };
  }

  return {
    description: "Use your Liber account to manage buyer and seller workflows.",
    loginTitle: "Log in",
    signupHref: "/signup",
    signupLabel: "an account",
  };
}
