// Each word starts with a letter; combining marks may follow letters only and are
// capped so a public name cannot render as stacked "zalgo" text.
const signupNamePart = /^\p{L}\p{M}{0,4}(?:\p{L}\p{M}{0,4}|['’.-])*$/u;
const generationalSuffix = /^(?:jr|sr|ii|iii|iv)\.?$/iu;
// Firefox 111-124 are inside Next.js's supported range but lack Intl.Segmenter.
const graphemes = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

export function normalizeSignupName(value: string): string | null {
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  const parts = normalized.split(" ");
  if (normalized.length > 160 || parts.length < 2) return null;
  return parts.every((part) => signupNamePart.test(part)) ? normalized : null;
}

function firstLetter(value: string) {
  if (!graphemes) return Array.from(value)[0] ?? "";
  for (const { segment } of graphemes.segment(value)) return segment;
  return "";
}

export function publicNamePreview(value: string): string | null {
  const name = normalizeSignupName(value);
  if (!name) return null;
  const parts = name.split(" ");
  // "John Smith Jr." is John S., not John J.
  const surname = parts.length > 2 && generationalSuffix.test(parts.at(-1)!) ? parts.at(-2)! : parts.at(-1)!;
  return `${parts[0]} ${firstLetter(surname)}.`;
}

/** One uppercase grapheme for the first and last words of a public label. */
export function publicIdentityInitialLetters(value?: string | null): string[] {
  const parts = (value ?? "").split(" #")[0].trim().split(/\s+/u).filter(Boolean);
  const words = parts.length > 1 ? [parts[0], parts.at(-1)!] : parts;
  // Locale-free casing keeps server HTML and client hydration identical (for example, Turkish "i").
  return words.map((word) => firstLetter(word).toUpperCase());
}

export function publicIdentityInitials(value?: string | null) {
  return publicIdentityInitialLetters(value).join("") || "?";
}

export function normalizePublicIdentityLabel(value?: string | null) {
  const match = value?.match(/^(.+) #([A-F0-9]{12})$/u);
  if (!match || (match[1] !== "Member" && publicNamePreview(match[1]) !== match[1])) return null;
  return value!;
}
