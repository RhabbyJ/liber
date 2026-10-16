import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { MessagingError } from "./errors";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const MAX_MESSAGING_JSON_BYTES = 16 * 1024;

export function privateMessagingJson(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: PRIVATE_HEADERS, status });
}

export async function parseMessagingJson<T>(request: Request, schema: ZodType<T>) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    throw new MessagingError("INVALID_INPUT", "Messaging requests must use JSON.", 400);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MESSAGING_JSON_BYTES) {
    throw new MessagingError("INVALID_INPUT", "Messaging request is too large.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new MessagingError("INVALID_INPUT", "Messaging request body is required.", 400);

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_MESSAGING_JSON_BYTES) {
        await reader.cancel();
        throw new MessagingError("INVALID_INPUT", "Messaging request is too large.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return schema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof MessagingError || error instanceof ZodError) throw error;
    throw new MessagingError("INVALID_INPUT", "Invalid messaging request.", 400, { cause: error });
  }
}

/** `route` is a fixed label such as "POST /api/conversations/[conversationId]/read", never a URL. */
export type MessagingRouteContext = { route?: string };

export function messagingErrorResponse(error: unknown, context: MessagingRouteContext = {}) {
  const route = context.route ? { route: context.route } : {};
  if (error instanceof MessagingError) {
    console.warn("Messaging request rejected.", { code: error.code, status: error.status, ...route });
    return privateMessagingJson({ error: publicErrorMessage(error), code: error.code }, error.status);
  }
  if (error instanceof ZodError) {
    console.warn("Messaging request rejected.", { code: "INVALID_INPUT", status: 400, ...route });
    return privateMessagingJson({ error: "Invalid messaging request." }, 400);
  }
  console.error("Messaging request failed.", {
    route: context.route ?? "unknown",
    ...describeMessagingFailure(error),
  });
  return privateMessagingJson({ error: "Messaging request failed." }, 500);
}

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

function publicErrorMessage(error: MessagingError) {
  if (error.code === "AUTHENTICATION_REQUIRED") return "Authentication required.";
  if (error.code === "INVALID_INPUT") return "Invalid messaging request.";
  if (error.code === "RATE_LIMITED") return "Message limit reached. Try again later.";
  return "Conversation is unavailable.";
}
