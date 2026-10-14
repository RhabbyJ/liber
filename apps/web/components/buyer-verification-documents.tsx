import type { BuyerVerificationDocument } from "../server/verification/buyer-documents";

const documentLabels = {
  PRE_APPROVAL: "Pre-approval letter",
  VERIFIED_FUNDS: "Proof of funds",
  IDENTITY: "Identity document",
};

const reviewLabels = {
  PENDING: { label: "Awaiting review", tone: "pending" },
  APPROVED: { label: "Approved", tone: "active" },
  REJECTED: { label: "Rejected", tone: "expired" },
};

const submittedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
  timeZoneName: "short",
});

// Self-contained (no local component imports) so tests can SSR it from source.
function DocumentIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="20">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

export function BuyerVerificationDocuments({ documents }: { documents: BuyerVerificationDocument[] }) {
  return (
    <section aria-labelledby="submitted-documents-heading" className="settings-section verification-documents">
      <h2 id="submitted-documents-heading">Submitted documents</h2>
      <p className="settings-help">Only you and Liber admins can see these details. Nothing else needs to be submitted.</p>
      {documents.length === 0 ? (
        <p className="verification-documents-empty">No documents submitted yet. Upload a document above to send it for review.</p>
      ) : (
        <ul className="verification-document-list">
          {documents.map((document) => {
            const status = reviewLabels[document.reviewStatus];
            return (
              <li className={`verification-document ${status.tone}`} key={document.id}>
                <span className="verification-document-icon"><DocumentIcon /></span>
                <div className="verification-document-body">
                  <div className="verification-document-head">
                    <h3>{documentLabels[document.documentType]}</h3>
                    <span className={`status-tag ${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="verification-document-meta">
                    {document.originalFilename ? <span className="verification-document-file">{document.originalFilename}</span> : null}
                    <span>Submitted <time dateTime={document.createdAt}>{submittedDate.format(new Date(document.createdAt))}</time></span>
                  </p>
                  {document.reviewStatus === "PENDING" ? (
                    <p className="verification-document-note">In the review queue. No further submission is needed.</p>
                  ) : document.reviewStatus === "APPROVED" ? (
                    <p className="verification-document-note">
                      This document is approved. An admin can use it to grant the matching badge; badge status appears above.
                    </p>
                  ) : (
                    <div className="verification-document-rejection">
                      <p>
                        {document.rejectionReason || "This document could not be approved. Upload a replacement for another review."}
                      </p>
                      <a className="text-link" href="#verification-upload">Upload a replacement</a>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {documents.length === 50 ? <p className="settings-help">Showing your 50 most recent documents.</p> : null}
    </section>
  );
}
