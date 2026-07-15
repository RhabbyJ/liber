const avatarProvider = "avatarka" as const;
const avatarTheme = "animals" as const;

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
