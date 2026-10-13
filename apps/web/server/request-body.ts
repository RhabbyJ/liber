export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 415) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = mediaType(request);
  if (type !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(type)) {
    throw new RequestBodyError("Request must use JSON.", 415);
  }
  const text = await readBoundedText(request, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("Invalid request body.", 400);
  }
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const type = mediaType(request);
  if (type !== "application/x-www-form-urlencoded" && type !== "multipart/form-data") {
    throw new RequestBodyError("Request must use form data.", 415);
  }
  const text = await readBoundedText(request, maxBytes);
  try {
    const form = await new Response(text, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    if ([...form.values()].some((value) => typeof value !== "string")) {
      throw new RequestBodyError("File fields are not supported.", 400);
    }
    return form;
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Invalid request body.", 400);
  }
}

async function readBoundedText(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new RequestBodyError("Request body is too large or invalid.", /^\d+$/.test(declared) ? 413 : 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("Request body is required.", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new RequestBodyError("Request body is too large.", 413);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Invalid request body.", 400);
  } finally {
    reader.releaseLock();
  }
}

function mediaType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
