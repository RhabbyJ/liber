import { createHash } from "node:crypto";
import { publicNamePreview } from "../lib/public-identity";

// The account UUID is random and immutable. Hash it so public labels never expose it.
export function publicIdentityCode(userId: string) {
  return createHash("sha256").update(`liber:public-identity:${userId}`).digest("hex").slice(0, 12).toUpperCase();
}

export function publicNameForDisplay(name: string | null | undefined, userId: string) {
  return `${publicNamePreview(name ?? "") ?? "Member"} #${publicIdentityCode(userId)}`;
}
