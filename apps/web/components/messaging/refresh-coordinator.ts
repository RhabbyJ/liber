export function createRefreshCoordinator(
  run: (announceFailure: boolean) => Promise<void>,
) {
  let active: Promise<void> | null = null;
  let queued = false;
  let queuedFailureAnnouncement = false;

  function request(announceFailure = false): Promise<void> {
    if (active) {
      queued = true;
      queuedFailureAnnouncement ||= announceFailure;
      return active;
    }

    let resolveActive!: () => void;
    let rejectActive!: (reason?: unknown) => void;
    const activePromise = new Promise<void>((resolve, reject) => {
      resolveActive = resolve;
      rejectActive = reject;
    });
    active = activePromise;
    void drain(announceFailure, resolveActive, rejectActive);
    return activePromise;
  }

  async function drain(
    announceFailure: boolean,
    resolveActive: () => void,
    rejectActive: (reason?: unknown) => void,
  ) {
    let nextFailureAnnouncement = announceFailure;
    try {
      while (true) {
        queued = false;
        queuedFailureAnnouncement = false;
        await run(nextFailureAnnouncement);
        if (!queued) {
          active = null;
          resolveActive();
          return;
        }
        nextFailureAnnouncement = queuedFailureAnnouncement;
      }
    } catch (error) {
      active = null;
      rejectActive(error);
    }
  }

  return { request };
}
