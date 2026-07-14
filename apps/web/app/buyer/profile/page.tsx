import Link from "next/link";
import { marketSlugSchema } from "@liber/validators";
import { BuyerProfileWizard } from "../../../components/buyer-profile-wizard";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon } from "../../../components/icon";
import { DirectUploadField } from "../../../components/direct-upload-field";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { DEFAULT_MARKET_SLUG } from "../../../lib/service-areas";
import { getActiveMarketOrFallback } from "../../../server/service-areas";
import {
  regenerateBuyerPublicAlias,
  shuffleBuyerAvatar,
  submitBuyerProfile,
} from "../../../server/form-actions";

export default async function BuyerProfileBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string; market?: string; status?: string; verification?: string }>;
}) {
  const { edit = "", market: requestedMarket = "", status = "", verification = "" } = searchParams
    ? await searchParams
    : {};
  const { data: buyer } = await getCurrentBuyerProfile();
  const parsedRequestedMarket = marketSlugSchema.safeParse(requestedMarket);
  const preferredMarketSlug = (buyer.primaryServiceArea?.active ? buyer.primaryServiceArea.marketSlug : undefined) ??
    (parsedRequestedMarket.success ? parsedRequestedMarket.data : DEFAULT_MARKET_SLUG);
  const market = await getActiveMarketOrFallback(preferredMarketSlug);
  const canReusePrimaryArea = Boolean(
    buyer.primaryServiceArea?.active && buyer.primaryServiceArea.marketSlug === market.slug,
  );
  const wizardBuyer = buyer.primaryServiceArea && !canReusePrimaryArea
    ? {
        ...buyer,
        city: "",
        lat: 0,
        lng: 0,
        location: "",
        neighborhood: undefined,
        postalCode: undefined,
        primaryServiceArea: undefined,
        serviceAreaSlugs: [],
        state: "",
      }
    : buyer;
  const isActive = buyer.visibility === "active";
  const activeBadges = buyer.badges.filter((badge) => badge.status === "active");
  const activePreApproval = activeBadges.find((badge) => badge.type === "PRE_APPROVED");
  const pendingPreApproval = buyer.badges.find(
    (badge) => badge.type === "PRE_APPROVED" && badge.status === "pending",
  );
  const expiredPreApproval = buyer.badges.find(
    (badge) => badge.type === "PRE_APPROVED" && badge.status === "expired",
  );
  const hasPreApproval = Boolean(activePreApproval);
  const hasPendingPreApproval = Boolean(pendingPreApproval);
  const isAdminControlled = buyer.visibility === "hidden";
  const showProfileWizard = !isAdminControlled && (
    !isActive || edit === "profile" || buyer.primaryServiceArea?.active === false
  );
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
  ].filter((item) => item.verified);
  const generalInformation = [
    { label: "Purchase type", value: buyer.type || "Not set" },
    { label: "Seeking property type", value: buyer.purpose || "Not set" },
    { label: "Desired location", value: buyer.location || "Not set" },
    { label: "Profile status", value: visibilityLabel },
    { label: "Last updated", value: buyer.refreshedAt || "Not set" },
  ];
  const preApprovalTitle = hasPreApproval
    ? "Pre-approved"
    : hasPendingPreApproval
      ? "In review"
      : expiredPreApproval
        ? "Pre-approval expired"
        : "Get pre-approved";
  const preApprovalStatus = hasPreApproval
    ? "Active"
    : hasPendingPreApproval
      ? "In review"
      : expiredPreApproval
        ? "Expired"
        : "Not verified";
  const preApprovalAction = hasPreApproval || hasPendingPreApproval
    ? "View verification"
    : expiredPreApproval
      ? "Renew pre-approval"
      : "Get pre-approved";
  const preApprovalDescription = hasPreApproval
    ? activePreApproval?.expiresInDays !== undefined
      ? `Active for ${activePreApproval.expiresInDays} more day${activePreApproval.expiresInDays === 1 ? "" : "s"}. Sellers see the badge, not your documents.`
      : "Your verified badge is active. Sellers see the badge, not your documents."
    : hasPendingPreApproval
      ? "Liber is reviewing your private document. Sellers will only see it after approval."
      : expiredPreApproval
        ? "Upload a current document to renew your badge. Your evidence remains private."
        : "Upload a pre-approval letter or proof of funds. Liber keeps your documents private.";
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
      <div className="form-grid">
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
        <DirectUploadField
          accept="application/pdf,image/png,image/jpeg,image/webp"
          documentTypes={[
            { label: "Pre-approval letter", value: "PRE_APPROVAL" },
            { label: "Proof of funds", value: "VERIFIED_FUNDS" },
            { label: "Government-issued identity", value: "IDENTITY" },
          ]}
          hint="PDF, PNG, JPEG, or WebP; 20 MB max. Uploads go directly to private Storage."
          label="File"
          purpose="BUYER_VERIFICATION"
        />
      </div>
    </article>
  );

  if (showProfileWizard) {
    const isFirstSetup = buyer.visibility === "draft";

    return (
      <div className="page wide stack loose buyer-profile-page">
        <div className="buyer-profile-shell">
          <header className="buyer-profile-intro">
            <p className="eyebrow">{isFirstSetup ? "Buyer setup · Step 2 of 2" : "Buyer profile"}</p>
            <h1>{isFirstSetup ? "Tell sellers what you’re looking for" : "Update your buyer profile"}</h1>
            <p>
              {isFirstSetup
                ? "Your account is ready. Add your search criteria in about three minutes; your personal details stay private."
                : "Keep your criteria current so matching sellers see the right demand."}
            </p>
            {isFirstSetup ? (
              <ol className="buyer-profile-path" aria-label="Buyer setup progress">
                <li className="done"><Icon name="check" size={12} /><span>Account ready</span></li>
                <li aria-current="step" className="current"><span>2</span><strong>Buyer profile</strong></li>
                <li><Icon name="arrow-right" size={12} /><span>Then: visible to approved sellers</span></li>
              </ol>
            ) : (
              <span className="status-dot active"><Icon name="check" size={12} /> Live to approved sellers</span>
            )}
          </header>
          <article className="card stack loose wizard-card profile-builder-card">
            <BuyerProfileWizard
              action={submitBuyerProfile}
              buyer={wizardBuyer}
              isPublished={isActive}
              marketSlug={market.slug}
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
        {isAdminControlled ? (
          <div className="auth-alert warning" role="status">
            <strong>Profile editing is unavailable</strong>
            <span>This profile is {buyer.visibility}. Contact an admin before trying to publish changes.</span>
          </div>
        ) : null}
        {status === "published" || status === "saved" ? (
          <div className="auth-alert success" role="status">
            <strong>{status === "published" ? "Buyer profile published" : "Changes saved"}</strong>
            <span>Your profile is live to approved sellers. Your private account details remain hidden.</span>
          </div>
        ) : null}
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
              {isAdminControlled ? null : (
                <>
                  <Link className="button primary" href="/buyer/profile?edit=profile">
                    <Icon name="pencil" size={14} />
                    Edit profile
                  </Link>
                  <form action={regenerateBuyerPublicAlias}>
                    <button className="button secondary" type="submit">New alias</button>
                  </form>
                  <form action={shuffleBuyerAvatar}>
                    <button className="button secondary" type="submit">Change avatar</button>
                  </form>
                </>
              )}
            </div>
          </div>

          <div className="buyer-profile-account-body">
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

            <section className="buyer-profile-preapproval" aria-labelledby="buyer-preapproval-title">
              <div className="buyer-profile-preapproval-head">
                <span className="buyer-profile-preapproval-icon">
                  <Icon name={hasPreApproval ? "check-shield" : "lock"} size={20} />
                </span>
                <span
                  className={`status-dot ${hasPreApproval ? "active" : hasPendingPreApproval ? "warning" : expiredPreApproval ? "danger" : "info"}`}
                >
                  {preApprovalStatus}
                </span>
              </div>
              <div className="buyer-profile-preapproval-copy">
                <p className="eyebrow">Financing readiness</p>
                <h2 id="buyer-preapproval-title">{preApprovalTitle}</h2>
                <p>{preApprovalDescription}</p>
              </div>
              <Link
                className={`button buyer-profile-preapproval-action ${hasPreApproval || hasPendingPreApproval ? "secondary" : "primary"}`}
                href="/buyer/badges"
              >
                {preApprovalAction}
                <Icon name="arrow-right" size={14} />
              </Link>
            </section>
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
      </div>
    </div>
  );
}
