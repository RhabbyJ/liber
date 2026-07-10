"use server";

import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { safeInternalPath } from "../lib/redirect";
import { ensureSellerAccessRequested } from "./access";
import {
  appIdentityExistsForEmail,
  AuthIdentityLinkError,
  normalizeIdentityEmail,
  persistUserRolesForAuthIdentity,
} from "./auth-identity";
import { pathForSignedInAuthIntent } from "./auth-intent";
import type { AppRole } from "./authz";
import { createSupabaseAdminClient, createSupabaseServerClient } from "./supabase";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function safeNext(formData: FormData) {
  return safeInternalPath(formData.get("next"));
}

function safeNextValue(formData: FormData) {
  return safeInternalPath(formData.get("next"), "") || null;
}

function selectedRoles(formData: FormData): AppRole[] {
  return selectedRolesFromValue(String(formData.get("role") ?? ""));
}

function selectedRolesFromValue(value: string): AppRole[] {
  const role = value.toLowerCase();

  if (role === "seller") return ["SELLER"];
  if (role === "both" || role === "buyer and seller") return ["BUYER", "SELLER"];
  return ["BUYER"];
}

function nextForRoles(roles: AppRole[]) {
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/properties";
  return "/onboarding/role";
}

export async function loginWithPassword(formData: FormData) {
  const next = safeNext(formData);
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  const password = typeof passwordValue === "string" ? passwordValue.trim() : "";

  if (!email || !password) {
    redirect(`/login?status=missing-credentials&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase Auth is not configured.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (isEmailNotConfirmedError(error.message)) {
      redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
    }

    redirect(`/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const { data: authData, error: userError } = await supabase.auth.getUser();
  if (userError || !authData.user) {
    redirect(`/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const appUser = await prisma.user.findUnique({
    where: { id: authData.user.id },
    select: { email: true, roles: true, status: true },
  });

  if (
    !appUser ||
    appUser.status !== "ACTIVE" ||
    normalizeIdentityEmail(appUser.email) !== normalizeIdentityEmail(authData.user.email)
  ) {
    await supabase.auth.signOut();
    redirect("/login?status=account-unavailable");
  }

  redirect(pathForSignedInAuthIntent({ id: authData.user.id, roles: appUser.roles }, { next }));
}

export async function signupWithPassword(formData: FormData) {
  const supabase = await createSupabaseServerClient();
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

  if (password.length < 12) {
    redirect(signupRedirectPath(formData, "weak-password", email));
  }

  if (await appIdentityExistsForEmail(email)) {
    redirect(existingAccountLoginPath(formData, email, next ?? nextForRoles(roles)));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        name,
        role: signupRoleValue(formData),
      },
    },
  });

  if (error) {
    const status = signupStatusForError(error.message);
    if (status === "account-exists") {
      redirect(existingAccountLoginPath(formData, email, next ?? nextForRoles(roles)));
    }
    if (status === "identity-recovery-required") {
      redirect(identityRecoveryLoginPath(email));
    }
    redirect(signupRedirectPath(formData, status, email));
  }

  const hasRealSignupIdentity = Boolean(data.session || data.user?.identities?.length);

  if (data.user && hasRealSignupIdentity) {
    try {
      await persistUserRolesForAuthIdentity({
        authUser: { email: data.user.email ?? email, id: data.user.id },
        mode: "initialize",
        name,
        roles,
      });
    } catch (error) {
      if (error instanceof AuthIdentityLinkError) {
        await supabase.auth.signOut();
        redirect(identityFailureLoginPath(error, email));
      }
      throw error;
    }
    if (roles.includes("SELLER")) {
      await ensureSellerAccessRequested(data.user.id);
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

    if (data.session) {
      await supabase.auth.refreshSession();
    }

    if (!autoConfirmLocal && !data.session) {
      redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next ?? nextForRoles(roles))}`);
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
  const params = new URLSearchParams({ role: signupRoleValue(formData), status });
  const next = safeNextValue(formData);
  params.set("step", signupStepForStatus(status));
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  return `/signup?${params.toString()}`;
}

function signupStepForStatus(status: string) {
  if (status === "weak-password") return "password";
  if (status === "missing-fields") return "name";
  return "email";
}

function signupRoleValue(formData: FormData) {
  const value = String(formData.get("role") ?? "").toLowerCase();
  if (value === "seller" || value === "both") return value;
  return "buyer";
}

function signupStatusForError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("liber_identity") || value.includes("identity recovery")) {
    return "identity-recovery-required";
  }
  if (value.includes("already") || value.includes("registered") || value.includes("exists")) return "account-exists";
  if (value.includes("rate limit")) return "rate-limited";
  if (value.includes("password")) return "weak-password";
  if (value.includes("email")) return "invalid-email";
  return "signup-error";
}

function existingAccountLoginPath(formData: FormData, email: string, next: string) {
  const params = new URLSearchParams({
    email,
    next,
    status: "account-exists",
  });
  const role = signupRoleValue(formData);
  if (role !== "buyer") params.set("role", role);
  return `/login?${params.toString()}`;
}

function identityRecoveryLoginPath(email: string) {
  const params = new URLSearchParams({ email, status: "identity-recovery-required" });
  return `/login?${params.toString()}`;
}

function identityFailureLoginPath(error: AuthIdentityLinkError, email: string) {
  return error.code === "inactive" ? "/login?status=account-unavailable" : identityRecoveryLoginPath(email);
}

function isEmailNotConfirmedError(message: string) {
  return message.toLowerCase().includes("email not confirmed");
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

export async function chooseRole(formData: FormData) {
  const selected = selectedRoles(formData);
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      let appUser: Awaited<ReturnType<typeof persistUserRolesForAuthIdentity>>;
      try {
        appUser = await persistUserRolesForAuthIdentity({
          authUser: { email: data.user.email, id: data.user.id },
          mode: "merge",
          name:
            typeof data.user.user_metadata?.name === "string"
              ? data.user.user_metadata.name
              : data.user.email,
          roles: selected,
        });
      } catch (error) {
        if (error instanceof AuthIdentityLinkError) {
          await supabase.auth.signOut();
          redirect(identityFailureLoginPath(error, data.user.email ?? ""));
        }
        throw error;
      }
      const roles = appUser.roles;
      if (roles.includes("SELLER")) {
        await ensureSellerAccessRequested(data.user.id);
      }
      await supabase.auth.refreshSession();
      redirect(
        pathForSignedInAuthIntent(
          { id: data.user.id, roles },
          { next: safeNextValue(formData) ?? "", role: signupRoleValue(formData) },
        ),
      );
    }
  }

  redirect("/login?next=/onboarding/role");
}
