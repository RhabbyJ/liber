import Link from "next/link";
import { marketSlugSchema } from "@liber/validators";
import { BuyerProfileWizard } from "../../../components/buyer-profile-wizard";
import { BuyerProfileVisibilityForm } from "../../../components/buyer-profile-visibility-form";
import { BadgePill } from "../../../components/badge-pill";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon } from "../../../components/icon";
import { DirectUploadField } from "../../../components/direct-upload-field";
import { getCurrentBuyerProfile } from "../../../server/contracts";
import { confidentialDocumentAccessEnabled } from "../../../server/verification/document-access";
import { formatRange } from "../../../lib/format";
import { DEFAULT_MARKET_SLUG } from "../../../lib/service-areas";
import { getActiveMarketOrFallback } from "../../../server/service-areas";
import { avatarColorIndex, avatarColorNames, avatarColorOptions } from "../../../lib/avatar-variant";
import {
  setBuyerAvatar,
  submitBuyerProfile,
  submitBuyerProfileVisibility,
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
  const activeTestPreApproval = activeBadges.find((badge) => badge.type === "TEST_PRE_APPROVED");
  const pendingPreApproval = buyer.badges.find(
    (badge) => badge.type === "PRE_APPROVED" && badge.status === "pending",
  );
  const expiredPreApproval = buyer.badges.find(
    (badge) => badge.type === "PRE_APPROVED" && badge.status === "expired",
  );
  const hasPreApproval = Boolean(activePreApproval);
  const hasPendingPreApproval = Boolean(pendingPreApproval);
  const isAdminControlled = buyer.visibility === "hidden";
  // A paused profile is a saved draft that still meets every publication rule.
  const isPaused = buyer.visibility === "draft" && buyer.canRepublish;
  const showProfileWizard = !isAdminControlled && (
    (!isActive && !isPaused) || edit === "profile" || buyer.primaryServiceArea?.active === false
  );
  const canSubmitVerification = buyer.id !== "new-profile" && buyer.visibility !== "draft";
  const accountName = buyer.accountName || "buyer";
  const displayName = buyer.name || accountName;
  const [displayLabel, displayCode] = splitAccountCode(displayName);
  const visibilityLabel = isActive
    ? "Live to sellers"
    : buyer.visibility === "hidden"
      ? "Hidden"
      : isPaused
        ? "Paused - hidden from sellers"
        : "Draft - not yet visible";
  const verifiedInformation = [
    { label: "Identity", verified: activeBadges.some((badge) => badge.type === "VERIFIED_IDENTITY") },
    { label: "Pre-approval", verified: hasPreApproval },
    { label: "Verified funds", verified: activeBadges.some((badge) => badge.type === "VERIFIED_FUNDS") },
    { label: "Cash buyer", verified: activeBadges.some((badge) => badge.type === "CASH_BUYER") },
  ].filter((item) => item.verified);
  const criteria = buyer.criteriaDetails[0];
  const generalInformation = [
    { label: "Purchase type", value: buyer.type || "Not set" },
    { label: "Seeking property type", value: buyer.purpose || "Not set" },
    { label: "Desired location", value: buyer.location || "Not set" },
    { label: "Budget", value: formatRange(buyer.budgetMin, buyer.budgetMax) },
    { label: "Down payment", value: formatRange(buyer.downPaymentMin, buyer.downPaymentMax) },
    { label: "Beds & baths", value: bedsAndBaths(criteria?.bedroomsMin, criteria?.bathroomsMin) },
    { label: "Home size", value: sizeRange(criteria?.squareFeetMin, criteria?.squareFeetMax) },
    { label: "Lot size", value: sizeRange(criteria?.lotSizeMin, criteria?.lotSizeMax) },
    { label: "Year built", value: criteria?.yearBuiltMin ? `${criteria.yearBuiltMin} or newer` : "Any" },
    { label: "Condition", value: criteria?.condition || "Any" },
    { label: "Amenities", value: criteria?.features?.length ? criteria.features.join(", ") : "None selected" },
    { label: "Note to sellers", value: buyer.bio || "Not set" },
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
    <section className="settings-section buyer-verification-card" aria-labelledby="buyer-verification-title" id="buyer-verification-card">
      <h2 id="buyer-verification-title">Get pre-approved</h2>
      <p className="settings-help">
        {hasPreApproval
          ? "Badge is active. Upload refreshed evidence before it expires."
          : hasPendingPreApproval
            ? "Evidence is in review. You can upload an updated file if needed."
            : "Upload a pre-approval letter or proof of funds. Sellers only see an approved badge."}
      </p>
      {verification === "missing" ? (
        <div className="inline-alert warning" role="status">
          <Icon name="info" size={20} />
          <p>Choose a file before submitting for review.</p>
        </div>
      ) : null}
      {verification === "submitted" ? (
        <div className="inline-alert success" role="status">
          <Icon name="check" size={20} />
          <p>Submitted for review. Sellers only see an approved badge.</p>
        </div>
      ) : null}
      <DirectUploadField
        accept="application/pdf,image/png,image/jpeg,image/webp"
        disabledReason={confidentialDocumentAccessEnabled() ? undefined : "Document verification is temporarily unavailable."}
        documentTypes={[
          { label: "Pre-approval letter", value: "PRE_APPROVAL" },
          { label: "Proof of funds", value: "VERIFIED_FUNDS" },
          { label: "Government-issued identity", value: "IDENTITY" },
        ]}
        hint="PDF, PNG, JPEG, or WebP; 20 MB max. Uploads go directly to private Storage."
        label="File"
        purpose="BUYER_VERIFICATION"
      />
    </section>
  );

  if (showProfileWizard) {
    const isFirstSetup = buyer.visibility === "draft" && !isPaused;

    return (
      <div className="page buyer-profile-page buyer-profile-setup">
        <div className="buyer-profile-shell">
          {isFirstSetup ? (
            <div className="buyer-setup-progress">
              <span aria-hidden="true" className="buyer-setup-progress-bar">
                <span className="done" />
                <span className="current" />
              </span>
              <p>Step 2 of 2: Buyer profile</p>
            </div>
          ) : (
            <Link className="page-back" href="/buyer/profile">
              <Icon name="chevron-left" size={18} />
              Buyer profile
            </Link>
          )}
          <header className="buyer-profile-intro">
            <h1>{isFirstSetup ? "Tell sellers what you’re looking for" : "Edit your buyer profile"}</h1>
            {isFirstSetup ? <p className="meta-line">Takes about three minutes. Your personal details stay private.</p> : null}
          </header>
          <BuyerProfileWizard
            action={submitBuyerProfile}
            buyer={wizardBuyer}
            isPublished={isActive}
            marketSlug={market.slug}
          />
          {activeTestPreApproval ? <TestPreApprovalNotice badge={activeTestPreApproval} /> : null}
          {canSubmitVerification ? verificationCard : null}
        </div>
      </div>
    );
  }

  return (
    <div className="page buyer-profile-page buyer-profile-summary-page">
      {isAdminControlled ? (
        <div className="inline-alert warning" role="status">
          <Icon name="info" size={20} />
          <p><strong>Editing unavailable.</strong> This profile is {buyer.visibility}. Contact an admin to continue.</p>
        </div>
      ) : null}
      {(status === "published" || status === "saved" || status === "republished") && isActive ? (
        <div className="inline-alert success" role="status">
          <Icon name="check" size={20} />
          <p>
            <strong>{status === "published" ? "Profile published." : status === "republished" ? "Profile republished." : "Changes saved."}</strong>
            {" "}Live to approved sellers.
          </p>
        </div>
      ) : null}
      {isPaused ? (
        <div className="inline-alert" role="status">
          <Icon name="info" size={20} />
          <p>
            <strong>{status === "paused" ? "Profile paused." : "Your profile is paused."}</strong>
            {" "}Sellers can’t find or invite you until you republish it.
          </p>
        </div>
      ) : null}

      <header className="profile-header buyer-summary-header">
        <GeneratedAvatar
          decorative
          name={displayName}
          seed={buyer.userId || buyer.id}
          size="xl"
          variant={buyer.avatarVariant}
        />
        <div className="profile-header-text">
          <h1>{displayLabel}{displayCode ? <> <span className="buyer-summary-code">{displayCode}</span></> : null}</h1>
          <p className="meta-line">{[buyer.location || "Location not set", buyer.type || "Purchase type not set"].join(" · ")}</p>
          <span className={`status-tag ${isActive ? "active" : buyer.visibility === "hidden" ? "expired" : "pending"}`}>
            {visibilityLabel}
          </span>
        </div>
        {isAdminControlled ? null : (
          <div className="profile-header-actions">
            {isPaused ? <BuyerProfileVisibilityForm action={submitBuyerProfileVisibility} target="ACTIVE" /> : null}
            <Link className="button secondary" href="/buyer/profile?edit=profile">
              <Icon name="pencil" size={16} />
              Edit profile
            </Link>
            {isActive ? (
              <Link className="button secondary" href={`/buyers/${buyer.id}`}>
                <Icon name="eye" size={16} />
                Preview
              </Link>
            ) : null}
            {isActive ? <BuyerProfileVisibilityForm action={submitBuyerProfileVisibility} target="DRAFT" /> : null}
          </div>
        )}
      </header>

      {isAdminControlled ? null : (
        <section className="settings-section" aria-labelledby="buyer-identity-title">
          <h2 id="buyer-identity-title">Public identity</h2>
          <p className="settings-help">Sellers see your first name, last initial, account code, and avatar. Your full surname and contact details stay private.</p>
          <div className="buyer-summary-rows">
            <div className="buyer-summary-row">
              <span className="buyer-summary-label">Shown to sellers</span>
              <strong className="buyer-summary-value">{buyer.name}</strong>
            </div>
            <form action={setBuyerAvatar} className="avatar-color-picker buyer-summary-row">
              <p className="avatar-color-label buyer-summary-label" id="avatar-color-label">Avatar color</p>
              <div aria-labelledby="avatar-color-label" className="avatar-swatch-grid" role="group">
                {avatarColorOptions().map((variant, index) => {
                  const selected = avatarColorIndex(buyer.avatarVariant, buyer.userId || buyer.id) === index;
                  return (
                    <button
                      aria-label={avatarColorNames[index]}
                      aria-pressed={selected}
                      className={`avatar-swatch${selected ? " selected" : ""}`}
                      key={variant}
                      name="avatarVariant"
                      type="submit"
                      value={variant}
                    >
                      <GeneratedAvatar decorative name={displayName} seed={buyer.userId || buyer.id} size="sm" variant={variant} />
                    </button>
                  );
                })}
              </div>
            </form>
          </div>
        </section>
      )}

      <section className="settings-section" aria-labelledby="buyer-details-title">
        <h2 id="buyer-details-title">Profile details</h2>
        <dl className="settings-dl buyer-summary-rows">
          {generalInformation.map((item) => (
            <div className="buyer-summary-row" key={item.label}>
              <dt className="buyer-summary-label">{item.label}</dt>
              <dd className={`buyer-summary-value${item.value === "Not set" ? " is-empty" : ""}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="buyer-preapproval-title">
        <h2 id="buyer-preapproval-title">Financing</h2>
        <div className="settings-status buyer-financing-row">
          <span
            aria-hidden="true"
            className={`status-list-icon ${hasPreApproval ? "active" : hasPendingPreApproval ? "pending" : expiredPreApproval ? "expired" : ""}`}
          >
            <Icon name={hasPreApproval ? "check-shield" : "lock"} size={18} />
          </span>
          <span className="settings-status-text">
            <strong>{preApprovalTitle}</strong>
            <span>{preApprovalDescription}</span>
          </span>
          <Link className={`button ${hasPreApproval || hasPendingPreApproval ? "secondary" : "primary"} sm`} href="/buyer/badges">
            {preApprovalAction}
          </Link>
        </div>
      </section>

      {activeTestPreApproval ? <TestPreApprovalNotice badge={activeTestPreApproval} /> : null}

      <section className="settings-section" aria-labelledby="buyer-verified-title">
        <h2 id="buyer-verified-title">Verified information</h2>
        {verifiedInformation.length > 0 ? (
          <ul className="status-list">
            {verifiedInformation.map((item) => (
              <li key={item.label}>
                <span aria-hidden="true" className="status-list-icon active">
                  <Icon name="check" size={16} />
                </span>
                <strong>{item.label}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="buyer-summary-empty">No verified information yet.</p>
        )}
      </section>
    </div>
  );
}

function TestPreApprovalNotice({ badge }: { badge: Parameters<typeof BadgePill>[0]["badge"] }) {
  return (
    <aside className="inline-alert warning buyer-test-notice" role="status">
      <Icon name="info" size={20} />
      <p><BadgePill badge={badge} /> Testing only. Financing has not been verified. This badge expires automatically within 24 hours.</p>
    </aside>
  );
}

function bedsAndBaths(beds?: number, baths?: number) {
  const parts = [beds ? `${beds}+ beds` : "", baths ? `${baths}+ baths` : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "Any";
}

function sizeRange(min?: number, max?: number) {
  const sqft = (value: number) => `${value.toLocaleString("en-US")} sqft`;
  if (min && max) return `${sqft(min)} – ${sqft(max)}`;
  if (min) return `${sqft(min)}+`;
  if (max) return `Up to ${sqft(max)}`;
  return "Any";
}

// Public labels end in the stable account code ("Julie P. #7C4E2A91B6D0"); the code renders as secondary text.
function splitAccountCode(label: string): [string, string] {
  const match = /^(.*\S)\s+(#[A-Za-z0-9]+)$/u.exec(label);
  return match ? [match[1], match[2]] : [label, ""];
}
