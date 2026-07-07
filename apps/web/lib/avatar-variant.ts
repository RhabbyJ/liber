export const boringAvatarVariants = ["beam", "marble", "ring", "bauhaus", "sunset", "pixel"] as const;
export const boringAvatarPalettes = [
  { id: "liber", colors: ["#6f43d6", "#5fbe43", "#1677c8", "#ffffff", "#242326"] },
  { id: "garden", colors: ["#195f52", "#5fbe43", "#d6f0cf", "#f7f9f5", "#24342f"] },
  { id: "coast", colors: ["#1677c8", "#169f8f", "#d8eef7", "#f7f9f5", "#243449"] },
  { id: "orchard", colors: ["#d94f70", "#d89614", "#f7d9df", "#fff7e4", "#3b2730"] },
  { id: "violet", colors: ["#6f43d6", "#9c7af0", "#e7defd", "#f7f9f5", "#2f2447"] },
] as const;

export type BoringAvatarVariant = (typeof boringAvatarVariants)[number];
export type BoringAvatarPaletteId = (typeof boringAvatarPalettes)[number]["id"];

export type AvatarVariantParts = {
  colors: string[];
  name: string;
  palette: BoringAvatarPaletteId;
  salt: number;
  value: string;
  variant: BoringAvatarVariant;
};

const avatarSalts = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const paletteById = new Map(boringAvatarPalettes.map((palette) => [palette.id, palette]));

export function normalizeAvatarVariant(value?: string | null) {
  const parts = value?.split(":");
  if (!parts || parts.length !== 4) return null;

  const [namespace, variant, palette, saltValue] = parts;
  if (namespace !== "boring") return null;
  if (!boringAvatarVariants.includes(variant as BoringAvatarVariant)) return null;
  if (!paletteById.has(palette as BoringAvatarPaletteId)) return null;
  if (!/^\d+$/.test(saltValue)) return null;

  const salt = Number(saltValue);
  if (!Number.isInteger(salt) || salt < 0 || salt > 99) return null;

  return `${namespace}:${variant}:${palette}:${salt}`;
}

export function avatarVariantFromSeed(seed: string) {
  const hash = hashSeed(seed || "buyer");
  const variant = boringAvatarVariants[hash % boringAvatarVariants.length];
  const palette = boringAvatarPalettes[
    Math.floor(hash / boringAvatarVariants.length) % boringAvatarPalettes.length
  ].id;
  const salt = avatarSalts[
    Math.floor(hash / (boringAvatarVariants.length * boringAvatarPalettes.length)) % avatarSalts.length
  ];

  return `boring:${variant}:${palette}:${salt}`;
}

export function resolveAvatarVariant(value: string | null | undefined, seed: string): AvatarVariantParts {
  const normalized = normalizeAvatarVariant(value) ?? avatarVariantFromSeed(seed);
  const [, variant, palette, saltValue] = normalized.split(":") as [
    "boring",
    BoringAvatarVariant,
    BoringAvatarPaletteId,
    string,
  ];
  const salt = Number(saltValue);
  const paletteConfig = paletteById.get(palette) ?? boringAvatarPalettes[0];

  return {
    colors: [...paletteConfig.colors],
    name: `${seed || "buyer"}:${salt}`,
    palette,
    salt,
    value: normalized,
    variant,
  };
}

export function randomAvatarVariant(exclude?: string | null) {
  const normalizedExclude = normalizeAvatarVariant(exclude);
  const options = boringAvatarVariants.flatMap((variant) =>
    boringAvatarPalettes.flatMap((palette) => avatarSalts.map((salt) => `boring:${variant}:${palette.id}:${salt}`)),
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
