const noSupabaseOrigins = Object.freeze({
  supabaseHttpOrigin: "",
  supabaseRealtimeOrigin: "",
});

export function supabaseOrigins(value) {
  if (typeof value !== "string" || !value.trim()) return noSupabaseOrigins;
  try {
    const httpUrl = new URL(value);
    if (
      (httpUrl.protocol !== "https:" && httpUrl.protocol !== "http:")
      || httpUrl.username
      || httpUrl.password
    ) return noSupabaseOrigins;
    const realtimeUrl = new URL(httpUrl);
    realtimeUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
    return {
      supabaseHttpOrigin: httpUrl.origin,
      supabaseRealtimeOrigin: realtimeUrl.origin,
    };
  } catch {
    return noSupabaseOrigins;
  }
}
