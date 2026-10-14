import { describe, expect, it } from "vitest";
import {
  createServiceAreaSearchIndex,
  normalizeServiceAreaQuery,
  type SearchableServiceArea,
} from "./service-area-search";

type Area = SearchableServiceArea;

function area(slug: string, label: string, type: Area["type"], city: string | null = null, postalCode: string | null = null): Area {
  return { city, label, postalCode, slug, type };
}

const catalog: Array<{ area: Area; terms: string[] }> = [
  { area: area("los-angeles", "Los Angeles", "city"), terms: ["los angeles", "los angeles ca", "city of los angeles", "la"] },
  { area: area("glendale", "Glendale", "city"), terms: ["glendale", "glendale ca", "city of glendale"] },
  { area: area("arcadia", "Arcadia", "city"), terms: ["arcadia", "arcadia ca", "city of arcadia"] },
  {
    area: area("arcadia-unincorporated", "Arcadia (Unincorporated)", "neighborhood"),
    terms: ["arcadia", "arcadia ca", "arcadia unincorporated", "unincorporated arcadia"],
  },
  { area: area("la-canada-flintridge", "La Canada Flintridge", "city"), terms: ["la canada flintridge", "la canada flintridge ca"] },
  {
    area: area("granada-hills", "Granada Hills", "neighborhood", "Los Angeles"),
    terms: ["granada hills", "granada hills ca", "granada hills los angeles", "los angeles granada hills"],
  },
  {
    area: area("sherman-oaks", "Sherman Oaks", "neighborhood", "Los Angeles"),
    terms: ["sherman oaks", "sherman oaks ca", "sherman oaks los angeles", "los angeles sherman oaks"],
  },
  {
    area: area("north-hollywood", "North Hollywood", "neighborhood", "Los Angeles"),
    terms: ["north hollywood", "north hollywood ca", "noho"],
  },
  {
    area: area("northridge", "Northridge", "neighborhood", "Los Angeles"),
    terms: ["northridge", "northridge ca", "northridge 91325", "91324", "91325"],
  },
  { area: area("mt-washington", "Mt. Washington", "neighborhood", "Los Angeles"), terms: ["mt washington", "mt washington ca"] },
  { area: area("silverlake", "Silverlake", "neighborhood", "Los Angeles"), terms: ["silverlake", "silverlake ca"] },
  { area: area("downtown-los-angeles", "Downtown", "neighborhood", "Los Angeles"), terms: ["downtown", "downtown los angeles", "dtla"] },
  { area: area("downtown-long-beach", "Downtown", "neighborhood", "Long Beach"), terms: ["downtown", "downtown long beach"] },
  { area: area("91344", "91344", "zip", null, "91344"), terms: ["91344"] },
  { area: area("91325", "91325", "zip", null, "91325"), terms: ["91325", "northridge"] },
  { area: area("91324", "91324", "zip", null, "91324"), terms: ["91324"] },
  { area: area("unreviewed", "Unreviewed Hills", "neighborhood", "Los Angeles"), terms: [] },
];

const index = createServiceAreaSearchIndex(catalog);
const slugs = (query: string) => index.search(query).suggestions.map((hit) => hit.area.slug);
const resolved = (query: string) => {
  const { resolution } = index.search(query);
  return resolution.status === "resolved" ? resolution.area.slug : resolution.status;
};

