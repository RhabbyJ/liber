"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null | undefined;

export function getMessagingBrowserClient() {
  if (browserClient !== undefined) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  browserClient = url && publishableKey ? createBrowserClient(url, publishableKey) : null;
  return browserClient;
}

export function logMessagingRealtimeJoinStatus(status: string) {
  if (status === "AUTH_ERROR" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    console.warn("Messaging realtime join failed.", { status });
  }
}
