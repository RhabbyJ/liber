"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeInternalPath } from "../lib/redirect";
import { ensureSellerAccessRequested } from "./access";
import {
  AuthIdentityLinkError,
  persistUserRolesForAuthIdentity,
  signupStatusForAuthFailure,
} from "./auth-identity";
import { enforceSharedAuthRateLimit } from "./auth-rate-limit";
import type { AppRole } from "./authz";
import { clientIpFromHeaders } from "./rate-limit";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function safeNextValue(formData: FormData) {
  return safeInternalPath(formData.get("next"), "") || null;
}

function selectedRoles(formData: FormData): AppRole[] {
  const role = signupRoleValue(formData);
  if (!role) return [];
  return selectedRolesFromValue(role);
}

function selectedRolesFromValue(value: string): AppRole[] {
  const role = value.toLowerCase();

  if (role === "seller") return ["SELLER"];
  if (role === "both") return ["BUYER", "SELLER"];
  return ["BUYER"];
}

function nextForRoles(roles: AppRole[]) {
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/properties";
  return "/";
}

export async function signupWithPassword(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const signupRole = signupRoleValue(formData);
  const roles = selectedRoles(formData);
  const name = textValue(formData, "name");
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");
  const next = safeNextValue(formData);
  const redirectTo = await authCallbackUrl(next ?? nextForRoles(roles));

  if (!supabase) {
    redirect(signupRedirectPath(formData, "auth-error", email));
  }

  if (!name || !email || !password) {
    redirect(signupRedirectPath(formData, "missing-fields", email));
  }

  if (!signupRole || roles.length === 0) {
    redirect(signupRedirectPath(formData, "invalid-role", email));
  }

  if (password.length < 12) {
    redirect(signupRedirectPath(formData, "weak-password", email));
  }

  const requestHeaders = await headers();
  const signupLimit = await enforceSharedAuthRateLimit({
    action: "signup",
    email,
    ip: clientIpFromHeaders(requestHeaders),
  });
  if (!signupLimit.allowed) {
    redirect(signupRedirectPath(formData, "rate-limited", email));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        name,
        role: signupRole,
      },
    },
  });

  if (error) {
    const status = await signupStatusForAuthFailure(error, email);
    if (status === "account-exists") {
      redirect(existingAccountLoginPath(formData, email, next ?? nextForRoles(roles)));
    }
    if (status === "identity-recovery-required") {
      const recoveryLimit = await enforceSharedAuthRateLimit({
        action: "recovery",
        email,
        ip: clientIpFromHeaders(requestHeaders),
      });
      if (!recoveryLimit.allowed) {
        redirect(signupRedirectPath(formData, "rate-limited", email));
      }
      redirect(identityRecoveryLoginPath(email));
    }
    redirect(signupRedirectPath(formData, status, email));
  }

  const hasRealSignupIdentity = Boolean(data.session || data.user?.identities?.length);

  if (data.user && hasRealSignupIdentity) {
    let appUser: Awaited<ReturnType<typeof persistUserRolesForAuthIdentity>>;
    try {
      appUser = await persistUserRolesForAuthIdentity({
        authUser: data.user,
        name,
        roles,
      });
    } catch (error) {
      if (error instanceof AuthIdentityLinkError) {
        await supabase.auth.signOut();
        redirect(await identityFailureLoginPath(
          error,
          email,
          clientIpFromHeaders(requestHeaders),
        ));
      }
      throw error;
    }

    const autoConfirmLocal = shouldAutoConfirmLocalSignup();

    if (autoConfirmLocal) {
      const admin = createSupabaseAdminClient();
      if (!admin) throw new Error("Supabase admin client is required for local auto-confirm.");

      const { error: confirmError } = await admin.auth.admin.updateUserById(data.user.id, {
        email_confirm: true,
      });
      if (confirmError) throw new Error(confirmError.message);

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error(signInError.message);
    }

    if (!autoConfirmLocal && !data.session) {
      redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next ?? nextForRoles(roles))}`);
    }

    const { data: verifiedAuth, error: verifiedAuthError } = await supabase.auth.getUser();
    if (verifiedAuthError || !verifiedAuth.user) {
      await supabase.auth.signOut();
      redirect(signupRedirectPath(formData, "auth-error", email));
    }

    if (appUser.roles.includes("SELLER")) {
      await ensureSellerAccessRequested(verifiedAuth.user.id);
    }
  }

  if (!hasRealSignupIdentity) {
    redirect(existingAccountLoginPath(formData, email, next ?? nextForRoles(roles)));
  }

  redirect(next ?? nextForRoles(roles));
}

export async function resendSignupConfirmation(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const email = requiredText(formData, "email");
  const next = safeNextValue(formData);
  const redirectTo = await authCallbackUrl(next ?? "/");

  if (!supabase) {
    throw new Error("Supabase Auth is not configured.");
  }

  const resendLimit = await enforceSharedAuthRateLimit({
    action: "resend",
    email,
    ip: clientIpFromHeaders(await headers()),
  });
  if (!resendLimit.allowed) {
    redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next ?? "/")}&status=rate-limited`);
  }

  const { error } = await supabase.auth.resend({
    email,
    options: { emailRedirectTo: redirectTo },
    type: "signup",
  });

  if (error) throw new Error(error.message);
  redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next ?? "/")}&resent=1`);
}

function shouldAutoConfirmLocalSignup() {
  return process.env.NODE_ENV !== "production" && process.env.LIBER_AUTO_CONFIRM_SIGNUPS === "true";
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function signupRedirectPath(formData: FormData, status: string, email: string) {
  const params = new URLSearchParams({ status });
  const role = signupRoleValue(formData);
  if (role) params.set("role", role);
  const next = safeNextValue(formData);
  params.set("step", signupStepForStatus(status));
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  return `/signup?${params.toString()}`;
}

function signupStepForStatus(status: string) {
  if (status === "invalid-role") return "role";
  if (status === "weak-password") return "password";
  if (status === "missing-fields") return "name";
  return "email";
}

function signupRoleValue(formData: FormData) {
  const value = String(formData.get("role") ?? "").toLowerCase();
  if (value === "buyer" || value === "seller" || value === "both") return value;
  return null;
}

function existingAccountLoginPath(formData: FormData, email: string, next: string) {
  const params = new URLSearchParams({
    email,
    next,
    status: "account-exists",
  });
  const role = signupRoleValue(formData);
  if (role && role !== "buyer") params.set("role", role);
  return `/login?${params.toString()}`;
}

function identityRecoveryLoginPath(email: string) {
  const params = new URLSearchParams({ email, status: "identity-recovery-required" });
  return `/login?${params.toString()}`;
}

async function identityFailureLoginPath(
  error: AuthIdentityLinkError,
  email: string,
  ip: string,
) {
  if (error.code === "inactive") return "/login?status=account-unavailable";
  const recoveryLimit = await enforceSharedAuthRateLimit({
    action: "recovery",
    email,
    ip,
  });
  return recoveryLimit.allowed
    ? identityRecoveryLoginPath(email)
    : "/login?status=rate-limited";
}

async function authCallbackUrl(next: string) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "http://localhost:3000";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}
