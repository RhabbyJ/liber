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

export function messagingErrorResponse(error: unknown) {
  if (error instanceof MessagingError) {
    console.warn("Messaging request rejected.", { code: error.code, status: error.status });
    return privateMessagingJson({ error: publicErrorMessage(error), code: error.code }, error.status);
  }
  if (error instanceof ZodError) {
    console.warn("Messaging request rejected.", { code: "INVALID_INPUT", status: 400 });
    return privateMessagingJson({ error: "Invalid messaging request." }, 400);
  }
  console.error("Messaging request failed.", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return privateMessagingJson({ error: "Messaging request failed." }, 500);
}

function publicErrorMessage(error: MessagingError) {
  if (error.code === "AUTHENTICATION_REQUIRED") return "Authentication required.";
  if (error.code === "INVALID_INPUT") return "Invalid messaging request.";
  if (error.code === "RATE_LIMITED") return "Message limit reached. Try again later.";
  return "Conversation is unavailable.";
}
