import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../../lib/redirect";
import { createSupabaseServerClient } from "../../../../server/supabase";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const next = safeInternalPath(formData.get("next"));
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");

  if (!email || !password) {
    return redirectTo(request, `/login?status=missing-credentials&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo(request, `/login?status=auth-error&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return redirectTo(request, `/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
    }

    return redirectTo(request, `/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  return redirectTo(request, next);
}

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
