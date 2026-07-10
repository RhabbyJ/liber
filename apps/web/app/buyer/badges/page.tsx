import Link from "next/link";
import { BadgePill } from "../../../components/badge-pill";
import { Icon } from "../../../components/icon";
import { ModeChip } from "../../../components/mode-chip";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerVerificationDocument } from "../../../server/form-actions";

export default async function BuyerBadgesPage() {
  const { data: buyer } = await getCurrentBuyerProfile();
  const hasActiveBadges = buyer.badges.some((badge) => badge.status === "active");

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Verification"
        title="Get verified"
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
      >
        Upload a pre-approval or proof of funds. Liber reviews privately - sellers only see the badge.
      </PageTitle>

      <section className="stack tight verification-benefit">
        <h2>Why get verified?</h2>
        <p>
          Getting verified shows sellers you’re serious and approved to purchase. Serious sellers look for the
          verified badge on your profile and can filter by verified buyers, which can help increase the invites
          you receive from sellers.
        </p>
      </section>

      <section className="card stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Upload</p>
            <h2>Submit a document</h2>
          </div>
          <span className="status-dot info">
            <Icon name="lock" size={12} />
            Private
          </span>
        </div>
        <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
          <div className="field">
            <label htmlFor="documentType">Type</label>
            <select id="documentType" name="documentType">
              <option value="PRE_APPROVAL">Pre-approval letter</option>
              <option value="VERIFIED_FUNDS">Proof of funds</option>
              <option value="IDENTITY">Identity</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="document">File</label>
            <input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            <span className="field-hint">PDF, PNG, JPEG, WebP - 25 MB max</span>
          </div>
          <div className="field full">
            <button className="button primary" type="submit">
              <Icon name="upload" size={14} />
              Submit for review
            </button>
          </div>
        </form>
      </section>

      <section className="stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Your badges</p>
            <h2>Status</h2>
          </div>
          {!hasActiveBadges ? <span className="muted small">None yet.</span> : null}
        </div>
        <div className="grid three">
          {buyer.badges.map((badge) => (
            <article className={`card compact ${badge.status === "active" ? "" : "outline"}`} key={badge.label}>
              <BadgePill badge={badge} />
              <h3 style={{ fontSize: 16 }}>{badge.label}</h3>
              <p className="muted small">
                <strong style={{ textTransform: "capitalize" }}>{badge.status}</strong>
                {badge.expiresInDays !== undefined
                  ? badge.expiresInDays >= 0
                    ? ` - ${badge.expiresInDays} days left`
                    : " - Expired"
                  : ""}
              </p>
            </article>
          ))}
        </div>
        <p className="muted small">
          <Link href="/buyer/profile">Back to profile</Link>
        </p>
      </section>
    </div>
  );
}
