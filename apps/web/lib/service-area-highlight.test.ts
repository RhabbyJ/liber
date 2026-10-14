import { describe, expect, it } from "vitest";
import { highlightSegments } from "./service-area-highlight";

const marked = (text: string, query: string) =>
  highlightSegments(text, query).filter((segment) => segment.match).map((segment) => segment.text);

describe("service-area suggestion highlighting", () => {
  it("marks word prefixes anywhere in the name", () => {
    expect(marked("Granada Hills", "gran")).toEqual(["Gran"]);
    expect(marked("Granada Hills", "hills")).toEqual(["Hills"]);
    expect(marked("Granada Hills", "hills gran")).toEqual(["Gran", "Hills"]);
    expect(marked("91344", "913")).toEqual(["913"]);
  });

  it("keeps the original accents and punctuation", () => {
    expect(marked("La Cañada Flintridge", "la cana")).toEqual(["La", "Caña"]);
    expect(highlightSegments("Mt. Washington", "mt").map((segment) => segment.text).join("")).toBe("Mt. Washington");
  });

  it("leaves typo matches unmarked", () => {
    expect(marked("Granada Hills", "granda")).toEqual([]);
    expect(highlightSegments("Granada Hills", "")).toEqual([{ match: false, text: "Granada Hills" }]);
  });
});
