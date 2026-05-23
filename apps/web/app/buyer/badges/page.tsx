import { BadgePill } from "../../../components/badge-pill";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerVerificationDocument } from "../../../server/form-actions";

export default async function BuyerBadgesPage() {
  const { data: buyer } = await getCurrentBuyerProfile();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Buyer verification">
        Strengthen your profile with admin-reviewed trust signals. Sellers never see your financial documents.
      </PageTitle>
      <section className="grid three">
        <article className="card stack">
          <p className="eyebrow">Pre-approval</p>
          <h2>Get pre-approved</h2>
          <p className="muted">
            Liber can display a pre-approved badge after admin validation. Pre-approval is not a loan approval, and final loan approval is subject to lender underwriting, documentation, and property review.
          </p>
        </article>
        <article className="card stack">
          <p className="eyebrow">Existing letter</p>
          <h2>Upload pre-approval</h2>
          <p className="muted">
            Upload a current pre-approval letter for private admin review. Approved pre-approval badges expire after 90 days.
          </p>
        </article>
        <article className="card stack">
          <p className="eyebrow">Cash buyer</p>
          <h2>Verify funds</h2>
          <p className="muted">
            Upload proof-of-funds evidence if you want Liber to review cash-buyer or verified-funds status.
          </p>
        </article>
      </section>
      <section className="card stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Verification evidence</p>
            <h2>Upload private evidence</h2>
          </div>
        </div>
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
          </div>
          <button className="button" type="submit">Submit for Review</button>
        </form>
      </section>
      <section className="grid three">
        {buyer.badges.map((badge) => (
          <article className="card stack" key={badge.label}>
            <BadgePill badge={badge} />
            <h2>{badge.label}</h2>
            <p className="muted">
              Status: {badge.status}. {badge.expiresInDays ? `${badge.expiresInDays} days remaining.` : "No expiry set."}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
