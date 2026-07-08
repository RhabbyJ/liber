import Link from "next/link";
import { BuyerProfileWizard } from "../../../components/buyer-profile-wizard";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon } from "../../../components/icon";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import {
  previousBuyerAvatar,
  regenerateBuyerPublicAlias,
  shuffleBuyerAvatar,
  submitBuyerProfile,
  submitBuyerVerificationDocument,
} from "../../../server/form-actions";

export default async function BuyerProfileBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; verification?: string }>;
}) {
  const { edit = "", verification = "" } = searchParams ? await searchParams : {};
  const { data: buyer } = await getCurrentBuyerProfile();
  const isActive = buyer.visibility === "active";
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const hasPreApproval = activeBadges.some((badge) => badge.type === "PRE_APPROVED");
  const hasPendingPreApproval = buyer.badges.some((badge) => badge.type === "PRE_APPROVED" && badge.status === "pending");
  const showProfileWizard = !isActive || edit === "profile";
  const canSubmitVerification = buyer.id !== "new-profile" && buyer.visibility !== "draft";
  const accountName = buyer.accountName || "buyer";
  const displayName = buyer.name || accountName;
  const visibilityLabel = isActive
    ? "Live to sellers"
    : buyer.visibility === "hidden"
      ? "Hidden"
      : "Draft - not yet visible";
  const verifiedInformation = [
    { label: "Identity", verified: activeBadges.some((badge) => badge.type === "VERIFIED_IDENTITY") },
    { label: "Pre-approval", verified: hasPreApproval },
    { label: "Verified funds", verified: activeBadges.some((badge) => badge.type === "VERIFIED_FUNDS") },
    { label: "Cash buyer", verified: activeBadges.some((badge) => badge.type === "CASH_BUYER") },
    { label: "Non-contingent preference", verified: activeBadges.some((badge) => badge.type === "NON_CONTINGENT") },
    { label: "Completed transaction", verified: activeBadges.some((badge) => badge.type === "COMPLETED_TRANSACTION") },
  ].filter((item) => item.verified);
  const generalInformation = [
    { label: "Purchase type", value: buyer.type || "Not set" },
    { label: "Seeking property type", value: buyer.purpose || "Not set" },
    { label: "Desired location", value: buyer.location || "Not set" },
    { label: "Profile status", value: visibilityLabel },
    { label: "Last updated", value: buyer.refreshedAt || "Not set" },
  ];
  const verificationCard = (
    <article
      className={`card stack verification-card buyer-preapproval-card ${!hasPreApproval ? "priority" : ""}`}
      id="buyer-verification-card"
    >
      <div className="section-head compact">
        <div>
          <p className="eyebrow">Verification</p>
          <h2>Get pre-approved</h2>
        </div>
        <span className={`status-dot ${hasPreApproval ? "active" : hasPendingPreApproval ? "warning" : "info"}`}>
          <Icon name={hasPreApproval ? "check-shield" : "lock"} size={12} />
          {hasPreApproval ? "Active" : hasPendingPreApproval ? "In review" : "Private"}
        </span>
      </div>
      <p className="muted small">
        {hasPreApproval
          ? "Your pre-approval badge is active. Upload refreshed evidence before it expires."
          : hasPendingPreApproval
            ? "Your pre-approval evidence is under review. You can upload updated proof of funds if anything changed."
            : "Upload a pre-approval letter or proof of funds. Liber reviews it; sellers only see the approved badge."}
      </p>
      <form action={submitBuyerVerificationDocument} className="form-grid" encType="multipart/form-data">
        {verification === "missing" ? (
          <div className="auth-alert info field full">
            <strong>Add a file first</strong>
            <span>Choose your pre-approval letter or proof of funds before submitting for review.</span>
          </div>
        ) : null}
        {verification === "submitted" ? (
          <div className="auth-alert success field full">
            <strong>Submitted for review</strong>
            <span>Your document is private. Sellers will only see an approved badge.</span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="documentType">Type</label>
          <select id="documentType" name="documentType">
            <option value="PRE_APPROVAL">Pre-approval letter</option>
            <option value="VERIFIED_FUNDS">Proof of funds</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="document">File</label>
          <input id="document" name="document" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" />
          <span className="field-hint">PDF, PNG, JPEG, WebP - 25 MB max</span>
        </div>
        <div className="field full">
          <button className="button primary" type="submit">
            <Icon name="upload" size={14} />
            Submit for review
          </button>
        </div>
      </form>
    </article>
  );

  if (showProfileWizard) {
    return (
      <div className="page wide stack loose buyer-profile-page">
        <div className="buyer-profile-shell">
          <article className="card stack loose wizard-card profile-builder-card">
            <BuyerProfileWizard
              action={submitBuyerProfile}
              buyer={buyer}
              previousAvatarAction={previousBuyerAvatar}
              regenerateAliasAction={regenerateBuyerPublicAlias}
              shuffleAction={shuffleBuyerAvatar}
            />
          </article>
          {canSubmitVerification ? verificationCard : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page wide stack loose buyer-profile-page">
      <div className="buyer-profile-shell">
        <article className="card buyer-profile-account-card">
          <div className="buyer-profile-account-head">
            <div className="buyer-profile-identity">
              <div className="buyer-profile-avatar">
                <GeneratedAvatar
                  alt="Generated buyer avatar"
                  seed={buyer.userId || buyer.id}
                  size="xl"
                  variant={buyer.avatarVariant}
                />
              </div>
              <div>
                <h1>{displayName}</h1>
                <p>
                  {buyer.location || "Location not set"}
                  <span>{buyer.type || "Purchase type not set"}</span>
                </p>
              </div>
            </div>
            <div className="buyer-profile-actions">
              <Link className="button primary" href="/buyer/profile?edit=profile">
                <Icon name="pencil" size={14} />
                Edit Profile
              </Link>
            </div>
          </div>

          <div className="buyer-profile-info-block">
            <h2>General Information</h2>
            <dl className="buyer-profile-info-grid">
              {generalInformation.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </article>

        <article className="card buyer-verified-card">
          <h2>Your Verified Information</h2>
          {verifiedInformation.length > 0 ? (
            <ul className="buyer-verified-list">
              {verifiedInformation.map((item) => (
                <li key={item.label}>
                  <span className="buyer-verified-check">
                    <Icon name="check" size={13} />
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No verified information yet.</p>
          )}
        </article>

        {verificationCard}
      </div>
    </div>
  );
}
