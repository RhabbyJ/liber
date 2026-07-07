export const boringAvatarVariants = ["beam", "marble", "ring", "bauhaus", "sunset", "pixel"] as const;

export type BoringAvatarVariant = (typeof boringAvatarVariants)[number];

export type AvatarVariantParts = {
  name: string;
  salt: number;
  value: string;
  variant: BoringAvatarVariant;
};

const avatarSalts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export function normalizeAvatarVariant(value?: string | null) {
  const parts = value?.split(":");
  if (!parts || parts.length !== 3) return null;

  const [namespace, variant, saltValue] = parts;
  if (namespace !== "boring") return null;
  if (!boringAvatarVariants.includes(variant as BoringAvatarVariant)) return null;
  if (!/^\d+$/.test(saltValue)) return null;

  const salt = Number(saltValue);
  if (!Number.isInteger(salt) || salt < 0 || salt > 99) return null;

  return `${namespace}:${variant}:${salt}`;
}

export function avatarVariantFromSeed(seed: string) {
  const hash = hashSeed(seed || "buyer");
  const variant = boringAvatarVariants[hash % boringAvatarVariants.length];
  const salt = avatarSalts[Math.floor(hash / boringAvatarVariants.length) % avatarSalts.length];

  return `boring:${variant}:${salt}`;
}

export function resolveAvatarVariant(value: string | null | undefined, seed: string): AvatarVariantParts {
  const normalized = normalizeAvatarVariant(value) ?? avatarVariantFromSeed(seed);
  const [, variant, saltValue] = normalized.split(":") as [
    "boring",
    BoringAvatarVariant,
    string,
  ];
  const salt = Number(saltValue);

  return {
    name: `${seed || "buyer"}:${salt}`,
    salt,
    value: normalized,
    variant,
  };
}

export function randomAvatarVariant(exclude?: string | null) {
  const normalizedExclude = normalizeAvatarVariant(exclude);
  const options = boringAvatarVariants.flatMap((variant) => avatarSalts.map((salt) => `boring:${variant}:${salt}`));
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
