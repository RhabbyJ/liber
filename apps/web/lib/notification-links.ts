import type { IconName } from "../components/icon";

export type NotificationTarget = { href: string; label: string };

// Stored ids are cuids or UUIDs; anything else never becomes part of a URL.
const safeId = /^[A-Za-z0-9_-]{1,64}$/;

function id(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && safeId.test(value) ? value : null;
}

function asRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

/**
 * Where a notification leads. Targets are app routes that run their own authorization,
 * so a link never grants access by itself; unknown types fall back to the map.
 */
export function notificationTarget(type: string, rawMetadata: unknown): NotificationTarget {
  const metadata = asRecord(rawMetadata);
  const kind = type.toLowerCase();

  if (kind === "loi_update" || kind === "loi_expired") {
    const negotiationId = id(metadata, "negotiationId");
    return negotiationId ? { href: `/negotiations/${negotiationId}`, label: "Open LOI" } : { href: "/messages", label: "Open messages" };
  }
  if (kind === "invite_received") return { href: "/buyer/invites", label: "View invite" };
  if (kind === "invite_sent") return { href: "/seller/invites", label: "View sent invites" };
  if (kind === "invite_expired") {
    // The seller copy carries the buyer profile; the buyer copy does not.
    return metadata.buyerProfileId === undefined
      ? { href: "/buyer/invites", label: "View invites" }
      : { href: "/seller/invites", label: "View sent invites" };
  }
  if (kind === "document_reviewed") {
    return metadata.documentType === "OWNERSHIP"
      ? { href: "/seller/properties", label: "View properties" }
      : { href: "/buyer/badges", label: "View verification" };
  }
  if (kind === "badge_granted" || kind === "badge_revoked" || kind === "badge_expired") {
    return { href: "/buyer/badges", label: "View verification" };
  }
  if (kind === "seller_access_reviewed") {
    return metadata.sellerAccessStatus === "APPROVED"
      ? { href: "/", label: "Find buyers" }
      : { href: "/seller/properties", label: "View properties" };
  }
  if (kind === "seller_access_preview_enabled") return { href: "/", label: "Find buyers" };
  if (kind === "admin_access_preview_enabled") return { href: "/admin", label: "Open admin" };
  return { href: "/", label: "Open Liber" };
}

export function notificationIcon(type: string): IconName {
  const kind = type.toLowerCase();
  if (kind.startsWith("invite")) return "mail";
  if (kind.startsWith("loi")) return "doc";
  if (kind.startsWith("badge") || kind === "document_reviewed") return "check-shield";
  if (kind.startsWith("seller_access")) return "key";
  if (kind.startsWith("admin")) return "settings";
  if (kind.includes("message")) return "message";
  if (kind.includes("tour")) return "calendar";
  return "bell";
}
