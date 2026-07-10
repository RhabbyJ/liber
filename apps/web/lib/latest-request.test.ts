import { describe, expect, it } from "vitest";
import { LatestRequestGate, runLatestRequest } from "./latest-request";

describe("latest request coordination", () => {
  it("ignores delayed A after fast B commits", async () => {
    const gate = new LatestRequestGate();
    const commits: string[] = [];
    let releaseA!: (value: string) => void;
    const delayedA = new Promise<string>((resolve) => { releaseA = resolve; });
    const requestA = runLatestRequest({ gate, load: () => delayedA, onError: () => undefined, onSuccess: (value) => commits.push(value) });
    const requestB = runLatestRequest({ gate, load: async () => "B", onError: () => undefined, onSuccess: (value) => commits.push(value) });

    expect(await requestB).toBe("applied");
    releaseA("A");
    expect(await requestA).toBe("stale");
    expect(commits).toEqual(["B"]);
  });

  it("applies an empty result and recovers after a current failure", async () => {
    const gate = new LatestRequestGate();
    const states: string[][] = [["old"]];
    expect(await runLatestRequest<string[]>({
      gate,
      load: async () => [],
      onError: () => states.push(["failed"]),
      onSuccess: (value) => states.push(value),
    })).toBe("applied");
    expect(await runLatestRequest<string[]>({
      gate,
      load: async () => { throw new Error("network"); },
      onError: () => states.push(["failed"]),
      onSuccess: (value) => states.push(value),
    })).toBe("failed");
    expect(await runLatestRequest<string[]>({
      gate,
      load: async () => ["recovered"],
      onError: () => states.push(["failed"]),
      onSuccess: (value) => states.push(value),
    })).toBe("applied");
    expect(states).toEqual([["old"], [], ["failed"], ["recovered"]]);
  });

  it("invalidates a stale polygon request on market switch", async () => {
    const gate = new LatestRequestGate();
    const polygons: string[] = [];
    let release!: (value: string) => void;
    const oldMarket = runLatestRequest({
      gate,
      load: () => new Promise<string>((resolve) => { release = resolve; }),
      onError: () => undefined,
      onSuccess: (value) => polygons.push(value),
    });
    gate.invalidate();
    release("old-market-polygon");
    expect(await oldMarket).toBe("stale");
    expect(polygons).toEqual([]);
  });
});
