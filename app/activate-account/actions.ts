"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function safeNext(value: string, type: EmailOtpType) {
  const fallback = type === "invite" || type === "magiclink" ? "/update-password?mode=invite" : "/update-password?mode=recovery";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function confirmAccountLink(tokenHash: string, type: "invite" | "magiclink" | "recovery", next: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    redirect(`/login?auth_error=${encodeURIComponent("Link aktivasi sudah tidak valid atau kedaluwarsa. Minta link baru.")}`);
  }
  redirect(safeNext(next, type));
}
