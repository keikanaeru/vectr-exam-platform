import { createHash } from "crypto";
import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  setupMissing?: boolean;
};

async function buildScopeHash(scope: string) {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const realIp = headerStore.get("x-real-ip")?.trim() || "";
  const userAgent = headerStore.get("user-agent")?.slice(0, 180) || "";
  const client = forwarded || realIp || "unknown-ip";

  return createHash("sha256")
    .update(`${scope.trim().toUpperCase()}|${client}|${userAgent}`)
    .digest("hex");
}

export async function checkCandidateLoginRateLimit(scope: string): Promise<RateLimitResult> {
  const scopeHash = await buildScopeHash(scope);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("candidate_login_rate_limits")
    .select("attempts, window_started_at, blocked_until")
    .eq("scope_hash", scopeHash)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return { allowed: true, retryAfterSeconds: 0, setupMissing: true };
    console.error("CANDIDATE LOGIN RATE LIMIT READ ERROR:", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (!data) return { allowed: true, retryAfterSeconds: 0 };

  const now = Date.now();
  const blockedUntil = data.blocked_until ? new Date(String(data.blocked_until)).getTime() : 0;
  if (Number.isFinite(blockedUntil) && blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)) };
  }

  const windowStart = data.window_started_at ? new Date(String(data.window_started_at)).getTime() : 0;
  if (!Number.isFinite(windowStart) || now - windowStart >= WINDOW_MS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function registerCandidateLoginFailure(scope: string) {
  const scopeHash = await buildScopeHash(scope);
  const supabase = createAdminClient();
  const now = Date.now();

  const { data, error: readError } = await supabase
    .from("candidate_login_rate_limits")
    .select("attempts, window_started_at, blocked_until")
    .eq("scope_hash", scopeHash)
    .maybeSingle();

  if (readError) {
    if (readError.code !== "42P01") console.error("CANDIDATE LOGIN RATE LIMIT READ ERROR:", readError);
    return;
  }

  const windowStartMs = data?.window_started_at ? new Date(String(data.window_started_at)).getTime() : 0;
  const existingBlockMs = data?.blocked_until ? new Date(String(data.blocked_until)).getTime() : 0;
  const windowExpired = !Number.isFinite(windowStartMs) || now - windowStartMs >= WINDOW_MS;
  const attempts = windowExpired ? 1 : Math.max(0, Number(data?.attempts ?? 0)) + 1;
  const blockedUntil = attempts >= MAX_FAILURES
    ? new Date(Math.max(now + BLOCK_MS, Number.isFinite(existingBlockMs) ? existingBlockMs : 0)).toISOString()
    : null;

  const { error } = await supabase
    .from("candidate_login_rate_limits")
    .upsert({
      scope_hash: scopeHash,
      attempts,
      window_started_at: windowExpired ? new Date(now).toISOString() : String(data?.window_started_at),
      blocked_until: blockedUntil,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "scope_hash" });

  if (error && error.code !== "42P01") console.error("CANDIDATE LOGIN RATE LIMIT WRITE ERROR:", error);
}

export async function clearCandidateLoginFailures(scope: string) {
  const scopeHash = await buildScopeHash(scope);
  const supabase = createAdminClient();
  const { error } = await supabase.from("candidate_login_rate_limits").delete().eq("scope_hash", scopeHash);
  if (error && error.code !== "42P01") console.error("CANDIDATE LOGIN RATE LIMIT CLEAR ERROR:", error);
}

export function formatRateLimitMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Terlalu banyak percobaan login. Coba lagi sekitar ${minutes} menit.`;
}
