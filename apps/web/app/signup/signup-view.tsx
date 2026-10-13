import { redirect } from "next/navigation";
import { AuthCard, type AuthPresentation } from "../../components/auth-card";
import { SignupForm } from "../../components/signup-form";
import { safeInternalPath } from "../../lib/redirect";
import { getSessionUser, pathForSignedInAuthIntent } from "../../server/session";

type Notice = { tone: "info" | "success" | "warning" | "danger"; title: string; body: string };

export type SignupSearchParams = { email?: string; next?: string; role?: string; status?: string; step?: string };

export async function SignupView({
  presentation = "page",
  searchParams,
}: {
  presentation?: AuthPresentation;
  searchParams: Promise<SignupSearchParams>;
}) {
  const { email = "", next = "", role = "", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const initialRole = parseRole(role);
  const user = await getSessionUser();
  if (user) redirect(pathForSignedInAuthIntent(user, { next: safeNext }));

  const notice = signupNotice(status);

  return (
    <AuthCard
      active="signup"
      loginHref={safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login"}
      presentation={presentation}
    >
      <SignupForm
        initialEmail={email}
        initialFocus={signupFocusTarget(status)}
        initialRole={initialRole}
        next={safeNext}
        notice={notice}
      />
    </AuthCard>
  );
}

function parseRole(role: string): "buyer" | "seller" | "both" | null {
  const value = role.toLowerCase();
  if (value === "buyer" || value === "seller" || value === "both") return value;
  return null;
}

function signupFocusTarget(status: string): "name" | "email" | "password" | "notice" | null {
  if (status === "missing-fields") return "name";
  if (status === "invalid-email") return "email";
  if (status === "weak-password") return "password";
  if (signupNotice(status)) return "notice";
  return null;
}

function signupNotice(status: string): Notice | null {
  if (status === "invalid-role") {
    return {
      body: "Choose buyer, seller, or both before creating the account.",
      title: "Choose how you will use Liber",
      tone: "danger",
    };
  }

  if (status === "missing-fields") {
    return {
      body: "Enter your name, email, password, and starting role before creating the account.",
      title: "Complete the form",
      tone: "danger",
    };
  }

  if (status === "weak-password") {
    return {
      body: "Use a password with at least 12 characters, then try creating the account again.",
      title: "Password is too short",
      tone: "danger",
    };
  }

  if (status === "invalid-email") {
    return {
      body: "Check the email address and try again.",
      title: "Email could not be used",
      tone: "danger",
    };
  }

  if (status === "rate-limited") {
    return {
      body: "Too many signup attempts were made recently. Wait a minute, then try again.",
      title: "Signup temporarily limited",
      tone: "warning",
    };
  }

  if (status === "auth-error" || status === "signup-error") {
    return {
      body: "Signup could not be completed. Try again, or use a different email address.",
      title: "Account was not created",
      tone: "danger",
    };
  }

  return null;
}
