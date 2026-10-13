import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../../../components/auth-shell";
import { Icon } from "../../../components/icon";
import { safeInternalPath } from "../../../lib/redirect";
import { resendSignupConfirmation } from "../../../server/auth-actions";
import { defaultPathForSessionUser, getSessionUser } from "../../../server/session";

export default async function VerifySignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; resent?: string; status?: string }>;
}) {
  const { email = "", next = "", resent = "", status = "" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const user = await getSessionUser();
  if (user) redirect(defaultPathForSessionUser(user));

  const mailLink = emailProviderLink(email);

  return (
    <AuthShell
      context={email ? (
        <>We sent a verification link to <strong>{email}</strong>. Open it to activate your account.</>
      ) : (
        "We sent a verification link to your email. Open it to activate your account."
      )}
      title="Confirm your email"
    >
      <div className="auth-form">
        {resent === "1" ? (
          <div className="inline-alert success" role="status">
            <Icon name="check" size={20} />
            <p><strong>Verification email resent.</strong> Use the newest email if more than one message arrives.</p>
          </div>
        ) : null}

        {status === "rate-limited" ? (
          <div className="inline-alert warning" role="status">
            <Icon name="info" size={20} />
            <p><strong>Resend limit reached.</strong> Wait before requesting another verification email.</p>
          </div>
        ) : null}

        {mailLink ? (
          <a className="button primary block lg" href={mailLink.href} rel="noreferrer" target="_blank">
            Open {mailLink.label}
          </a>
        ) : null}
        <form action={resendSignupConfirmation} className="auth-resend">
          <input name="email" type="hidden" value={email} />
          <input name="next" type="hidden" value={safeNext} />
          <button className={`button ${mailLink ? "secondary" : "primary"} block`} disabled={!email} type="submit">
            Resend verification email
          </button>
        </form>

        <p className="auth-fineprint">
          Not in your inbox? Check spam or promotions. Open the link in the same Liber environment you signed up from.
        </p>
        <p className="auth-switch">
          Already confirmed? <Link href="/login">Log in</Link>
        </p>
      </div>
    </AuthShell>
  );
}

function emailProviderLink(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();

  if (!domain) return null;
  if (domain === "gmail.com" || domain === "googlemail.com") return { href: "https://mail.google.com", label: "Gmail" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { href: "https://outlook.live.com/mail/", label: "Outlook" };
  }
  if (domain === "yahoo.com") return { href: "https://mail.yahoo.com", label: "Yahoo Mail" };
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return { href: "https://www.icloud.com/mail", label: "iCloud Mail" };
  }

  return null;
}
