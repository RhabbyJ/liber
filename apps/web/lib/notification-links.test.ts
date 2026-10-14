import { describe, expect, it } from "vitest";
import { notificationIcon, notificationTarget } from "./notification-links";

describe("notification targets", () => {
  it.each([
    ["LOI_UPDATE", { negotiationId: "cmneg123" }, "/negotiations/cmneg123", "Open LOI"],
    ["LOI_EXPIRED", { negotiationId: "f2000000-0000-4000-8000-000000000099" }, "/negotiations/f2000000-0000-4000-8000-000000000099", "Open LOI"],
    ["invite_received", { inviteId: "inv1", propertyId: "prop1" }, "/buyer/invites", "View invite"],
    ["invite_sent", { buyerProfileId: "bp1", inviteId: "inv1" }, "/seller/invites", "View sent invites"],
    ["invite_expired", { inviteId: "inv1", propertyId: "prop1" }, "/buyer/invites", "View invites"],
    ["invite_expired", { buyerProfileId: "bp1", inviteId: "inv1" }, "/seller/invites", "View sent invites"],
    ["document_reviewed", { documentType: "PRE_APPROVAL" }, "/buyer/badges", "View verification"],
    ["document_reviewed", { documentType: "OWNERSHIP" }, "/seller/properties", "View properties"],
    ["badge_granted", { badgeType: "PRE_APPROVED" }, "/buyer/badges", "View verification"],
    ["badge_expired", {}, "/buyer/badges", "View verification"],
    ["seller_access_reviewed", { sellerAccessStatus: "APPROVED" }, "/", "Find buyers"],
    ["seller_access_reviewed", { sellerAccessStatus: "SUSPENDED" }, "/seller/properties", "View properties"],
    ["admin_access_preview_enabled", {}, "/admin", "Open admin"],
    ["something_new", {}, "/", "Open Liber"],
  ])("%s with %j opens %s", (type, metadata, href, label) => {
    expect(notificationTarget(type, metadata)).toEqual({ href, label });
  });

  it("never builds a URL from unsafe or missing ids", () => {
    for (const negotiationId of ["../admin", "a/b", "x?y=1", "", 42, null]) {
      expect(notificationTarget("LOI_UPDATE", { negotiationId }).href).toBe("/messages");
    }
    expect(notificationTarget("LOI_UPDATE", null).href).toBe("/messages");
    expect(notificationTarget("LOI_UPDATE", ["not", "an", "object"]).href).toBe("/messages");
  });

  it.each([
    ["invite_received", "mail"],
    ["LOI_UPDATE", "doc"],
    ["badge_revoked", "check-shield"],
    ["document_reviewed", "check-shield"],
    ["seller_access_reviewed", "key"],
    ["admin_access_preview_enabled", "settings"],
    ["unknown", "bell"],
  ])("uses the %s icon %s", (type, icon) => {
    expect(notificationIcon(type)).toBe(icon);
  });
});
