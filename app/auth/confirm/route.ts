import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicAppOrigin } from "@/lib/platform-email";

const allowedTypes = new Set<EmailOtpType>(["invite", "magiclink", "recovery"]);

function safeNext(value: string | null, type: EmailOtpType) {
  const fallback = type === "invite" || type === "magiclink" ? "/update-password?mode=invite" : "/update-password?mode=recovery";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function GET(request: NextRequest) {
  const origin = await getPublicAppOrigin();
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const type = rawType && allowedTypes.has(rawType) ? rawType : null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?auth_error=Link%20aktivasi%20tidak%20valid.", origin));
  }

  // Do not consume one-time Supabase tokens on GET. Email security scanners and
  // link-preview bots can visit URLs before the human recipient does.
  const activation = new URL("/activate-account", origin);
  activation.searchParams.set("token_hash", tokenHash);
  activation.searchParams.set("type", type);
  activation.searchParams.set("next", safeNext(request.nextUrl.searchParams.get("next"), type));
  return NextResponse.redirect(activation);
}
