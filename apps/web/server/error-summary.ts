// Log-safe error descriptions for server logs and error reports. Database,
// provider, and validation errors can quote user input, so messages are
// redacted and truncated; request data, metadata, and causes are never logged.
// Runtime-neutral: the Edge error reporter uses it too.

export type ErrorSummary = {
  /** Error constructor name, for example PrismaClientKnownRequestError. */
  errorClass: string;
  /** Prisma (P2010) or system (ECONNRESET) code when present. */
  code?: string;
  /** PostgreSQL SQLSTATE (23505) when the error carries one. */
  dbCode?: string;
  message: string;
};

const MAX_MESSAGE_LENGTH = 300;
// Five-character SQLSTATE, excluding Prisma's P1000-P6999 codes (PL/pgSQL uses P0xxx).
const SQLSTATE = /^(?!P[1-9]\d{3}$)[0-9A-Z]{5}$/;

// Order matters: whole URLs (which may embed credentials, private paths, and
// signed tokens) go first, then tokens, addresses, paths, and quoted values.
const REDACTIONS: Array<[RegExp, string]> = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi, "[url]"],
  [/\bBearer\s+\S+/gi, "Bearer [redacted]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]"],
  [/\b(?:sb_(?:secret|publishable)_|re_|sk_|pk_)[\w-]{8,}/g, "[token]"],
  [/\b(api_?key|key|password|secret|sig|signature|token)=[^\s&"'`]+/gi, "$1=[redacted]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]"],
  [/[\w.-]+(?:\/[\w.-]+){2,}/g, "[path]"],
  [/[\w.-]+\/[\w-]+\.[\w]+/g, "[path]"],
  [/\b[\w-]+\.(?:csv|docx?|gif|heic|jpe?g|pdf|png|txt|webp)\b/gi, "[file]"],
  // PostgreSQL quotes rejected input after a colon and in key details.
  [/: "(?:[^"\\]|\\.)*"/g, ': "[value]"'],
  [/=\((?:[^()]|\([^()]*\))*\)/g, "=([value])"],
  [/\b\d{7,}\b/g, "[number]"],
];

const IDENTIFIER_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\w-]{20,})$/i;

/**
 * Route label for logs: a route template as given, or a request's path with
 * identifier segments replaced and the query string dropped.
 */
export function routeLabel(route?: string | { url: string }) {
  if (!route) return "unspecified";
  if (typeof route === "string") return route;
  try {
    return new URL(route.url).pathname
      .split("/")
      .map((segment) => (IDENTIFIER_SEGMENT.test(segment) ? ":id" : segment))
      .join("/");
  } catch {
    return "unspecified";
  }
}

export function redactErrorMessage(message: string) {
  let redacted = message.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted.length > MAX_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : redacted;
}

export function summarizeError(error: unknown): ErrorSummary {
  if (!(error instanceof Error)) {
    return {
      errorClass: error === null ? "null" : typeof error === "object" ? "NonErrorObject" : typeof error,
      message: "A non-Error value was thrown.",
    };
  }
  const errorClass = errorClassName(error);
  const rawCode = stringProperty(error, "code");
  const dbCode = postgresCode(error, rawCode);
  const code = rawCode && rawCode !== dbCode ? rawCode : undefined;
  return {
    errorClass,
    ...(code ? { code } : {}),
    ...(dbCode ? { dbCode } : {}),
    // Validation errors render the rejected query arguments, which hold user input.
    message: errorClass === "PrismaClientValidationError"
      ? "Prisma rejected the query arguments."
      : redactErrorMessage(error.message),
  };
}

function errorClassName(error: Error) {
  const constructorName = error.constructor?.name || "Error";
  const name = typeof error.name === "string" ? error.name : "";
  if (!name || name === "Error" || name === constructorName) return constructorName;
  // For example DOMException/TimeoutError from an aborted fetch.
  return constructorName === "Error" ? name : `${constructorName}/${name}`;
}

function postgresCode(error: Error, rawCode: string | undefined) {
  // Driver adapter errors surface through Prisma as meta.driverAdapterError.cause.
  const meta = objectProperty(error, "meta");
  const adapterCause = objectProperty(objectProperty(meta, "driverAdapterError"), "cause")
    ?? objectProperty(error, "cause");
  const candidate = stringProperty(adapterCause, "originalCode")
    ?? stringProperty(adapterCause, "code")
    ?? stringProperty(meta, "code")
    // node-postgres DatabaseError carries the SQLSTATE as its own code.
    ?? (stringProperty(error, "severity") ? rawCode : undefined);
  return candidate && SQLSTATE.test(candidate) ? candidate : undefined;
}

function objectProperty(value: unknown, key: string): object | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "object" && property !== null ? property : undefined;
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" && property.length > 0 && property.length <= 64 ? property : undefined;
}
