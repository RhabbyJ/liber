export async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, attempts = 2) {
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === attempts) return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
  }
  if (response) return response;
  throw lastError instanceof Error ? lastError : new Error("External request failed.");
}
