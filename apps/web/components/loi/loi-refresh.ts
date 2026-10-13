export function createLoiRefreshGuard() {
  let generation = 0;

  return {
    invalidate() {
      generation += 1;
    },
    async read<T>(load: () => Promise<T>, apply: (snapshot: T) => void): Promise<boolean> {
      const startedGeneration = generation;
      let snapshot: T;
      try {
        snapshot = await load();
      } catch (error) {
        if (startedGeneration !== generation) return false;
        throw error;
      }
      // A completed mutation makes an earlier read obsolete even when the
      // server produced that response before the mutation committed.
      if (startedGeneration !== generation) return false;
      apply(snapshot);
      return true;
    },
  };
}
