import { NextResponse, type NextRequest } from "next/server";
import { requestUrl } from "../../server/request-origin";
import { createSupabaseServerClient } from "../../server/supabase";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(requestUrl(request, "/login?status=signed-out"));
  response.headers.set("Cache-Control", "no-store");

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.toLowerCase().includes("supabase")) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
