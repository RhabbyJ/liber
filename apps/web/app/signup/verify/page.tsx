import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "../../../components/icon";
import { safeInternalPath } from "../../../lib/redirect";
import { resendSignupConfirmation } from "../../../server/auth-actions";
import { defaultPathForSessionUser, getSessionUser } from "../../../server/session";

export default async function VerifySignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; resent?: string }>;
}) {
  const { email = "", next = "", resent = "" } = await searchParams;
  const safeNext = safeInternalPath(next, "");
  const user = await getSessionUser();
  if (user) redirect(defaultPathForSessionUser(user));

  const mailLink = emailProviderLink(email);

  return (
    <div className="page narrow verify-page">
      <section className="card stack verify-card">
        <div className="verify-icon" aria-hidden="true">
          <Icon name="mail" size={26} />
        </div>
        <div className="stack tight">
          <p className="eyebrow">Account verification</p>
          <h1>Confirm your email</h1>
          <p className="muted">
            {email
              ? `We sent a verification link to ${email}. Click it to activate your account and continue.`
              : "We sent a verification link to your email. Click it to activate your account and continue."}
          </p>
        </div>

        {resent === "1" ? (
          <div className="auth-alert success">
            <strong>Verification email resent</strong>
            <span>Use the newest email if more than one message arrives.</span>
          </div>
        ) : null}

        <div className="actions">
          {mailLink ? (
            <a className="button primary" href={mailLink.href} rel="noreferrer" target="_blank">
              <Icon name="arrow-right" size={15} />
              Open {mailLink.label}
            </a>
          ) : null}
          <Link className="button secondary" href="/login">Back to login</Link>
        </div>

        <form action={resendSignupConfirmation} className="verify-resend">
          <input name="email" type="hidden" value={email} />
          <input name="next" type="hidden" value={safeNext} />
          <button className="link-button" disabled={!email} type="submit">
            <Icon name="mail" size={14} />
            Resend verification email
          </button>
        </form>

        <p className="muted small">
          If the email is not in your inbox, check spam or promotions. The confirmation link must be opened in the same Liber
          environment you signed up from.
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
