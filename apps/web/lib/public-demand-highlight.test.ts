import { describe, expect, it } from "vitest";
import {
  syncPublicDemandPinHighlights,
  type PublicDemandPinHighlightTarget,
} from "./public-demand-highlight";

describe("public demand pin highlighting", () => {
  it("highlights only the matching preview pin and clears it", () => {
    const pins = [pin(0), pin(2), pin(4)];

    syncPublicDemandPinHighlights(pins.map(({ target }) => target), 2);
    expect(pins.map(({ classes }) => classes.has("active"))).toEqual([false, true, false]);

    syncPublicDemandPinHighlights(pins.map(({ target }) => target), null);
    expect(pins.map(({ classes }) => classes.has("active"))).toEqual([false, false, false]);
  });
});

function pin(previewIndex: number) {
  const classes = new Set<string>();
  const target: PublicDemandPinHighlightTarget = {
    element: {
      classList: {
        toggle(className, force) {
          if (force) classes.add(className);
          else classes.delete(className);
          return classes.has(className);
        },
      },
    },
    previewIndex,
  };

  return { classes, target };
}
