export type MessagingLoiSummary =
  | { available: false }
  | {
      available: true;
      canCreate?: boolean;
      id?: string;
      inviteId?: string;
      status: string | null;
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMessagingLoiSummary(value: unknown): MessagingLoiSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { available: false };
  const source = value as Record<string, unknown>;
  if (source.available !== true) return { available: false };
  if (source.status !== null && (typeof source.status !== "string" || source.status.length === 0)) {
    return { available: false };
  }
  if (source.id !== undefined && (typeof source.id !== "string" || !UUID_PATTERN.test(source.id))) {
    return { available: false };
  }
  if (source.inviteId !== undefined
    && (typeof source.inviteId !== "string"
      || source.inviteId.length === 0
      || source.inviteId.length > 200
      || source.inviteId.trim() !== source.inviteId)) return { available: false };
  if (source.canCreate !== undefined && typeof source.canCreate !== "boolean") {
    return { available: false };
  }
  if (source.id === undefined && source.inviteId === undefined) return { available: false };

  return {
    available: true,
    ...(source.canCreate === undefined ? {} : { canCreate: source.canCreate }),
    ...(source.id === undefined ? {} : { id: source.id }),
    ...(source.inviteId === undefined ? {} : { inviteId: source.inviteId }),
    status: source.status,
  };
}
