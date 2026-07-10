import { PageTitle } from "../../../components/page-title";
import { listPendingDocuments } from "../../../server/contracts";
import { submitDocumentReview } from "../../../server/form-actions";

export default async function AdminDocumentsPage() {
  const { data: adminDocuments } = await listPendingDocuments();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Documents">
        Document storage paths stay private; admins review status without exposing public URLs.
      </PageTitle>
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
            {adminDocuments.map((document) => {
              const signedUrl = "signedUrl" in document && typeof document.signedUrl === "string"
                ? document.signedUrl
                : null;

              return (
              <tr key={document.id}>
                <td>{document.owner}</td>
                <td>{document.subject}</td>
                <td>{document.type}</td>
                <td>{document.ownershipEvidenceStale ? "Prior property version" : document.status}</td>
                <td>
                  {signedUrl ? (
                    <a href={signedUrl} rel="noreferrer" target="_blank">Open</a>
                  ) : (
                    <span className="muted">Private</span>
                  )}
                </td>
                <td>
                  <div className="actions inline">
                    <form action={submitDocumentReview}>
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="decision" type="hidden" value="APPROVED" />
                      {document.documentType === "OWNERSHIP" && !document.ownershipEvidenceKind ? (
                        <select aria-label="Ownership evidence type" name="ownershipEvidenceKind" required>
                          <option value="">Classify evidence</option>
                          <option value="GOVERNMENT_ID">Government-issued photo ID</option>
                          <option value="PROPERTY_ADDRESS_PROOF">Property address proof</option>
                        </select>
                      ) : null}
                      <button className="button" disabled={document.ownershipEvidenceStale} type="submit">Approve</button>
                    </form>
                    <form action={submitDocumentReview}>
                      <input name="documentId" type="hidden" value={document.id} />
                      <input name="decision" type="hidden" value="REJECTED" />
                      {document.documentType === "OWNERSHIP" && !document.ownershipEvidenceKind ? (
                        <select aria-label="Ownership evidence type" name="ownershipEvidenceKind" required>
                          <option value="">Classify evidence</option>
                          <option value="GOVERNMENT_ID">Government-issued photo ID</option>
                          <option value="PROPERTY_ADDRESS_PROOF">Property address proof</option>
                        </select>
                      ) : null}
                      <button className="button secondary" type="submit">Reject</button>
                    </form>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
