"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeInternalPath } from "../lib/redirect";
import { normalizeSignupName } from "../lib/public-identity";
import { ensureSellerAccessRequested } from "./access";
import {
  AuthIdentityLinkError,
  persistUserRolesForAuthIdentity,
  signupStatusForAuthFailure,
} from "./auth-identity";
import { defaultPathForSessionUser } from "./auth-intent";
import { enforceSharedAuthRateLimit } from "./auth-rate-limit";
import type { AppRole } from "./authz";
import { clearPasswordRecovery, hasPasswordRecoveryFor, PASSWORD_RESET_PATH } from "./password-recovery";
import { clientIpFromHeaders } from "./rate-limit";
import { getSessionUser } from "./session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";
import { configuredSiteOrigin } from "./site-origin";
import { isControlledPreviewEnvironment } from "./preview-environment";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 1024;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function safeNextValue(formData: FormData) {
  const next = safeInternalPath(formData.get("next"), "");
  return next.length <= 2048 ? next || null : null;
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
  const name = normalizeSignupName(textValue(formData, "name"));
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

  if (name.length > 160 || email.length > 254 || password.length > MAX_PASSWORD_LENGTH) {
    redirect(signupRedirectPath(formData, "missing-fields", email.length <= 254 ? email : ""));
  }

  if (!signupRole || roles.length === 0) {
    redirect(signupRedirectPath(formData, "invalid-role", email));
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
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
  if (email.length > 254) throw new Error("Enter a valid email address.");
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

/**
 * Emails a password-reset link. Every address that passes the shared limiter gets the same
 * confirmation, whether Supabase sent, skipped (no account), or throttled the email, so the
 * response never reveals which addresses have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = textValue(formData, "email");
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    redirect("/forgot-password?status=invalid-email");
  }

  const limit = await enforceSharedAuthRateLimit({
    action: "reset",
    email,
    ip: clientIpFromHeaders(await headers()),
  });
  if (!limit.allowed) redirect("/forgot-password?status=rate-limited");

  const supabase = await createSupabaseServerClient();
  const origin = configuredSiteOrigin();
  if (!supabase || !origin) redirect("/forgot-password?status=unavailable");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await authCallbackUrl(PASSWORD_RESET_PATH),
  });
  if (error) logAuthFailure("password reset email request failed", error);
  redirect("/forgot-password?status=sent");
}

/** Sets a new password from a verified recovery link (see the Auth callback), then opens the workspace. */
export async function completePasswordReset(formData: FormData) {
  const user = await getSessionUser();
  // The reset page explains an expired or missing recovery link.
  if (!user || !(await hasPasswordRecoveryFor(user.id))) redirect(PASSWORD_RESET_PATH);

  const password = textValue(formData, "password");
  const invalid = newPasswordProblem(password);
  if (invalid) redirect(`${PASSWORD_RESET_PATH}?status=${invalid}`);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(`${PASSWORD_RESET_PATH}?status=error`);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`${PASSWORD_RESET_PATH}?status=${passwordUpdateFailureStatus(error)}`);

  await clearPasswordRecovery();
  await signOutOtherSessions(supabase);
  redirect(defaultPathForSessionUser(user));
}

/** Profile password change: the current password is checked against the login rate limit first. */
export async function changePassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fprofile");
  const email = user.email;
  if (!email) redirect(profilePasswordPath("error"));

  const currentPassword = textValue(formData, "currentPassword");
  const newPassword = textValue(formData, "newPassword");
  if (!currentPassword || currentPassword.length > MAX_PASSWORD_LENGTH) {
    redirect(profilePasswordPath("missing-current"));
  }
  const invalid = newPasswordProblem(newPassword);
  if (invalid) redirect(profilePasswordPath(invalid));

  // Checking the current password is a sign-in attempt, so it spends the login budget.
  const limit = await enforceSharedAuthRateLimit({
    action: "login",
    email,
    ip: clientIpFromHeaders(await headers()),
  });
  if (!limit.allowed) redirect(profilePasswordPath("rate-limited"));

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(profilePasswordPath("error"));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (error) {
    redirect(profilePasswordPath(currentPasswordFailureStatus(error)));
  }
  if (data.user?.id !== user.id) {
    // Never keep a session for a different Auth identity than the one that asked.
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?status=account-unavailable");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) redirect(profilePasswordPath(passwordUpdateFailureStatus(updateError)));

  await signOutOtherSessions(supabase);
  redirect(profilePasswordPath("password-updated"));
}

function newPasswordProblem(password: string) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) return "too-short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too-long";
  return null;
}

function currentPasswordFailureStatus(error: AuthFailure) {
  if (isAuthRateLimit(error)) return "rate-limited";
  if (error.code === "invalid_credentials" || error.status === 400) return "wrong-password";
  logAuthFailure("current password check failed", error);
  return "error";
}

function passwordUpdateFailureStatus(error: AuthFailure) {
  if (error.code === "same_password") return "same-password";
  if (error.code === "weak_password") return "weak-password";
  if (isAuthRateLimit(error)) return "rate-limited";
  logAuthFailure("password update failed", error);
  return "error";
}

type AuthFailure = { code?: string; status?: number };

function isAuthRateLimit(error: AuthFailure) {
  return error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit";
}

// A new password ends every other session, so a stolen session cannot outlive the reset.
async function signOutOtherSessions(supabase: SupabaseServerClient) {
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) logAuthFailure("could not end other sessions after a password change", error);
}

function profilePasswordPath(status: string) {
  return `/profile?status=${status}#password`;
}

// Status and code only: never the email address or the Supabase message text.
function logAuthFailure(message: string, error: AuthFailure) {
  console.error(`[auth] ${message}`, error.status ?? "", error.code ?? "");
}

function shouldAutoConfirmLocalSignup() {
  return process.env.NODE_ENV !== "production"
    && isControlledPreviewEnvironment()
    && process.env.LIBER_AUTO_CONFIRM_SIGNUPS === "true";
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
  const origin = configuredSiteOrigin();
  if (!origin) throw new Error("Authentication callback origin is not configured.");
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}
