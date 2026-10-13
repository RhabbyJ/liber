export const avatarProvider = "avatarka" as const;
export const avatarTheme = "animals" as const;

export type AvatarVariantParts = {
  seed: string;
  salt: number;
  value: string;
};

const avatarSalts = [
  0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31,
] as const;

export function normalizeAvatarVariant(value?: string | null) {
  const parts = value?.split(":");
  if (!parts || parts.length !== 3) return null;

  const [provider, theme, saltValue] = parts;
  if (provider !== avatarProvider) return null;
  if (theme !== avatarTheme) return null;
  if (!/^\d+$/.test(saltValue)) return null;

  const salt = Number(saltValue);
  if (!Number.isInteger(salt) || salt < 0 || salt > 99) return null;
  if (!avatarSalts.includes(salt as (typeof avatarSalts)[number])) return null;

  return `${provider}:${theme}:${salt}`;
}

export function avatarVariantFromSeed(seed: string) {
  const hash = hashSeed(seed || "buyer");
  const salt = avatarSalts[hash % avatarSalts.length];

  return `${avatarProvider}:${avatarTheme}:${salt}`;
}

export function resolveAvatarVariant(value: string | null | undefined, seed: string): AvatarVariantParts {
  const normalized = normalizeAvatarVariant(value) ?? avatarVariantFromSeed(seed);
  const [, , saltValue] = normalized.split(":") as [typeof avatarProvider, typeof avatarTheme, string];
  const salt = Number(saltValue);

  return {
    seed: `liber:buyer-avatar:${salt}`,
    salt,
    value: normalized,
  };
}

export function avatarVariantOptions() {
  return avatarSalts.map((salt) => `${avatarProvider}:${avatarTheme}:${salt}`);
}

/**
 * Initials avatars reuse the persisted token: its index picks one of the
 * `--avatar-color-N` backgrounds in globals.css, so this count must match them.
 */
export const avatarColorCount = 10;

export function avatarColorIndex(value: string | null | undefined, seed: string) {
  return resolveAvatarVariant(value, seed).salt % avatarColorCount;
}

export function avatarColorOptions() {
  return Array.from({ length: avatarColorCount }, (_, index) => `${avatarProvider}:${avatarTheme}:${avatarSalts[index]}`);
}

const initialPattern = /[\p{L}\p{N}]/u;

/** First letter of the first and last words ("Bluebell Porch" -> "BP"); one letter for a single word. */
export function avatarInitials(name: string | null | undefined) {
  const source = (name ?? "").trim();
  const base = source.includes("@") && !source.includes(" ") ? source.split("@")[0] : source;
  const words = base.split(/[\s._-]+/).filter((word) => initialPattern.test(word));
  const initialOf = (word: string) => Array.from(word).find((character) => initialPattern.test(character)) ?? "";
  if (words.length === 0) return "";
  const first = initialOf(words[0]);
  const last = words.length > 1 ? initialOf(words[words.length - 1]) : "";
  return `${first}${last}`.toLocaleUpperCase("en-US");
}

export function randomAvatarVariant(exclude?: string | null) {
  const normalizedExclude = normalizeAvatarVariant(exclude);
  const options = avatarSalts.map((salt) => `${avatarProvider}:${avatarTheme}:${salt}`);
  let index = randomIndex(options.length);

  if (normalizedExclude && options[index] === normalizedExclude) {
    index = (index + 1) % options.length;
  }

  return options[index];
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomIndex(length: number) {
  if (length <= 1) return 0;

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] % length;
  }

  return Math.floor(Math.random() * length);
}
