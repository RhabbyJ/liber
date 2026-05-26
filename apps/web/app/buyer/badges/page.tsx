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
        title="Strengthen your buyer profile"
        tone="buyer"
        badge={<ModeChip mode="buyer" />}
      >
        Verified buyers stand out to sellers. Liber reviews evidence privately — sellers never see your financial documents.
      </PageTitle>

      <section className="card sage">
        <div className="grid two" style={{ alignItems: "center" }}>
          <div className="stack tight">
            <p className="eyebrow">Why verify</p>
            <h2 style={{ fontSize: 24 }}>A pre-approval shows sellers you are a capable buyer.</h2>
            <p>
              Verified buyers generate more invites from serious sellers. Liber reviews documents privately and never exposes
              them to sellers — only the trust badge appears on your profile.
            </p>
          </div>
          <div className="grid two" style={{ gap: 12 }}>
            <span className="trust-badge active">
              <span className="trust-badge-icon"><Icon name="check-shield" size={11} /></span>
              Pre-approved
            </span>
            <span className="trust-badge active">
              <span className="trust-badge-icon"><Icon name="diamond" size={11} /></span>
              Cash buyer
            </span>
            <span className="trust-badge active">
              <span className="trust-badge-icon"><Icon name="shield" size={11} /></span>
              Verified identity
            </span>
            <span className="trust-badge active">
              <span className="trust-badge-icon"><Icon name="star" size={11} /></span>
              Completed transaction
            </span>
          </div>
        </div>
      </section>

      <section className="grid three">
        <article className="card stack">
          <span className="mode-card-icon">
            <Icon name="key" size={20} />
          </span>
          <div>
            <p className="eyebrow">Pre-approval</p>
            <h3>Get pre-approved</h3>
          </div>
          <p className="muted small">
            Connect with a Liber-reviewed lender to start a pre-approval. Pre-approval is not a loan approval — final loan
            approval is subject to lender underwriting, documentation, and property review.
          </p>
          <span className="status-dot warning">Coming with lender partner</span>
        </article>

        <article className="card stack">
          <span className="mode-card-icon">
            <Icon name="doc" size={20} />
          </span>
          <div>
            <p className="eyebrow">Existing letter</p>
            <h3>Upload your pre-approval</h3>
          </div>
          <p className="muted small">
            Already have a current pre-approval letter? Upload it for private admin review. Approved badges last 90 days
            and renew with a fresh letter.
          </p>
          <span className="status-dot active">Available now</span>
        </article>

        <article className="card stack">
          <span className="mode-card-icon">
            <Icon name="diamond" size={20} />
          </span>
          <div>
            <p className="eyebrow">Cash buyer</p>
            <h3>Verify funds</h3>
          </div>
          <p className="muted small">
            Upload a proof-of-funds document if you want Liber to review cash-buyer or verified-funds status. Documents are
            stored privately and never shared with sellers.
          </p>
          <span className="status-dot active">Available now</span>
        </article>
      </section>

      <section className="card stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Submit evidence</p>
            <h2>Upload a document for private review</h2>
          </div>
          <span className="status-dot info">
            <Icon name="lock" size={12} />
            Private
          </span>
        </div>
        <p className="muted small">
          Files go to Liber's private verification storage. Only Liber admins reviewing your case can see them. Owners cannot
          delete documents once uploaded.
        </p>
        <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
          <div className="field">
            <label htmlFor="documentType">Document type</label>
            <select id="documentType" name="documentType">
              <option value="PRE_APPROVAL">Existing pre-approval letter</option>
              <option value="VERIFIED_FUNDS">Cash buyer / proof of funds</option>
              <option value="IDENTITY">Identity</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="document">Document</label>
            <input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
            <span className="field-hint">PDF, PNG, JPEG, or WebP. 25 MB max.</span>
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
            <h2>Current status</h2>
          </div>
          {!hasActiveBadges ? <span className="muted small">No active badges yet.</span> : null}
        </div>
        <div className="grid three">
          {buyer.badges.map((badge) => (
            <article className={`card compact ${badge.status === "active" ? "" : "outline"}`} key={badge.label}>
              <BadgePill badge={badge} />
              <h3 style={{ fontSize: 16 }}>{badge.label}</h3>
              <p className="muted small">
                Status: <strong style={{ textTransform: "capitalize" }}>{badge.status}</strong>.{" "}
                {badge.expiresInDays !== undefined
                  ? badge.expiresInDays >= 0
                    ? `${badge.expiresInDays} days remaining.`
                    : "Expired."
                  : "No expiry set."}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
