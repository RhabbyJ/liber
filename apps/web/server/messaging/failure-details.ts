// Log-safe descriptions of unexpected messaging failures.

const MAX_LOGGED_MESSAGE_LENGTH = 200;
const PRISMA_ERROR_CODE = /^P\d{4}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const ERROR_CLASS = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$.]{0,62}$/;
const VALUE_POSITION = /(?::|=|\bvalue)\s*$/i;

/**
 * Log-safe facts about an unexpected failure: the error class, the Prisma and
 * PostgreSQL (SQLSTATE) codes when present, and a sanitized first message line.
 * Prisma validation errors print query arguments (message bodies included)
 * after their first line, so nothing past it is ever logged.
 */
export function describeMessagingFailure(error: unknown) {
  const record = isRecord(error) ? error : {};
  const meta = isRecord(record.meta) ? record.meta : {};
  // Driver-adapter failures carry the PostgreSQL SQLSTATE on cause.originalCode,
  // wrapped in meta.driverAdapterError once Prisma maps them.
  const adapterError = isRecord(meta.driverAdapterError) ? meta.driverAdapterError : record;
  const adapterCause = isRecord(adapterError.cause) ? adapterError.cause : {};
  const errorClass = typeof record.name === "string" && ERROR_CLASS.test(record.name)
    ? record.name
    : error instanceof Error ? "Error" : "UnknownError";
  // Prisma codes (P2010) also fit the SQLSTATE shape; only Prisma errors carry them.
  const isPrismaError = errorClass.startsWith("PrismaClient");
  const prismaCode = isPrismaError
    ? [record.code, record.errorCode].find((code): code is string => typeof code === "string" && PRISMA_ERROR_CODE.test(code))
    : undefined;
  const sqlState = [adapterCause.originalCode, meta.code, isPrismaError ? undefined : record.code]
    .find((code): code is string => typeof code === "string" && SQLSTATE.test(code));
  return {
    errorClass,
    ...(prismaCode ? { prismaCode } : {}),
    ...(sqlState ? { sqlState } : {}),
    message: error instanceof Error ? sanitizeErrorMessage(error.message) : "",
  };
}

/**
 * First non-empty line only, with emails, UUIDs and long digit runs replaced and
 * quoted text kept only when it is a SQL identifier outside a value position
 * (relation, column and constraint names survive; `type uuid: "..."` does not).
 */
export function sanitizeErrorMessage(message: string) {
  const firstLine = message.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const redacted = firstLine
    .replace(/[^\s@"'`]+@[^\s@"'`]+\.[^\s@"'`]+/g, "[email]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[uuid]")
    .replace(/"([^"]*)"|'([^']*)'/g, (quoted: string, double: string | undefined, single: string | undefined, offset: number, line: string) => {
      const value = double ?? single ?? "";
      return SQL_IDENTIFIER.test(value) && !VALUE_POSITION.test(line.slice(0, offset)) ? quoted : '"[redacted]"';
    })
    .replace(/\d{7,}/g, "[number]");
  return redacted.length > MAX_LOGGED_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_LOGGED_MESSAGE_LENGTH - 1)}…`
    : redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
