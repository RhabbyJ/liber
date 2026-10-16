import type { Metadata } from "next";
import Link from "next/link";
import { DirectUploadField } from "../../../components/direct-upload-field";
import { BuyerVerificationDocuments } from "../../../components/buyer-verification-documents";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { confidentialDocumentAccessEnabled } from "../../../server/verification/document-access";
import { listCurrentBuyerVerificationDocuments } from "../../../server/verification/buyer-documents";
import { VerificationStatusList } from "./verification-status-list";

export const metadata: Metadata = { title: "Get verified" };

export default async function BuyerBadgesPage() {
  const [{ data: buyer }, documents] = await Promise.all([getCurrentBuyerProfile(), listCurrentBuyerVerificationDocuments()]);

  return (
    <div className="page narrow stack loose buyer-verification-page">
      <Link className="page-back" href="/buyer/profile">
        <Icon name="chevron-left" size={18} />
        Buyer profile
      </Link>
      <PageTitle title="Get verified">Sellers see your badge, never your documents.</PageTitle>

      <section className="settings-section" aria-labelledby="verification-status-title">
        <h2 id="verification-status-title">Verification status</h2>
        <VerificationStatusList badges={buyer.badges} documents={documents} />
      </section>

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
    </div>
  );
}
