import { Icon, type IconName } from "../../../components/icon";
import type { BuyerVerificationDocument } from "../../../server/verification/buyer-documents";

type VerificationBadge = {
  expiresInDays?: number;
  label: string;
  status: "active" | "pending" | "expired";
  type: string;
};

type Tone = "active" | "pending" | "expired" | "rejected" | "none" | "test";

type StatusRow = {
  action?: string;
  icon: IconName;
  key: string;
  meta: string;
  tag: string;
  title: string;
  tone: Tone;
};

const evidenceRows = [
  { badgeType: "PRE_APPROVED", documentType: "PRE_APPROVAL", start: "Upload a lender pre-approval letter.", title: "Pre-approval" },
  { badgeType: "VERIFIED_FUNDS", documentType: "VERIFIED_FUNDS", start: "Upload proof of funds.", title: "Proof of funds" },
  { badgeType: "VERIFIED_IDENTITY", documentType: "IDENTITY", start: "Upload a government-issued ID.", title: "Identity" },
] as const;

const tagClass: Record<Tone, string> = {
  active: "status-tag active",
  expired: "status-tag expired",
  none: "status-tag",
  pending: "status-tag pending",
  rejected: "status-tag expired",
  test: "status-tag warning",
};

/** Redfin-style verification rows derived from the buyer's badges and their latest submitted evidence. */
export function VerificationStatusList({
  badges,
  documents,
}: {
  badges: VerificationBadge[];
  documents: BuyerVerificationDocument[];
}) {
  const rows: StatusRow[] = evidenceRows.map((row) => {
    const badge = badges.find((item) => item.type === row.badgeType);
    // Documents arrive newest first.
    const latest = documents.find((document) => document.documentType === row.documentType);
    const active = badge?.status === "active" && !(badge.expiresInDays !== undefined && badge.expiresInDays < 0);

    if (active) {
      return {
        icon: "check-shield",
        key: row.badgeType,
        meta: badge.expiresInDays !== undefined
          ? `Expires in ${badge.expiresInDays} day${badge.expiresInDays === 1 ? "" : "s"}.`
          : "Sellers see this badge.",
        tag: "Verified",
        title: row.title,
        tone: "active",
      };
    }
    if (badge?.status === "pending" || latest?.reviewStatus === "PENDING") {
      return {
        icon: "doc",
        key: row.badgeType,
        meta: "Liber is reviewing your document.",
        tag: "In review",
        title: row.title,
        tone: "pending",
      };
    }
    // An expired badge outranks an approved document: that document may be the one behind the old badge.
    if (badge) {
      return {
        action: "Renew",
        icon: "info",
        key: row.badgeType,
        meta: "Upload a current document to renew.",
        tag: "Expired",
        title: row.title,
        tone: "expired",
      };
    }
    if (latest?.reviewStatus === "APPROVED") {
      return {
        icon: "doc",
        key: row.badgeType,
        meta: "Document approved. Badge decision pending.",
        tag: "In review",
        title: row.title,
        tone: "pending",
      };
    }
    if (latest?.reviewStatus === "REJECTED") {
      return {
        action: "Upload a replacement",
        icon: "info",
        key: row.badgeType,
        meta: "Your last document was not approved.",
        tag: "Not approved",
        title: row.title,
        tone: "rejected",
      };
    }
    return {
      icon: "upload",
      key: row.badgeType,
      meta: row.start,
      tag: "Not started",
      title: row.title,
      tone: "none",
    };
  });

  if (badges.some((badge) => badge.type === "CASH_BUYER" && badge.status === "active")) {
    rows.push({ icon: "check-shield", key: "CASH_BUYER", meta: "Cash purchase with verified funds.", tag: "Verified", title: "Cash buyer", tone: "active" });
  }
  // A test marker never borrows the verified look: information icon, warning tone, explicit wording.
  if (badges.some((badge) => badge.type === "TEST_PRE_APPROVED" && badge.status === "active")) {
    rows.push({
      icon: "info",
      key: "TEST_PRE_APPROVED",
      meta: "Testing only. Financing has not been verified; expires within 24 hours.",
      tag: "Not verified",
      title: "Test pre-approval",
      tone: "test",
    });
  }

  return (
    <ul className="verification-status-list">
      {rows.map((row) => (
        <li className={`verification-status-row ${row.tone}`} key={row.key}>
          <span aria-hidden="true" className="verification-status-icon">
            <Icon name={row.icon} size={20} />
          </span>
          <span className="verification-status-text">
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
            {row.action ? (
              <a className="text-link" href="#verification-upload">
                {row.action}
                <span className="visually-hidden"> for {row.title.toLowerCase()}</span>
              </a>
            ) : null}
          </span>
          <span className={tagClass[row.tone]}>{row.tag}</span>
        </li>
      ))}
    </ul>
  );
}
