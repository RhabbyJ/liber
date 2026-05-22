import { BadgePill } from "../../../components/badge-pill";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { submitBuyerVerificationDocument } from "../../../server/form-actions";

export default async function BuyerBadgesPage() {
  const { data: buyer } = await getCurrentBuyerProfile();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Buyer" title="Badges">
        Trust badges are visible only after admin review and expire when their status requires it.
      </PageTitle>
      <section className="card stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Verification evidence</p>
            <h2>Submit a document for admin review</h2>
          </div>
        </div>
        <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
          <div className="field">
            <label htmlFor="documentType">Document type</label>
            <select id="documentType" name="documentType">
              <option value="PRE_APPROVAL">Pre-approval</option>
              <option value="VERIFIED_FUNDS">Verified funds</option>
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
