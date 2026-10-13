import { describe, expect, it, vi } from "vitest";
import { createLoiRefreshGuard } from "./loi-refresh";
import { cashTerms, financedTerms, negotiation } from "./loi-test-fixtures.test-helper";
import { initialLoiViewState, reconcileLoiViewState, savedLoiDraftTransition, type LoiWorkspaceViewState } from "./loi-workspace-state";
import type { LoiNegotiation } from "./loi-types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("LOI refreshes across completed mutations", () => {
  it("keeps the saved review when a GET started before PUT completes arrives afterward", async () => {
    const guard = createLoiRefreshGuard();
    const draft = { draftVersion: 1, id: "30000000-0000-4000-8000-000000000001", terms: cashTerms, updatedAt: "2026-09-25T01:00:00.000Z" };
    const beforeSave = negotiation({ draft });
    let canonical = beforeSave;
    let view: LoiWorkspaceViewState = { ...initialLoiViewState(canonical), dirty: true, terms: financedTerms };
    const applySnapshot = vi.fn((next: LoiNegotiation) => {
      view = reconcileLoiViewState(view, canonical, next);
      canonical = next;
    });
    const get = deferred<LoiNegotiation>();
    const put = deferred<typeof draft>();
    const refresh = guard.read(() => get.promise, applySnapshot);
    const save = (async () => {
      const savedDraft = await put.promise;
      guard.invalidate();
      const saved = savedLoiDraftTransition({ basis: beforeSave, current: canonical, draft: savedDraft, mode: "REVIEWING" });
      expect(saved).not.toBeNull();
      canonical = saved!.negotiation;
      view = saved!.view;
    })();

    put.resolve({ ...draft, draftVersion: 2, terms: financedTerms, updatedAt: "2026-09-25T01:00:01.000Z" });
    await save;
    const savedCanonical = canonical;
    get.resolve(beforeSave);

    expect(await refresh).toBe(false);
    expect(applySnapshot).not.toHaveBeenCalled();
    expect(canonical).toBe(savedCanonical);
    expect(view).toMatchObject({ mode: "REVIEWING", dirty: false, draftVersion: 2, terms: financedTerms });

    // The caller retries a skipped read. The fresh snapshot must preserve the
    // review step instead of re-opening the editor with the older terms.
    expect(await guard.read(() => Promise.resolve(savedCanonical), applySnapshot)).toBe(true);
    expect(applySnapshot).toHaveBeenCalledExactlyOnceWith(savedCanonical);
    expect(view).toMatchObject({ mode: "REVIEWING", dirty: false, draftVersion: 2, terms: financedTerms });
  });

  it("skips a read started during a mutation when that mutation completes first", async () => {
    const guard = createLoiRefreshGuard();
    const get = deferred<string>();
    const put = deferred<void>();
    const save = put.promise.then(() => guard.invalidate());
    const apply = vi.fn();
    const refresh = guard.read(() => get.promise, apply);

    put.resolve();
    await save;
    get.resolve("old draft");
    expect(await refresh).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("allows a current read and propagates current failures", async () => {
    const guard = createLoiRefreshGuard();
    const apply = vi.fn();
    expect(await guard.read(() => Promise.resolve("current draft"), apply)).toBe(true);
    expect(apply).toHaveBeenCalledExactlyOnceWith("current draft");
    const failure = new Error("offline");
    await expect(guard.read(() => Promise.reject(failure), apply)).rejects.toBe(failure);
  });

  it("does not announce an obsolete failed read after a successful mutation", async () => {
    const guard = createLoiRefreshGuard();
    const get = deferred<string>();
    const apply = vi.fn();
    const refresh = guard.read(() => get.promise, apply);

    guard.invalidate();
    get.reject(new Error("delayed failed GET"));
    expect(await refresh).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
