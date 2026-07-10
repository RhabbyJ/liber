export class LatestRequestGate {
  private version = 0;

  begin() {
    const version = ++this.version;
    return { isCurrent: () => version === this.version };
  }

  invalidate() {
    this.version += 1;
  }
}

export async function runLatestRequest<T>({
  gate,
  load,
  onError,
  onSuccess,
}: {
  gate: LatestRequestGate;
  load: () => Promise<T>;
  onError: (error: unknown) => void;
  onSuccess: (value: T) => void;
}) {
  const ticket = gate.begin();
  try {
    const value = await load();
    if (!ticket.isCurrent()) return "stale" as const;
    onSuccess(value);
    return "applied" as const;
  } catch (error) {
    if (!ticket.isCurrent()) return "stale" as const;
    onError(error);
    return "failed" as const;
  }
}
