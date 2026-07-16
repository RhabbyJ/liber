export function sameDatabaseTarget(left, right) {
  if (normalizeDatabaseUrl(left) === normalizeDatabaseUrl(right)) return true;

  const leftProject = supabaseProjectRef(left);
  const rightProject = supabaseProjectRef(right);
  return Boolean(leftProject && rightProject && leftProject === rightProject);
}

function normalizeDatabaseUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  return url.toString();
}

export function supabaseProjectRef(value) {
  const url = new URL(value);
  const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  if (direct) return direct.toLowerCase();

  const api = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
  if (api) return api.toLowerCase();

  return decodeURIComponent(url.username)
    .match(/^postgres\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase() ?? null;
}
