import Link from "next/link";
import { DirectUploadField } from "../../../components/direct-upload-field";
import { BuyerVerificationDocuments } from "../../../components/buyer-verification-documents";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { confidentialDocumentAccessEnabled } from "../../../server/verification/document-access";
import { listCurrentBuyerVerificationDocuments } from "../../../server/verification/buyer-documents";

export default async function BuyerBadgesPage() {
  const [{ data: buyer }, documents] = await Promise.all([getCurrentBuyerProfile(), listCurrentBuyerVerificationDocuments()]);

  return (
    <div className="page narrow stack loose">
      <Link className="page-back" href="/buyer/profile">
        <Icon name="chevron-left" size={18} />
        Buyer profile
      </Link>
      <PageTitle title="Get verified">Sellers see your badge, never your documents.</PageTitle>

      <section className="settings-section" aria-labelledby="verification-upload-title" id="verification-upload">
        <h2 id="verification-upload-title">Upload a document</h2>
        <DirectUploadField
          accept="application/pdf,image/png,image/jpeg,image/webp"
          disabledReason={confidentialDocumentAccessEnabled() ? undefined : "Document verification is temporarily unavailable."}
          documentTypes={[
            { label: "Pre-approval letter", value: "PRE_APPROVAL" },
            { label: "Proof of funds", value: "VERIFIED_FUNDS" },
            { label: "Identity", value: "IDENTITY" },
          ]}
          hint="PDF, PNG, JPEG, or WebP; 20 MB max. Only you and authorized reviewers can access your document."
          label="File"
          purpose="BUYER_VERIFICATION"
        />
      </section>

      <BuyerVerificationDocuments documents={documents} />

      <section className="settings-section" aria-labelledby="verification-badges-title">
        <h2 id="verification-badges-title">Your badges</h2>
        {buyer.badges.length === 0 ? (
          <p className="muted">No badges yet.</p>
        ) : (
          <ul className="status-list">
            {buyer.badges.map((badge) => (
              <li key={badge.label}>
                <span className={`status-list-icon ${badge.status}`} aria-hidden="true">
                  <Icon name={badge.status === "active" ? "check-shield" : badge.status === "pending" ? "lock" : "info"} size={18} />
                </span>
                <strong>{badge.label}</strong>
                <span className={`status-tag ${badge.status}`}>{badgeStatusLabel(badge)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function badgeStatusLabel(badge: { expiresInDays?: number; status: string }) {
  if (badge.status === "pending") return "In review";
  if (badge.status === "expired" || (badge.expiresInDays !== undefined && badge.expiresInDays < 0)) return "Expired";
  if (badge.expiresInDays !== undefined) return `Active · ${badge.expiresInDays} days left`;
  return "Active";
}
