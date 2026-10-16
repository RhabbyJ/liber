import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../components/auth-shell";
import { ResetPasswordForm } from "../../components/password-forms";
import { hasPasswordRecoveryFor } from "../../server/password-recovery";
import { getSessionUser } from "../../server/session";

type ResetPasswordSearchParams = { status?: string };

// Only a session opened by a verified recovery link, carrying the callback's marker, may set a
// password here. A signed-in user changes it from /profile by confirming the current password.
async function resetAccess() {
  const user = await getSessionUser();
  return { canReset: user ? await hasPasswordRecoveryFor(user.id) : false, user };
}

export async function generateMetadata(): Promise<Metadata> {
  const { canReset } = await resetAccess();
  return { title: canReset ? "Choose a new password" : "Reset link expired" };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordSearchParams>;
}) {
  const { status = "" } = await searchParams;
  const { canReset, user } = await resetAccess();

  if (!user || !canReset) {
    return (
      <AuthShell
        context="Reset links expire and work once. Request a new link to choose a password."
        title="Your reset link has expired"
      >
        <div className="auth-form">
          <Link className="button primary block lg" href="/forgot-password">Request a new link</Link>
          {user ? (
            <p className="auth-switch">
              Signed in? <Link href="/profile#password">Change your password</Link>
            </p>
          ) : (
            <p className="auth-switch">
              Remembered it? <Link href="/login">Log in</Link>
            </p>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      context={<>Choose a new password for <strong>{user.email}</strong>.</>}
      title="Choose a new password"
    >
      <ResetPasswordForm email={user.email ?? ""} status={status} />
    </AuthShell>
  );
}
