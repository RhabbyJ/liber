import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../lib/redirect";
import { ensureSellerAccessRequested } from "../../../server/access";
import {
  AuthIdentityLinkError,
  persistUserRolesForAuthIdentity,
  resolveAuthIdentity,
} from "../../../server/auth-identity";
import { pathForSignedInAuthIntent } from "../../../server/auth-intent";
import type { AppRole } from "../../../server/authz";
import { createSupabaseServerClient } from "../../../server/supabase";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(url.searchParams.get("next"), "");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return authRedirect(request, "/login?status=auth-error");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return authErrorRedirect(request);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return authErrorRedirect(request);
  } else {
    return authErrorRedirect(request);
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return authErrorRedirect(request);

  const selectedRoles = rolesFromMetadata(data.user.user_metadata?.role);
  const resolution = await resolveAuthIdentity({ email: data.user.email, id: data.user.id });
  if (resolution.kind !== "linked") {
    await supabase.auth.signOut();
    return authRedirect(request, "/login?status=identity-recovery-required");
  }

  let user = resolution.user;
  if (user.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return authRedirect(request, "/login?status=account-unavailable");
  }

  if (user.roles.length === 0 && selectedRoles.length > 0) {
    try {
      user = await persistUserRolesForAuthIdentity({
        authUser: { email: data.user.email, id: data.user.id },
        mode: "initialize",
        name: typeof data.user.user_metadata?.name === "string" ? data.user.user_metadata.name : data.user.email,
        roles: selectedRoles,
      });
    } catch (error) {
      if (error instanceof AuthIdentityLinkError) {
        await supabase.auth.signOut();
        const status = error.code === "inactive" ? "account-unavailable" : "identity-recovery-required";
        return authRedirect(request, `/login?status=${status}`);
      }
      throw error;
    }
  }

  if (user?.roles.includes("SELLER")) {
    await ensureSellerAccessRequested(data.user.id);
  }

  return authRedirect(request, pathForSignedInAuthIntent({ id: data.user.id, roles: user.roles }, { next }));
}

function authErrorRedirect(request: NextRequest) {
  return authRedirect(request, "/login?status=auth-error");
}

function authRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function rolesFromMetadata(value: unknown): AppRole[] {
  if (typeof value !== "string") return [];
  const role = value.toLowerCase();
  if (role === "buyer") return ["BUYER"];
  if (role === "seller") return ["SELLER"];
  if (role === "both" || role === "buyer and seller") return ["BUYER", "SELLER"];
  return [];
}
