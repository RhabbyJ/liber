import { BadgePill } from "../../../components/badge-pill";
import Link from "next/link";
import { AdminBadgeGrantForm, AdminBadgeRevokeForm } from "../../../components/admin-badge-review-form";
import { PageTitle } from "../../../components/page-title";
import { AdminTestPreapproval } from "../../../components/admin-test-preapproval";
import { getSelfTestPreapprovalState } from "../../../server/test-preapproval";
import { listAdminBuyerProfiles } from "../../../server/contracts";
import { submitBadgeGrant, submitBadgeRevoke } from "../../../server/form-actions";

export default async function AdminBadgesPage() {
  const { data: buyers } = await listAdminBuyerProfiles();
  const testBadge = await getSelfTestPreapprovalState();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Badges">
        First approve the buyer’s document in <Link href="/admin/documents">Documents</Link>, then grant the matching badge here. Admins can review their own accounts using the same evidence requirements.
      </PageTitle>
      {testBadge.enabled && testBadge.buyerProfileId ? (
        <AdminTestPreapproval active={testBadge.active} buyerProfileId={testBadge.buyerProfileId} />
      ) : testBadge.enabled ? (
        <section className="card stack" aria-label="My test pre-approval">
          <h2>My test pre-approval</h2>
          <p className="muted">Add a test badge to your own buyer profile for 24 hours to check how it appears. Financing has not been verified.</p>
          <p>{testBadge.hasBuyerRole ? <Link href="/buyer/profile">Create your buyer profile first</Link> : "Sign in with your buyer test account to add a badge to yourself."}</p>
        </section>
      ) : null}
      <section className="grid three">
        {buyers.map((buyer) => (
          <article className="card stack" key={buyer.id}>
            <div className="stack tight">
              <h2 style={{ fontSize: 18 }}>{buyer.accountName || buyer.name}</h2>
              <p className="small" style={{ overflowWrap: "anywhere" }}>{buyer.accountEmail}</p>
              <p className="muted small">Buyer profile: {buyer.name}</p>
            </div>
            <AdminBadgeGrantForm action={submitBadgeGrant} buyerProfileId={buyer.id} documents={buyer.approvedDocuments.map(({ id, documentType, originalFilename }) => ({ id, documentType, originalFilename }))} />
            <div className="pill-row">
              {buyer.badges.map((badge) => (
                <BadgePill badge={badge} key={badge.id} />
              ))}
            </div>
            <div className="actions">
              {buyer.badges.filter((badge) => badge.type !== "CASH_BUYER" && badge.type !== "TEST_PRE_APPROVED" && badge.status === "active").map((badge) => (
                <AdminBadgeRevokeForm action={submitBadgeRevoke} badgeId={badge.id} key={badge.id} label={badge.label} />
              ))}
            </div>
          </article>
        ))}
      </section>
      {!buyers.length ? <p className="muted">No buyer profiles yet. Create a buyer profile before requesting verification.</p> : null}
    </div>
  );
}
