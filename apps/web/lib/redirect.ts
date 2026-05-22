export function safeInternalPath(value: unknown, fallback = "/") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || value.includes("://")) return fallback;
  if (value.split(/[/?#]/).some((part) => part === "..")) return fallback;
  return value;
}
