import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { LoiError } from "./errors";

const MAX_BYTES = 48 * 1024;
const HEADERS = { "Cache-Control": "private, no-store" } as const;
const TERM_ROOTS = new Set([
  "additionalTerms",
  "costsAndCredits",
  "deposit",
  "funding",
  "hoa",
  "parties",
  "personalProperty",
  "possession",
  "providers",
  "purchasePriceCents",
  "representation",
  "timing",
]);

export function privateLoiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: HEADERS, status });
}

export async function parseLoiJson<T>(request: Request, schema: ZodType<T>) {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json" && !type?.endsWith("+json")) throw new LoiError("INVALID_INPUT", "LOI requests must use JSON.", 400);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new LoiError("INVALID_INPUT", "LOI request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LoiError("INVALID_INPUT", "LOI request body is required.", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw new LoiError("INVALID_INPUT", "LOI request is too large.", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return schema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof LoiError || error instanceof ZodError) throw error;
    throw new LoiError("INVALID_INPUT", "Invalid LOI request.", 400, { cause: error });
  }
}

export function loiErrorResponse(error: unknown) {
  if (error instanceof LoiError) {
    console.warn("LOI request rejected.", { code: error.code, status: error.status });
    const message = error.code === "AUTHENTICATION_REQUIRED" ? "Authentication required."
      : error.code === "INVALID_INPUT" ? "Invalid LOI request."
        : error.code === "RATE_LIMITED" ? "Please wait before trying again."
          : error.code === "CONFLICT" ? "Negotiation changed. Refresh and try again."
            : "Negotiation is unavailable.";
    return privateLoiJson({ code: error.code, error: message }, error.status);
  }
  if (error instanceof ZodError) {
    const fieldErrors = loiFieldErrors(error);
    return privateLoiJson({
      code: "INVALID_INPUT",
      error: Object.keys(fieldErrors).length ? "Review the highlighted LOI fields." : "Invalid LOI request.",
      ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
    }, 400);
  }
  console.error("LOI request failed.", { name: error instanceof Error ? error.name : "UnknownError" });
  return privateLoiJson({ error: "LOI request failed." }, 500);
}

function loiFieldErrors(error: ZodError) {
  const entries: Array<[string, string]> = [];
  for (const issue of error.issues.slice(0, 24)) {
    const termPath = issue.path[0] === "terms" ? issue.path.slice(1) : issue.path;
    if (typeof termPath[0] !== "string" || !TERM_ROOTS.has(termPath[0])) continue;
    const path = termPath.filter((part) => typeof part !== "number").join(".");
    if (!path || entries.some(([existing]) => existing === path)) continue;
    const message = issue.code === "unrecognized_keys"
      ? "Remove unsupported fields."
      : issue.message.trim().slice(0, 180) || "Review this field.";
    entries.push([path, message]);
  }
  return Object.fromEntries(entries);
}
