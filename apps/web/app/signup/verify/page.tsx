import Link from "next/link";
import { redirect } from "next/navigation";
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
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="verify-title">
        <div className="auth-card-head">
          <span className="auth-card-icon" aria-hidden="true">
            <Icon name="mail" size={24} />
          </span>
          <h1 id="verify-title">Confirm your email</h1>
          <p>
            {email ? (
              <>We sent a verification link to <strong>{email}</strong>. Open it to activate your account.</>
            ) : (
              "We sent a verification link to your email. Open it to activate your account."
            )}
          </p>
        </div>

        {resent === "1" ? (
          <div className="auth-alert success" role="status">
            <strong>Verification email resent</strong>
            <span>Use the newest email if more than one message arrives.</span>
          </div>
        ) : null}

        {status === "rate-limited" ? (
          <div className="auth-alert info" role="status">
            <strong>Resend limit reached</strong>
            <span>Wait before requesting another verification email.</span>
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
      </section>
    </div>
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
