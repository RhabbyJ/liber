export const avatarShapes = ["dog", "cat", "house", "key", "leaf", "star"] as const;
export const avatarColorOptions = [
  { id: "purple", hex: "#6f43d6" },
  { id: "green", hex: "#5fbe43" },
  { id: "blue", hex: "#1677c8" },
  { id: "teal", hex: "#169f8f" },
  { id: "rose", hex: "#d94f70" },
  { id: "gold", hex: "#d89614" },
] as const;

export type AvatarShape = (typeof avatarShapes)[number];
export type AvatarColorId = (typeof avatarColorOptions)[number]["id"];

export type AvatarVariantParts = {
  color: AvatarColorId;
  colorHex: string;
  salt: number;
  shape: AvatarShape;
  value: string;
};

const avatarSalts = [0, 1, 2, 3] as const;
const colorById = new Map(avatarColorOptions.map((color) => [color.id, color.hex]));

export function normalizeAvatarVariant(value?: string | null) {
  const parts = value?.split(":");
  if (!parts || parts.length !== 3) return null;

  const [shape, color, saltValue] = parts;
  if (!avatarShapes.includes(shape as AvatarShape)) return null;
  if (!colorById.has(color as AvatarColorId)) return null;
  if (!/^\d+$/.test(saltValue)) return null;

  const salt = Number(saltValue);
  if (!Number.isInteger(salt) || salt < 0 || salt > 99) return null;

  return `${shape}:${color}:${salt}`;
}

export function avatarVariantFromSeed(seed: string) {
  const hash = hashSeed(seed || "buyer");
  const shape = avatarShapes[hash % avatarShapes.length];
  const color = avatarColorOptions[Math.floor(hash / avatarShapes.length) % avatarColorOptions.length].id;
  const salt = avatarSalts[Math.floor(hash / (avatarShapes.length * avatarColorOptions.length)) % avatarSalts.length];

  return `${shape}:${color}:${salt}`;
}

export function resolveAvatarVariant(value: string | null | undefined, seed: string): AvatarVariantParts {
  const normalized = normalizeAvatarVariant(value) ?? avatarVariantFromSeed(seed);
  const [shape, color, saltValue] = normalized.split(":") as [AvatarShape, AvatarColorId, string];

  return {
    color,
    colorHex: colorById.get(color) ?? avatarColorOptions[0].hex,
    salt: Number(saltValue),
    shape,
    value: normalized,
  };
}

export function randomAvatarVariant(exclude?: string | null) {
  const normalizedExclude = normalizeAvatarVariant(exclude);
  const options = avatarShapes.flatMap((shape) =>
    avatarColorOptions.flatMap((color) => avatarSalts.map((salt) => `${shape}:${color.id}:${salt}`)),
  );
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
