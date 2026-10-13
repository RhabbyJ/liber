import type { BuyerVerificationDocument } from "../server/verification/buyer-documents";

const documentLabels = {
  PRE_APPROVAL: "Pre-approval letter",
  VERIFIED_FUNDS: "Proof of funds",
  IDENTITY: "Identity document",
};

const reviewLabels = {
  PENDING: { label: "Awaiting review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

const submittedDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function BuyerVerificationDocuments({ documents }: { documents: BuyerVerificationDocument[] }) {
  return (
    <section aria-labelledby="submitted-documents-heading" className="stack">
      <div className="section-head compact">
        <div>
          <p className="eyebrow">Your documents</p>
          <h2 id="submitted-documents-heading">Submitted for review</h2>
        </div>
      </div>
      <p className="muted small">
        Documents listed here have already been submitted. There is no additional submit step.
        Only you and Liber admins can see these document details.
      </p>
      {documents.length === 0 ? (
        <div className="card compact">
          <p>No documents submitted yet. Upload a document above to send it for review.</p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {documents.map((document) => {
            const status = reviewLabels[document.reviewStatus];
            return (
              <li className="card compact stack tight" key={document.id}>
                <div className="section-head compact">
                  <h3>{documentLabels[document.documentType]}</h3>
                  <span className={`status-dot ${status.tone}`}>{status.label}</span>
                </div>
                {document.originalFilename ? (
                  <p className="small" style={{ overflowWrap: "anywhere" }}>{document.originalFilename}</p>
                ) : null}
                <p className="muted small">
                  Submitted <time dateTime={document.createdAt}>{submittedDate.format(new Date(document.createdAt))}</time>
                </p>
                {document.reviewStatus === "PENDING" ? (
                  <p className="small">Your document is in the review queue. No further submission is needed.</p>
                ) : document.reviewStatus === "APPROVED" ? (
                  <p className="small">
                    This document is approved. An admin can use it to grant the matching badge; badge status appears below.
                  </p>
                ) : (
                  <div className="stack tight small">
                    <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                      {document.rejectionReason || "This document could not be approved. Upload a replacement for another review."}
                    </p>
                    <p><a href="#verification-upload">Upload a replacement</a></p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {documents.length === 50 ? <p className="muted small">Showing your 50 most recent documents.</p> : null}
    </section>
  );
}
