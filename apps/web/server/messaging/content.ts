import { MessagingError } from "./errors";

const REDACTED_MESSAGE_BODY = "This message was removed by Liber.";

export function visibleMessageBody(body: string, moderationStatus: string) {
  return moderationStatus === "REDACTED" ? REDACTED_MESSAGE_BODY : body;
}

export function normalizeMessageBody(value: string) {
  if (value.includes("\u0000") || hasUnpairedSurrogate(value)) {
    throw new MessagingError("INVALID_INPUT", "Message contains invalid text.", 400);
  }

  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  const length = Array.from(normalized).length;
  if (length < 1 || length > 2_000) {
    throw new MessagingError("INVALID_INPUT", "Message must contain between 1 and 2,000 characters.", 400);
  }
  return normalized;
}

function hasUnpairedSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}
