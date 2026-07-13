import { redirect } from "next/navigation";
import { SignupWizard } from "../../components/signup-wizard";
import { safeInternalPath } from "../../lib/redirect";
import { getSessionUser, pathForSignedInAuthIntent } from "../../server/session";

type Notice = { tone: string; title: string; body: string };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; role?: string; status?: string; step?: string }>;
}) {
  const { email = "", next = "", role = "", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const initialRole = parseRole(role);
  const user = await getSessionUser();
  if (user) redirect(pathForSignedInAuthIntent(user, { next: safeNext }));

  const notice = signupNotice(status);
  const initialStep = notice && status !== "invalid-role" ? 1 : 0;

  return (
    <div className="signup-shell">
      <SignupWizard
        initialEmail={email}
        initialFocus={signupFocusTarget(status)}
        initialRole={initialRole}
        initialStep={initialStep}
        next={safeNext}
        notice={notice}
      />
    </div>
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
      tone: "info",
    };
  }

  if (status === "missing-fields") {
    return {
      body: "Enter your name, email, password, and starting role before creating the account.",
      title: "Complete the form",
      tone: "info",
    };
  }

  if (status === "weak-password") {
    return {
      body: "Use a password with at least 12 characters, then try creating the account again.",
      title: "Password is too short",
      tone: "info",
    };
  }

  if (status === "invalid-email") {
    return {
      body: "Check the email address and try again.",
      title: "Email could not be used",
      tone: "info",
    };
  }

  if (status === "rate-limited") {
    return {
      body: "Too many signup attempts were made recently. Wait a minute, then try again.",
      title: "Signup temporarily limited",
      tone: "info",
    };
  }

  if (status === "auth-error" || status === "signup-error") {
    return {
      body: "Signup could not be completed. Try again, or use a different email address.",
      title: "Account was not created",
      tone: "info",
    };
  }

  return null;
}
