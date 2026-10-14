import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { listPendingDocuments } from "../../../server/contracts";
import { submitDocumentReview } from "../../../server/form-actions";
import { AdminSyntheticPropertyReview } from "../../../components/admin-synthetic-property-review";
import { listSyntheticPropertyReviewCandidates } from "../../../server/synthetic-property-review";

type ReviewedParams = { cursor?: string; reviewed?: string; subject?: string };

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<ReviewedParams> }) {
  const { cursor, reviewed, subject } = await searchParams;
  const { data: adminDocuments, available, nextCursor } = await listPendingDocuments(cursor);
  const testProperties = await listSyntheticPropertyReviewCandidates();

  return (
    <div className="page stack">
      <PageTitle title="Documents">
        {adminDocuments.length === 1 ? "1 document waiting for review" : `${adminDocuments.length} documents waiting for review`}
      </PageTitle>
      <ReviewOutcome reviewed={reviewed} subject={subject} />
      {!available ? (
        <div className="inline-alert warning" role="status">
          <Icon name="info" size={20} />
          <p>Document verification is temporarily unavailable.</p>
        </div>
      ) : null}
      {reviewed === "approved" && subject === "buyer" ? null : (
        <div className="inline-alert" role="note">
          <Icon name="info" size={20} />
          <p>Approving a buyer document doesn’t grant a badge. Approve it here, then <Link className="text-link" href="/admin/badges">grant the matching badge</Link>.</p>
        </div>
      )}
      {testProperties.length ? (
        <section className="card flat stack">
          <h2>Synthetic journey test controls</h2>
          <p className="muted">Only the designated demo seller’s properties appear here. Test approvals let that seller invite the designated demo buyer. They do not verify ownership or approve any document.</p>
          {testProperties.map((property) => <AdminSyntheticPropertyReview key={property.id} property={property} />)}
        </section>
      ) : null}
      {adminDocuments.length === 0 ? (
        <EmptyState description="New uploads appear here for private review." icon="check" title="No documents waiting" />
      ) : (
      <section className="card flat">
        <table className="table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Subject</th>
              <th>Type</th>
              <th>Status</th>
              <th>Preview</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {adminDocuments.map((document) => (
              <tr key={document.id}>
                <td>{document.owner}</td>
                <td>{document.subject}</td>
                <td>{document.type}</td>
                <td>{document.status}</td>
                <td>
                  <a className="text-link" href={`/api/admin/documents/${encodeURIComponent(document.id)}`} rel="noreferrer" target="_blank">Open</a>
                </td>
                <td>
                  <div className="document-review">
                    <form action={submitDocumentReview}>
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="decision" type="hidden" value="APPROVED" />
                      {document.ownershipEvidenceKind === "GOVERNMENT_ID" ? (
                        <>
                          <label className="checkbox-row"><input name="identityMatchesOwner" required type="checkbox" value="true" />Identity matches title owner/entity decision-maker</label>
                          <label className="checkbox-row"><input name="authorityConfirmed" required type="checkbox" value="true" />Seller authority confirmed</label>
                        </>
                      ) : null}
                      {document.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF" ? (
                        <>
                          <label className="checkbox-row"><input name="addressMatchesProperty" required type="checkbox" value="true" />Evidence matches property address</label>
                          <label className="checkbox-row"><input name="ownerOrEntityMatches" required type="checkbox" value="true" />Owner/entity name matches</label>
                        </>
                      ) : null}
                      <button className="button primary sm" type="submit">Approve</button>
                    </form>
                    <form action={submitDocumentReview}>
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="decision" type="hidden" value="REJECTED" />
                      <button className="button secondary sm" type="submit">Reject</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}
      {nextCursor ? <a className="button secondary" href={`/admin/documents?cursor=${encodeURIComponent(nextCursor)}`}>Next documents</a> : null}
    </div>
  );
}

/** Confirms the last decision and points at the next step (buyer evidence still needs a badge grant). */
function ReviewOutcome({ reviewed, subject }: Omit<ReviewedParams, "cursor">) {
  if (reviewed === "rejected") {
    return (
      <div className="inline-alert" role="status">
        <Icon name="info" size={20} />
        <p><strong>Document rejected.</strong> The owner has been notified and can upload a new file.</p>
      </div>
    );
  }
  if (reviewed !== "approved") return null;
  if (subject === "buyer") {
    return (
      <div className="inline-alert success" role="status">
        <Icon name="check" size={20} />
        <p><strong>Document approved.</strong> Next, grant the matching badge so sellers can see it.</p>
        <Link className="button primary sm" href="/admin/badges">Grant badge</Link>
      </div>
    );
  }
  return (
    <div className="inline-alert success" role="status">
      <Icon name="check" size={20} />
      <p><strong>Ownership document approved.</strong> The seller has been notified.</p>
    </div>
  );
}
