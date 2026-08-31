"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

function safeCallbackUrl(value: FormDataEntryValue | null): string {
  // Must be a same-site relative path — a bare "/" prefix still allows
  // protocol-relative URLs like "//evil.com", so reject those too.
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  const redirectTo = safeCallbackUrl(formData.get("callbackUrl"));
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    // `signIn` throws a Next.js redirect internally on success — that must
    // propagate, not be swallowed as a login failure.
    if (error instanceof AuthError) {
      return "E-mail ou senha inválidos.";
    }
    throw error;
  }
}
