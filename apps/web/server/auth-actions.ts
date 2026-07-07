"use server";

import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { safeInternalPath } from "../lib/redirect";
import { ensureSellerAccessRequested } from "./access";
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

async function persistUserRoles(args: {
  email?: string | null;
  name?: string | null;
  roles: AppRole[];
  userId: string;
}) {
  const email = args.email ?? "";
  const existingById = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { id: true },
  });
  const emailOwner = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    : null;
  const writableEmail = email && (!emailOwner || emailOwner.id === args.userId) ? email : undefined;
  const userData = {
    ...(writableEmail ? { email: writableEmail } : {}),
    name: args.name ?? "",
    roles: args.roles,
  };

  if (existingById) {
    await prisma.user.update({
      where: { id: args.userId },
      data: userData,
    });
    return;
  }

  if (emailOwner && emailOwner.id !== args.userId) {
    throw new Error("A different app user already owns this email address.");
  }

  await prisma.user.create({
    data: {
      id: args.userId,
      email,
      name: args.name ?? "",
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
    redirect(signupRedirectPath(formData, status, email));
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
