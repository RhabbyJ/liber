import { BadgePill } from "../../../components/badge-pill";
import { PageTitle } from "../../../components/page-title";
import { listAdminBuyerProfiles } from "../../../server/contracts";
import { submitBadgeGrant, submitBadgeRevoke } from "../../../server/form-actions";

const badgeOptions = [
  ["PRE_APPROVED", "Admin-verified pre-approval"],
  ["VERIFIED_FUNDS", "Verified funds"],
  ["VERIFIED_IDENTITY", "Verified identity"],
];

export default async function AdminBadgesPage() {
  const { data: buyers } = await listAdminBuyerProfiles();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Badges">
        Badges are manually controlled and expired badges do not affect search.
      </PageTitle>
      <section className="grid three">
        {buyers.map((buyer) => (
          <article className="card stack" key={buyer.id}>
            <p className="eyebrow">{buyer.name}</p>
            <form action={submitBadgeGrant} className="stack">
              <input name="buyerProfileId" type="hidden" value={buyer.id} />
              <div className="field">
                <label htmlFor={`badgeType-${buyer.id}`}>Badge type</label>
                <select id={`badgeType-${buyer.id}`} name="badgeType">
                  {badgeOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`evidence-${buyer.id}`}>Approved evidence</label>
                <select id={`evidence-${buyer.id}`} name="evidenceDocumentId" defaultValue="">
                  <option value="">No evidence selected</option>
                  {buyer.approvedDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.documentType} {document.fileSha256 ? document.fileSha256.slice(0, 8) : document.id}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button" type="submit">Grant Badge</button>
            </form>
            <div className="pill-row">
              {buyer.badges.map((badge) => (
                <BadgePill badge={badge} key={badge.id} />
              ))}
            </div>
            <div className="actions">
              {buyer.badges.map((badge) => (
                <form action={submitBadgeRevoke} key={badge.id}>
                  <input name="badgeId" type="hidden" value={badge.id} />
                  <button className="button secondary" type="submit">Revoke {badge.label}</button>
                </form>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
