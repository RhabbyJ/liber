import { LoiError } from "./errors";
import { isControlledPreviewEnvironment } from "../preview-environment";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cohort() {
  if (process.env.LIBER_LOI_V1_ENABLED?.trim().toLowerCase() !== "true") return null;
  const values = (process.env.LIBER_LOI_V1_COHORT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  if (values.length === 1 && values[0] === "*") {
    return isControlledPreviewEnvironment() ? new Set(["*"]) : null;
  }
  const users = new Set(values);
  if (values.length !== 2 || users.size !== 2 || values.some((value) => !value || !UUID.test(value))) {
    return null;
  }
  return users;
}

export function loiV1Configured() {
  return cohort() !== null;
}

export function loiV1EnabledForPair(firstUserId: string, secondUserId: string) {
  const users = cohort();
  if (!users) return false;
  if (users.has("*")) return true;
  return users.has(firstUserId.toLowerCase()) && users.has(secondUserId.toLowerCase());
}

export function assertLoiV1EnabledForPair(firstUserId: string, secondUserId: string) {
  if (!loiV1EnabledForPair(firstUserId, secondUserId)) throw new LoiError("NOT_FOUND", "Negotiation is unavailable.", 404);
}
