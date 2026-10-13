import { afterEach, describe, expect, it, vi } from "vitest";
import {
  highlightSegments,
  readRecentServiceAreas,
  rememberRecentServiceArea,
  serviceAreaOptionText,
} from "./service-area-search-client";
import type { ServiceArea } from "./service-areas";

const base = {
  active: true,
  bbox: [-118.54, 34.25, -118.47, 34.3] as [number, number, number, number],
  center: { lat: 34.27, lng: -118.5 },
  county: "Los Angeles County",
  disclaimer: "",
  geojsonPath: "/api/service-areas/x/geometry",
  isPilot: false,
  marketSlug: "los-angeles",
  source: "la-county",
  sourceVersion: "v2",
  state: "CA",
};

function area(overrides: Partial<ServiceArea>): ServiceArea {
  return { ...base, city: null, label: "", postalCode: null, slug: "x", type: "city", ...overrides } as ServiceArea;
}

describe("service-area suggestion text", () => {
  it("names the kind and parent geography of each canonical area", () => {
    expect(serviceAreaOptionText(area({ city: "Los Angeles", label: "Granada Hills", type: "neighborhood" })))
      .toEqual({ primary: "Granada Hills", secondary: "Neighborhood · Los Angeles, CA" });
    expect(serviceAreaOptionText(area({ label: "Pasadena", type: "city" })))
      .toEqual({ primary: "Pasadena", secondary: "City · Los Angeles County, CA" });
    expect(serviceAreaOptionText(area({ label: "91344", postalCode: "91344", type: "zip" })))
      .toEqual({ primary: "91344", secondary: "ZIP code · Los Angeles County, CA" });
    expect(serviceAreaOptionText(area({ label: "East Los Angeles (Unincorporated)", type: "neighborhood" })))
      .toEqual({ primary: "East Los Angeles", secondary: "Unincorporated area · Los Angeles County, CA" });
    expect(serviceAreaOptionText(area({ county: "Orange", label: "Irvine", type: "city" })).secondary)
      .toBe("City · Orange County, CA");
  });
});

describe("suggestion match highlighting", () => {
  it("emphasizes a word-start match while preserving the original text", () => {
    expect(highlightSegments("Granada Hills", "gran")).toEqual([
      { match: true, text: "Gran" },
      { match: false, text: "ada Hills" },
    ]);
    expect(highlightSegments("Granada Hills", "hills")).toEqual([
      { match: false, text: "Granada " },
      { match: true, text: "Hills" },
    ]);
  });

  it("ignores accents and punctuation when locating the match", () => {
    expect(highlightSegments("La Cañada Flintridge", "la canada")).toEqual([
      { match: true, text: "La Cañada" },
      { match: false, text: " Flintridge" },
    ]);
    expect(highlightSegments("Mt. Washington", "mt wash")).toEqual([
      { match: true, text: "Mt. Wash" },
      { match: false, text: "ington" },
    ]);
  });

  it("leaves typo and alias matches unhighlighted", () => {
    expect(highlightSegments("Granada Hills", "granda")).toEqual([{ match: false, text: "Granada Hills" }]);
    expect(highlightSegments("North Hollywood", "noho")).toEqual([{ match: false, text: "North Hollywood" }]);
    expect(highlightSegments("Granada Hills", "ada")).toEqual([{ match: false, text: "Granada Hills" }]);
  });
});

describe("recent service-area searches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    return store;
  }

  it("keeps the five most recent distinct areas per market", () => {
    const store = stubStorage();
    for (const slug of ["a", "b", "c", "d", "e", "f", "b"]) {
      rememberRecentServiceArea("los-angeles", area({ label: slug.toUpperCase(), slug }));
    }
    expect(readRecentServiceAreas("los-angeles").map((recent) => recent.slug)).toEqual(["b", "f", "e", "d", "c"]);
    expect(readRecentServiceAreas("orange")).toEqual([]);
    expect([...store.keys()]).toEqual(["liber:recent-service-areas:los-angeles"]);
  });

  it("drops malformed stored entries and survives unavailable storage", () => {
    stubStorage({
      "liber:recent-service-areas:los-angeles": JSON.stringify([
        { slug: "../admin", label: "x", type: "city", bbox: [0, 0, 0, 0], center: { lat: 0, lng: 0 } },
        { slug: "ok", label: "OK", type: "zip", bbox: [0, 0, 1, 1], center: { lat: 0, lng: 0 } },
        "junk",
      ]),
    });
    expect(readRecentServiceAreas("los-angeles").map((recent) => recent.slug)).toEqual(["ok"]);

    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readRecentServiceAreas("los-angeles")).toEqual([]);
    expect(() => rememberRecentServiceArea("los-angeles", area({ slug: "x" }))).not.toThrow();
  });
});
