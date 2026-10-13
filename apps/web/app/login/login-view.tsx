import { redirect } from "next/navigation";
import { AuthCard, type AuthPresentation } from "../../components/auth-card";
import { LoginForm } from "../../components/login-form";
import { safeInternalPath } from "../../lib/redirect";
import { getSessionUser, pathForSignedInAuthIntent } from "../../server/session";

export type LoginSearchParams = { email?: string; next?: string; status?: string };

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

export async function LoginView({
  presentation = "page",
  searchParams,
}: {
  presentation?: AuthPresentation;
  searchParams: Promise<LoginSearchParams>;
}) {
  const { email = "", next = "/", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next);
  const user = await getSessionUser();
  if (user) redirect(pathForSignedInAuthIntent(user, { next: safeNext }));

  const { context, signupHref } = authContextFromNext(safeNext);
  const notice = authNotice(status, email);

  return (
    <AuthCard active="login" context={context} presentation={presentation} signupHref={signupHref}>
      <LoginForm email={email} next={safeNext} notice={notice} presentation={presentation} />
    </AuthCard>
  );
}

function authNotice(status: string, email: string): Notice | null {
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
      tone: "danger",
    };
  }

  if (status === "account-unavailable") {
    return {
      body: "Your login exists, but this Liber account is not active. Contact Liber support before trying another signup.",
      title: "Account unavailable",
      tone: "danger",
    };
  }

  if (status === "identity-recovery-required") {
    return {
      body: "This email is already tied to a different Liber identity. Contact Liber support to recover or explicitly purge that account; a new login cannot inherit it.",
      title: "Account recovery required",
      tone: "warning",
    };
  }

  if (status === "invalid-login") {
    return {
      body: "Check your email and password. If you recently signed up, confirm your email before logging in.",
      title: "Login failed",
      tone: "danger",
    };
  }

  if (status === "missing-credentials") {
    return {
      body: "Enter your email and password to log in.",
      title: "Email and password required",
      tone: "danger",
    };
  }

  if (status === "rate-limited") {
    return {
      body: "Too many authentication attempts were received. Wait before trying again.",
      title: "Try again later",
      tone: "warning",
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
  context?: string;
  signupHref: string;
};

function authContextFromNext(next: string): LoginContext {
  if (next.startsWith("/buyers")) {
    return {
      context: "Log in to view this buyer profile. Approved sellers and the profile owner can see it.",
      signupHref: `/signup?role=seller&next=${encodeURIComponent(next)}`,
    };
  }

  if (next.startsWith("/seller")) {
    return {
      context: "Log in to your seller account.",
      signupHref: `/signup?role=seller&next=${encodeURIComponent(next)}`,
    };
  }

  if (next.startsWith("/buyer")) {
    return {
      context: "Log in to your buyer account.",
      signupHref: `/signup?role=buyer&next=${encodeURIComponent(next)}`,
    };
  }

  if (next.startsWith("/admin")) {
    return {
      context: "Admin access requires an account with a server-assigned admin role.",
      signupHref: "/signup",
    };
  }

  return { signupHref: next && next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup" };
}
