import { describe, expect, it, vi } from "vitest";
import { createRefreshCoordinator } from "./refresh-coordinator";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("message refresh coordinator", () => {
  it("coalesces overlapping requests into one trailing refresh", async () => {
    const first = deferred();
    const trailing = deferred();
    const run = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => trailing.promise);
    const coordinator = createRefreshCoordinator(run);

    const active = coordinator.request(false);
    const queued = coordinator.request(false);
    const queuedWithAnnouncement = coordinator.request(true);

    expect(queued).toBe(active);
    expect(queuedWithAnnouncement).toBe(active);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenNthCalledWith(1, false);

    first.resolve();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run).toHaveBeenNthCalledWith(2, true);

    trailing.resolve();
    await active;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not lose a request at the completion microtask boundary", async () => {
    const first = deferred();
    const boundary = deferred();
    const run = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => boundary.promise);
    const coordinator = createRefreshCoordinator(run);

    const active = coordinator.request(false);
    let boundaryRequest: Promise<void> | undefined;
    first.resolve();
    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        boundaryRequest = coordinator.request(true);
        resolve();
      });
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, true);
    boundary.resolve();
    await active;
    await boundaryRequest;
  });
});
