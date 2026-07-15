import type { SellerPropertyDTO } from "./marketplace-dtos";

export type SellerInvitePropertyBlockReason = "archived" | "needs-evidence" | "rejected" | "review-pending";

export type SellerInvitePropertyState =
  | { kind: "missing" }
  | { kind: "blocked"; property: SellerPropertyDTO; reason: SellerInvitePropertyBlockReason }
  | { kind: "ready"; property: SellerPropertyDTO; readyProperties: SellerPropertyDTO[] };

export function sellerInvitePropertyState(properties: SellerPropertyDTO[]): SellerInvitePropertyState {
  const readyProperties = properties.filter((property) => property.lifecycleStatus === "READY_FOR_INVITES");
  const readyProperty = readyProperties[0];

  if (readyProperty) {
    return { kind: "ready", property: readyProperty, readyProperties };
  }

  const property = properties.find((item) => item.lifecycleStatus !== "ARCHIVED") ?? properties[0];
  if (!property) return { kind: "missing" };

  if (property.lifecycleStatus === "ARCHIVED") {
    return { kind: "blocked", property, reason: "archived" };
  }

  if (property.lifecycleStatus === "READY_FOR_REVIEW" || property.status === "Ownership pending") {
    return { kind: "blocked", property, reason: "review-pending" };
  }

  if (property.status === "Ownership rejected") {
    return { kind: "blocked", property, reason: "rejected" };
  }

  return { kind: "blocked", property, reason: "needs-evidence" };
}
