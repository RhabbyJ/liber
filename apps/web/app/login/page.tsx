import Link from "next/link";
import { redirect } from "next/navigation";
import { safeInternalPath } from "../../lib/redirect";
import { getSessionUser, pathForSignedInAuthIntent } from "../../server/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; status?: string }>;
}) {
  const { email = "", next = "/", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next);
  const user = await getSessionUser();
  if (user) redirect(pathForSignedInAuthIntent(user, { next: safeNext }));

  const context = authContextFromNext(safeNext);
  const notice = authNotice(status, email);

  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-head">
          <span className="brand-mark" aria-hidden="true" />
          <h1 id="auth-title">{context.loginTitle}</h1>
          <p>{context.description}</p>
        </div>
        <nav className="auth-tabs" aria-label="Account access">
          <span aria-current="page" className="auth-tab active">Log in</span>
          <Link className="auth-tab" href={context.signupHref}>New account</Link>
        </nav>
        {notice ? (
          <div className={`auth-alert ${notice.tone}`} role="status">
            <strong>{notice.title}</strong>
            <span>{notice.body}</span>
          </div>
        ) : null}
        <form action="/api/auth/login" className="auth-form" method="post">
          <input name="next" type="hidden" value={safeNext} />
          <div className="field">
            <label htmlFor="email">Email</label>
            <input autoComplete="email" id="email" name="email" type="email" placeholder="you@example.com" defaultValue={email} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input autoComplete="current-password" id="password" name="password" type="password" required />
          </div>
          <button className="button primary block lg" type="submit">
            Continue
          </button>
        </form>
        <p className="auth-switch">
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
      body: "Your login exists, but this Liber account is not active. Contact Liber support before trying another signup.",
      title: "Account unavailable",
      tone: "info",
    };
  }

  if (status === "identity-recovery-required") {
    return {
      body: "This email is already tied to a different Liber identity. Contact Liber support to recover or explicitly purge that account; a new login cannot inherit it.",
      title: "Account recovery required",
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

  if (status === "rate-limited") {
    return {
      body: "Too many authentication attempts were received. Wait before trying again.",
      title: "Try again later",
      tone: "info",
    };
  }

  if (status === "account-exists") {
    return {
      body: "That email already has a Liber account. Log in here to continue to its workspace.",
      title: "Use your existing account",
      tone: "info",
    };
  }

  return null;
}

type LoginContext = {
  description: string;
  loginTitle: string;
  signupHref: string;
  signupLabel: string;
};

function authContextFromNext(next: string): LoginContext {
  if (next.startsWith("/buyers")) {
    return {
      description: "Continue to a buyer profile. Approved sellers can view buyer profiles, and buyers can preview their own profile.",
      loginTitle: "Log in to view buyer profile",
      signupHref: `/signup?role=seller&next=${encodeURIComponent(next)}`,
      signupLabel: "a seller account",
    };
  }

  if (next.startsWith("/seller")) {
    return {
      description: "Continue to seller search, property management, and invite tools.",
      loginTitle: "Log in as a seller",
      signupHref: `/signup?role=seller&next=${encodeURIComponent(next)}`,
      signupLabel: "a seller account",
    };
  }

  if (next.startsWith("/buyer")) {
    return {
      description: "Continue to your buyer profile, verification, and invites.",
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
