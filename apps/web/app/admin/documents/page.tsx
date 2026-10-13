import { PageTitle } from "../../../components/page-title";
import Link from "next/link";
import { listPendingDocuments } from "../../../server/contracts";
import { submitDocumentReview } from "../../../server/form-actions";
import { AdminSyntheticPropertyReview } from "../../../components/admin-synthetic-property-review";
import { listSyntheticPropertyReviewCandidates } from "../../../server/synthetic-property-review";

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  const { data: adminDocuments, available, nextCursor } = await listPendingDocuments(cursor);
  const testProperties = await listSyntheticPropertyReviewCandidates();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Documents">
        Document storage paths stay private; admins review status without exposing public URLs.
      </PageTitle>
      {!available ? <p role="status">Document verification is temporarily unavailable.</p> : null}
      <p className="auth-alert info">For buyer verification, review and approve the document below, then <Link href="/admin/badges">grant its matching badge</Link>. Uploading a file submits it to this review queue; it does not approve the badge automatically.</p>
      {testProperties.length ? (
        <section className="card flat stack">
          <h2>Synthetic journey test controls</h2>
          <p className="muted">Only the designated demo seller’s properties appear here. Test approvals let that seller invite the designated demo buyer. They do not verify ownership or approve any document.</p>
          {testProperties.map((property) => <AdminSyntheticPropertyReview key={property.id} property={property} />)}
        </section>
      ) : null}
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
                  <a href={`/api/admin/documents/${encodeURIComponent(document.id)}`} rel="noreferrer" target="_blank">Open</a>
                </td>
                <td>
                  <div className="actions inline">
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
                      <button className="button" type="submit">Approve</button>
                    </form>
                    <form action={submitDocumentReview}>
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="decision" type="hidden" value="REJECTED" />
                      <button className="button secondary" type="submit">Reject</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {nextCursor ? <a className="button secondary" href={`/admin/documents?cursor=${encodeURIComponent(nextCursor)}`}>Next documents</a> : null}
    </div>
  );
}