describe("service-area search index", () => {
  it("resolves every exact canonical form of a community", () => {
    expect(resolved("Granada Hills")).toBe("granada-hills");
    expect(resolved("granada-hills")).toBe("granada-hills");
    expect(resolved("Granada Hills, CA")).toBe("granada-hills");
    expect(resolved("Granada Hills, California")).toBe("granada-hills");
    expect(resolved("  GRANADA   hills  ")).toBe("granada-hills");
  });

  it("finds communities from any word, partial words, and reordered words", () => {
    expect(slugs("gran")[0]).toBe("granada-hills");
    expect(slugs("hills")).toContain("granada-hills");
    expect(slugs("oaks")).toEqual(["sherman-oaks"]);
    expect(slugs("hills granada")[0]).toBe("granada-hills");
    expect(index.search("hills").suggestions[0]?.match).toBe("word");
  });

  it("suggests the intended area for common typos without auto-selecting it", () => {
    for (const typo of ["granda hills", "granada hils", "grenada hills", "sherman oacks", "nortridge"]) {
      expect(index.search(typo).resolution.status, typo).toBe("none");
    }
    expect(slugs("granda hills")[0]).toBe("granada-hills");
    expect(slugs("grenada hills")[0]).toBe("granada-hills");
    expect(slugs("sherman oacks")[0]).toBe("sherman-oaks");
    expect(slugs("nortridge")[0]).toBe("northridge");
    expect(index.search("granda hills").suggestions[0]?.match).toBe("fuzzy");
  });

  it("only falls back to typo matches when nothing matches as typed", () => {
    const extra = createServiceAreaSearchIndex([
      ...catalog,
      { area: area("santa-monica", "Santa Monica", "city"), terms: ["santa monica"] },
      { area: area("san-marino", "San Marino", "city"), terms: ["san marino"] },
    ]);
    expect(extra.search("santa").suggestions.map((hit) => hit.area.slug)).toEqual(["santa-monica"]);
    expect(extra.search("santa").suggestions.every((hit) => hit.match !== "fuzzy")).toBe(true);
    expect(extra.search("snta monica").suggestions[0]?.area.slug).toBe("santa-monica");
  });

  it("matches spacing and abbreviation variants as suggestions only", () => {
    expect(slugs("silver lake")[0]).toBe("silverlake");
    expect(slugs("shermanoaks")[0]).toBe("sherman-oaks");
    expect(slugs("mount washington")[0]).toBe("mt-washington");
    expect(slugs("n hollywood")[0]).toBe("north-hollywood");
    expect(resolved("mount washington")).toBe("none");
  });

  it("folds accents so La Cañada matches its reviewed ASCII terms", () => {
    expect(normalizeServiceAreaQuery("La Cañada Flintridge")).toBe("la canada flintridge");
    expect(resolved("La Cañada Flintridge")).toBe("la-canada-flintridge");
  });

  it("uses only reviewed aliases for nicknames", () => {
    expect(resolved("NoHo")).toBe("north-hollywood");
    expect(resolved("DTLA")).toBe("downtown-los-angeles");
    expect(resolved("LA")).toBe("los-angeles");
  });

  it("keeps the established exact-tier priority", () => {
    // Slug beats a reviewed ZIP alias carrying the same word.
    expect(resolved("Northridge")).toBe("northridge");
    expect(slugs("Northridge").slice(0, 2)).toEqual(["northridge", "91325"]);
    // Postal code beats a community alias carrying the same ZIP.
    expect(resolved("91325")).toBe("91325");
    expect(resolved("91344-1234")).toBe("91344");
    // A city slug beats the same-name unincorporated community.
    expect(resolved("Arcadia")).toBe("arcadia");
    expect(slugs("Arcadia")).toEqual(["arcadia", "arcadia-unincorporated"]);
  });

  it("asks the person to choose when exact names are shared", () => {
    const { resolution, suggestions } = index.search("Downtown");
    expect(resolution.status).toBe("ambiguous");
    expect(suggestions.map((hit) => hit.area.slug).sort()).toEqual(["downtown-long-beach", "downtown-los-angeles"]);
  });

  it("reports the reviewed alias that matched when it is not the area's own name", () => {
    const hits = index.search("northridge").suggestions;
    expect(hits.find((hit) => hit.area.slug === "91325")?.matchedTerm).toBe("northridge");
    expect(hits.find((hit) => hit.area.slug === "northridge")?.matchedTerm).toBeUndefined();
    expect(index.search("noho").suggestions[0]?.matchedTerm).toBe("noho");
    expect(index.search("granada hills ca").suggestions[0]?.matchedTerm).toBeUndefined();
  });

  it("lists ZIP areas first for ZIP-shaped input", () => {
    expect(slugs("913")).toEqual(["91324", "91325", "91344", "northridge"]);
    expect(resolved("913")).toBe("none");
  });

  it("suggests both the community and ZIP for a combined address-style query", () => {
    const { resolution, suggestions } = index.search("Granada Hills, CA 91344");
    expect(resolution.status).toBe("none");
    expect(suggestions.map((hit) => hit.area.slug)).toContain("granada-hills");
  });

  it("fails closed for areas without reviewed terms and for broad geography words", () => {
    expect(slugs("unreviewed")).toEqual([]);
    expect(resolved("Unreviewed Hills")).toBe("none");
    expect(resolved("CA")).toBe("none");
    expect(resolved("Los Angeles County")).toBe("none");
    expect(index.search("").suggestions).toEqual([]);
    expect(index.search("   ").resolution.status).toBe("none");
  });

  it("bounds the number of suggestions", () => {
    expect(index.search("a", 3).suggestions).toHaveLength(3);
    expect(index.search("a", 100).suggestions.length).toBeLessThanOrEqual(8);
  });
});
