"use server";

import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { safeInternalPath } from "../lib/redirect";
import { ensureSellerAccessRequested } from "./access";
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
  const value = String(formData.get("role") ?? "").toLowerCase();

  if (value === "seller") return ["SELLER"];
  if (value === "both" || value === "buyer and seller") return ["BUYER", "SELLER"];
  return ["BUYER"];
}

function nextForRoles(roles: AppRole[]) {
  if (roles.includes("BUYER")) return "/buyer/profile";
  if (roles.includes("SELLER")) return "/seller/properties";
  return "/onboarding/role";
}

async function persistUserRoles(args: {
  avatarUrl?: string | null;
  email?: string | null;
  name?: string | null;
  roles: AppRole[];
  userId: string;
}) {
  const email = args.email ?? "";
  const userData = {
    avatarUrl: args.avatarUrl ?? undefined,
    email,
    name: args.name ?? "",
    roles: args.roles,
  };

  if (email) {
    await prisma.user.upsert({
      where: { email },
      update: {
        ...userData,
        id: args.userId,
      },
      create: {
        ...userData,
        id: args.userId,
      },
    });
    return;
  }

  await prisma.user.upsert({
    where: { id: args.userId },
    update: {
      avatarUrl: args.avatarUrl ?? undefined,
      email: args.email ?? undefined,
      name: args.name ?? undefined,
      roles: args.roles,
    },
    create: {
      id: args.userId,
      email: args.email ?? "",
      name: args.name ?? "",
      avatarUrl: args.avatarUrl ?? undefined,
      roles: args.roles,
    },
  });
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
    select: { roles: true, status: true },
  });

  if (!appUser || appUser.status === "SUSPENDED") {
    await supabase.auth.signOut();
    redirect("/login?status=account-unavailable");
  }

  if (appUser.roles.length === 0) {
    redirect(next === "/" ? "/onboarding/role" : `/onboarding/role?next=${encodeURIComponent(next)}`);
  }

  redirect(next);
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        name,
      },
    },
  });

  if (error) {
    redirect(signupRedirectPath(formData, signupStatusForError(error.message), email));
  }

  const hasRealSignupIdentity = Boolean(data.session || data.user?.identities?.length);

  if (data.user && hasRealSignupIdentity) {
    await persistUserRoles({
      email: data.user.email ?? email,
      name,
      roles,
      userId: data.user.id,
    });
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
    redirect(`/signup/verify?next=${encodeURIComponent(next ?? nextForRoles(roles))}`);
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
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  return `/signup?${params.toString()}`;
}

function signupRoleValue(formData: FormData) {
  const value = String(formData.get("role") ?? "").toLowerCase();
  if (value === "seller" || value === "both") return value;
  return "buyer";
}

function signupStatusForError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("rate limit")) return "rate-limited";
  if (value.includes("password")) return "weak-password";
  if (value.includes("email")) return "invalid-email";
  return "signup-error";
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
      const existingUser = await prisma.user.findUnique({
        where: { id: data.user.id },
        select: { roles: true },
      });
      const roles = Array.from(new Set([...(existingUser?.roles ?? []), ...selected]));
      await persistUserRoles({
        avatarUrl:
          typeof data.user.user_metadata?.avatarUrl === "string"
            ? data.user.user_metadata.avatarUrl
            : null,
        email: data.user.email,
        name:
          typeof data.user.user_metadata?.name === "string"
            ? data.user.user_metadata.name
            : data.user.email,
        roles,
        userId: data.user.id,
      });
      if (roles.includes("SELLER")) {
        await ensureSellerAccessRequested(data.user.id);
      }
      await supabase.auth.refreshSession();
      redirect(safeNextValue(formData) ?? nextForRoles(roles));
    }
  }

  redirect("/login?next=/onboarding/role");
}
