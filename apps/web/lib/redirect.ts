// Parse base for validation only; it never appears in a returned path.
const PARSE_ORIGIN = "https://internal.invalid";

/**
 * Returns `value` as a same-origin path ("/path?query#hash"), or `fallback`.
 *
 * The result is the URL parser's own serialization, so the path that was
 * checked is exactly the path a browser or `new URL(path, origin)` follows,
 * and feeding a result back in returns it unchanged.
 */
export function safeInternalPath(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !isSafePathText(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PARSE_ORIGIN);
  } catch {
    return fallback;
  }
  // Dot segments can still collapse into "//evil.example", so the serialized
  // result is checked as well as the input.
  const path = `${url.pathname}${url.search}${url.hash}`;
  return url.origin === PARSE_ORIGIN && isSafePathText(path) ? path : fallback;
}

// `next` travels inside other query strings and is decoded again on the next
// hop, so its percent-decoded form ("/%09/evil.example") must be plain too.
function isSafePathText(value: string) {
  if (!isPlainInternalPath(value)) return false;
  try {
    return isPlainInternalPath(decodeURIComponent(value));
  } catch {
    return false;
  }
}

function isPlainInternalPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (hasUrlParserRewrittenCharacter(value) || value.includes("://")) return false;
  return !value.split(/[/?#]/).some((part) => part === "..");
}

// URL parsing deletes tab, LF, and CR anywhere ("/\t/evil.example" parses as
// "//evil.example"), trims other C0 controls, and reads "\" as "/".
function hasUrlParserRewrittenCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || character === "\\") return true;
  }
  return false;
}
