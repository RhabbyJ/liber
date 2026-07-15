import { MessagingError } from "./errors";

const enabledValue = "true";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cohortCache: { key: string; value: Set<string> | null } | undefined;

function messagingCohort() {
  const environment = process.env.NODE_ENV ?? "";
  const enabled = process.env.LIBER_MESSAGING_V1_ENABLED?.trim().toLowerCase() ?? "";
  const rawCohort = process.env.LIBER_MESSAGING_V1_COHORT_USER_IDS?.trim();
  const cacheKey = `${environment}\0${enabled}\0${rawCohort ?? ""}`;
  if (cohortCache?.key === cacheKey) return cohortCache.value;

  if (enabled !== enabledValue || !rawCohort) {
    cohortCache = { key: cacheKey, value: null };
    return null;
  }

  const cohort = new Set(
    rawCohort
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value === "*" ? value : value.toLowerCase()),
  );
  if (
    environment === "production"
    && (cohort.size === 0 || cohort.has("*") || [...cohort].some((userId) => !uuidPattern.test(userId)))
  ) {
    cohortCache = { key: cacheKey, value: null };
    return null;
  }
  cohortCache = { key: cacheKey, value: cohort };
  return cohort;
}

export function messagingV1NavigationEnabledForUser(userId: string) {
  const cohort = messagingCohort();
  return Boolean(cohort && (cohort.has("*") || cohort.has(userId.toLowerCase())));
}

export function messagingV1ConversationScopeForUser(userId: string) {
  const cohort = messagingCohort();
  const normalizedUserId = userId.toLowerCase();
  if (!cohort || (!cohort.has("*") && !cohort.has(normalizedUserId))) return null;
  return {
    counterpartyUserIds: cohort.has("*")
      ? null
      : [...cohort].filter((candidate) => candidate !== normalizedUserId && uuidPattern.test(candidate)),
  };
}

export function messagingV1EnabledForPair(firstUserId: string, secondUserId: string) {
  const cohort = messagingCohort();
  return Boolean(cohort && (
    cohort.has("*")
    || (cohort.has(firstUserId.toLowerCase()) && cohort.has(secondUserId.toLowerCase()))
  ));
}

export function assertMessagingV1EnabledForPair(firstUserId: string, secondUserId: string) {
  if (!messagingV1EnabledForPair(firstUserId, secondUserId)) {
    throw new MessagingError("UNAVAILABLE", "Messaging is not available for this conversation.", 404);
  }
}
