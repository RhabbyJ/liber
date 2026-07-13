import Link from "next/link";
import { BadgePill } from "../../../components/badge-pill";
import { DirectUploadField } from "../../../components/direct-upload-field";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { TrustTransformation } from "../../../components/trust-transformation";
import { getCurrentBuyerProfile } from "../../../server/contracts";

export default async function BuyerBadgesPage() {
  const { data: buyer } = await getCurrentBuyerProfile();
  const hasActiveBadges = buyer.badges.some((badge) => badge.status === "active");

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Verification"
        title="Get verified"
        tone="buyer"
      >
        Upload a pre-approval or proof of funds. Liber reviews privately - sellers only see the badge.
      </PageTitle>

      <section className="verification-benefit">
        <div className="stack tight">
          <h2>Why get verified?</h2>
          <p>
            Your evidence stays private while Liber reviews it. Sellers see only the resulting badge and can use
            approved trust signals when searching for buyers.
          </p>
        </div>
        <TrustTransformation />
      </section>

      <section className="card stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Upload</p>
            <h2>Submit a document</h2>
          </div>
          <span className="status-dot info">
            <Icon name="lock" size={12} />
            Private
          </span>
        </div>
        <DirectUploadField
          accept="application/pdf,image/png,image/jpeg,image/webp"
          documentTypes={[
            { label: "Pre-approval letter", value: "PRE_APPROVAL" },
            { label: "Proof of funds", value: "VERIFIED_FUNDS" },
            { label: "Identity", value: "IDENTITY" },
          ]}
          hint="PDF, PNG, JPEG, or WebP; 20 MB max. Uploads go directly to private Storage."
          label="File"
          purpose="BUYER_VERIFICATION"
        />
      </section>

      <section className="stack">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Your badges</p>
            <h2>Status</h2>
          </div>
          {!hasActiveBadges ? <span className="muted small">None yet.</span> : null}
        </div>
        <div className="grid three">
          {buyer.badges.map((badge) => (
            <article className={`card compact ${badge.status === "active" ? "" : "outline"}`} key={badge.label}>
              <BadgePill badge={badge} />
              <h3 style={{ fontSize: 16 }}>{badge.label}</h3>
              <p className="muted small">
                <strong style={{ textTransform: "capitalize" }}>{badge.status}</strong>
                {badge.expiresInDays !== undefined
                  ? badge.expiresInDays >= 0
                    ? ` - ${badge.expiresInDays} days left`
                    : " - Expired"
                  : ""}
              </p>
            </article>
          ))}
        </div>
        <p className="muted small">
          <Link href="/buyer/profile">Back to profile</Link>
        </p>
      </section>
    </div>
  );
}
