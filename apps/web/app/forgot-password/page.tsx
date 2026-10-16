import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../components/auth-shell";
import { ForgotPasswordForm } from "../../components/password-forms";

type ForgotPasswordSearchParams = { status?: string };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ForgotPasswordSearchParams>;
}): Promise<Metadata> {
  const { status } = await searchParams;
  return { title: status === "sent" ? "Check your email" : "Reset your password" };
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ForgotPasswordSearchParams>;
}) {
  const { status = "" } = await searchParams;

  // The same confirmation for every address, so the page never reveals which have accounts.
  if (status === "sent") {
    return (
      <AuthShell
        context="If a Liber account uses that email address, we sent it a link to reset your password."
        title="Check your email"
      >
        <div className="auth-form">
          <Link className="button primary block lg" href="/login">Back to log in</Link>
          <p className="auth-switch">
            No email? <Link href="/forgot-password">Send another link</Link>
          </p>
          <p className="auth-fineprint">
            Check spam or promotions too. Reset links expire and work once, so open the newest one in this browser.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      context="Enter the email address you use for Liber and we’ll email you a link to choose a new password."
      title="Reset your password"
    >
      <ForgotPasswordForm status={status} />
    </AuthShell>
  );
}
