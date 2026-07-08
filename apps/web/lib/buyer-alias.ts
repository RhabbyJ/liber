export const buyerAliases = [
  "Sunny Porch",
  "Maple Haven",
  "Cedar Key",
  "Willow Nest",
  "Oak Terrace",
  "Bright Hearth",
  "Juniper Door",
  "Stone Garden",
  "Quiet Courtyard",
  "Silver Lantern",
  "Elm Harbor",
  "Aspen Porch",
  "Laurel Gate",
  "Meadow Key",
  "River Haven",
  "Pine Courtyard",
  "Birch Terrace",
  "Clover Door",
  "Sage Hearth",
  "Dawn Garden",
  "Harbor Lantern",
  "Canyon Porch",
  "Fern Haven",
  "Granite Key",
  "Moss Terrace",
  "Clear Garden",
  "Morning Door",
  "Still Harbor",
  "Redwood Path",
  "Cypress Haven",
  "Bluebell Porch",
  "Cedar Grove",
  "Willow Gate",
  "Maple Lantern",
  "Oak Garden",
  "Quiet Porch",
  "Sunny Courtyard",
  "Bright Terrace",
  "Juniper Haven",
  "Stone Door",
  "Silver Garden",
  "Meadow Porch",
  "Sage Lantern",
  "Birch Key",
  "Aspen Door",
  "Laurel Hearth",
  "River Garden",
  "Pine Haven",
] as const;

const aliasLookup = new Map(buyerAliases.map((alias) => [alias.toLowerCase(), alias]));

export function normalizeBuyerAlias(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return aliasLookup.get(normalized.toLowerCase()) ?? null;
}

export function buyerAliasFromSeed(seed: string) {
  const hash = hashSeed(seed || "buyer");
  return buyerAliases[hash % buyerAliases.length];
}

export function buyerAliasForDisplay(value: string | null | undefined, seed: string) {
  return normalizeBuyerAlias(value) ?? buyerAliasFromSeed(seed);
}

export function randomBuyerAlias(exclude?: string | null) {
  const normalizedExclude = normalizeBuyerAlias(exclude);
  let index = randomIndex(buyerAliases.length);

  if (normalizedExclude && buyerAliases[index] === normalizedExclude) {
    index = (index + 1) % buyerAliases.length;
  }

  return buyerAliases[index];
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
