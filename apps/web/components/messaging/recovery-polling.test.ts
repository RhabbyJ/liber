import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecoveryPolling, MESSAGING_CONNECTED_POLL_MS, MESSAGING_FALLBACK_POLL_MS } from "./recovery-polling";

describe("messaging recovery polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses slower recovery with healthy realtime and fast fallback after disconnect", async () => {
    let connected = true;
    const refresh = vi.fn(async () => true);
    const poll = createRecoveryPolling({
      canRefresh: () => true,
      intervalMs: () => connected ? MESSAGING_CONNECTED_POLL_MS : MESSAGING_FALLBACK_POLL_MS,
      refresh,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    connected = false;
    poll.recover();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(5);
    poll.dispose();
  });

  it("backs off failures up to a minute and restores the normal cadence on success", async () => {
    const refresh = vi.fn(async () => false);
    const poll = createRecoveryPolling({ canRefresh: () => true, intervalMs: () => 5_000, refresh });
    await vi.advanceTimersByTimeAsync(5_000 + 10_000 + 20_000 + 40_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(refresh).toHaveBeenCalledTimes(4);
    refresh.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(refresh).toHaveBeenCalledTimes(6);
    poll.dispose();
  });

  it("suspends network requests while hidden or offline and catches up on recovery", async () => {
    let active = false;
    const refresh = vi.fn(async () => true);
    const poll = createRecoveryPolling({ canRefresh: () => active, intervalMs: () => 5_000, refresh });
    poll.recover();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    active = true;
    poll.recover();
    expect(refresh).toHaveBeenCalledOnce();
    poll.dispose();
  });

  it("never stacks timer or focus requests behind a slow in-flight refresh", async () => {
    let finish!: (success: boolean) => void;
    const refresh = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const poll = createRecoveryPolling({ canRefresh: () => true, intervalMs: () => 5_000, refresh });
    poll.recover();
    poll.recover();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledOnce();
    finish(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    poll.dispose();
    finish(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("jitters each interval to spread simultaneous clients", async () => {
    vi.mocked(Math.random).mockReturnValue(0.5);
    const refresh = vi.fn(async () => true);
    const poll = createRecoveryPolling({ canRefresh: () => true, intervalMs: () => 5_000, refresh });
    await vi.advanceTimersByTimeAsync(5_499);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
    poll.dispose();
  });
});
