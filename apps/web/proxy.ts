import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./config/content-security-policy.mjs";
import { requiresAuthenticatedUser } from "./server/route-access";

export async function proxy(request: NextRequest) {
  // API handlers perform their own authorization. Avoid a duplicate Auth call,
  // cookie refresh, and personalized response on cacheable public geography APIs.
  if (request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({ nonce, production: process.env.NODE_ENV === "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
  // Override client-supplied values before Next.js derives the nonce for rendering.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const { response, isAuthenticated } = await sessionUserFromRequest(request);

  if (requiresAuthenticatedUser(request.nextUrl.pathname) && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return securePageResponse(redirect, csp);
  }

  return securePageResponse(response, csp);
}

function securePageResponse(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  // HTML and its nonce must never be shared across users or requests.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function sessionUserFromRequest(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });

  if (supabaseUrl && publishableKey) {
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data, error } = await supabase.auth.getUser();
    return { response, isAuthenticated: !error && Boolean(data.user) };
  }

  return {
    response,
    isAuthenticated: false,
  };
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
