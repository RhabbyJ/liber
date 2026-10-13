export const MESSAGING_FALLBACK_POLL_MS = 5_000;
export const MESSAGING_CONNECTED_POLL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60_000;

export function createRecoveryPolling({
  canRefresh,
  intervalMs,
  refresh,
}: {
  canRefresh: () => boolean;
  intervalMs: () => number;
  refresh: () => Promise<boolean>;
}) {
  let disposed = false;
  let inFlight = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (disposed) return;
    clearTimeout(timer);
    const base = Math.min(MAX_RETRY_DELAY_MS, intervalMs() * 2 ** failures);
    timer = setTimeout(() => { void run(); }, Math.min(MAX_RETRY_DELAY_MS, base * (1 + Math.random() * 0.2)));
  }

  async function run() {
    if (disposed || inFlight) return;
    if (!canRefresh()) {
      schedule();
      return;
    }
    inFlight = true;
    try {
      failures = await refresh() ? 0 : Math.min(failures + 1, 6);
    } catch {
      failures = Math.min(failures + 1, 6);
    } finally {
      inFlight = false;
      schedule();
    }
  }

  schedule();
  return {
    recover() {
      if (disposed) return;
      failures = 0;
      clearTimeout(timer);
      void run();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
