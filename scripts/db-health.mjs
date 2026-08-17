import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  const lines = fs.readFileSync(localEnvPath, "utf8").split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "CANDIDATE_SESSION_SECRET",
  "ACCESS_CODE_ENCRYPTION_KEY",
];

const sourceTables = [
  "organizations",
  "admin_profiles",
  "organization_members",
  "batches",
  "candidates",
  "modules",
  "questions",
  "exams",
  "exam_assignments",
  "exam_sessions",
  "session_questions",
  "answers",
  "results",
  "proctor_events",
  "proctor_client_locks",
  "proctor_violation_resets",
  "candidate_login_rate_limits",
  "exam_email_campaigns",
  "exam_email_deliveries",
  "organization_branding",
  "organization_subscriptions",
  "organization_subscription_events",
  "exam_sections",
  "exam_section_progress",
];

function fail(message) {
  console.error(`\n[PRE-FLIGHT] FAIL — ${message}`);
  process.exit(1);
}

function isValidEncryptionKey(value) {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return true;

  try {
    const decoded = Buffer.from(trimmed, "base64");
    return decoded.length === 32 && decoded.toString("base64").replace(/=+$/u, "") === trimmed.replace(/=+$/u, "");
  } catch {
    return false;
  }
}

const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
if (missingEnv.length) {
  fail(`Environment belum lengkap: ${missingEnv.join(", ")}`);
}

if ((process.env.CANDIDATE_SESSION_SECRET?.trim().length ?? 0) < 32) {
  fail("CANDIDATE_SESSION_SECRET terlalu pendek. Gunakan randomBytes(48) seperti instruksi setup.");
}

if (!isValidEncryptionKey(process.env.ACCESS_CODE_ENCRYPTION_KEY ?? "")) {
  fail("ACCESS_CODE_ENCRYPTION_KEY harus 32-byte (64 karakter hex atau base64 32-byte). Jangan mengganti key lama jika credential lama sudah ada.");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

console.log("[PRE-FLIGHT] Memeriksa database contract R6...");

const { data: health, error: healthError } = await supabase.rpc("exam_platform_healthcheck");
if (healthError) {
  fail(`RPC exam_platform_healthcheck belum bisa dipanggil (${healthError.code ?? "NO_CODE"}): ${healthError.message}. Jalankan FINAL_SETUP.sql R6 terbaru terlebih dahulu.`);
}

if (!health || typeof health !== "object") {
  fail("Healthcheck database tidak mengembalikan payload yang valid.");
}

if (health.ok !== true) {
  const missing = Array.isArray(health.missing) ? health.missing : [];
  console.error(`[PRE-FLIGHT] Database version: ${health.version ?? "unknown"}`);
  for (const item of missing) console.error(`  - ${String(item)}`);
  fail(`${missing.length || "Ada"} database contract belum terpenuhi. Jangan tes UI dulu; perbaiki item di atas.`);
}

console.log(`[PRE-FLIGHT] Database contract ${health.version ?? "R5"}: OK`);

const { data: r6Health, error: r6HealthError } = await supabase.rpc("exam_platform_r6_healthcheck");
if (r6HealthError) {
  fail(`RPC exam_platform_r6_healthcheck belum siap (${r6HealthError.code ?? "NO_CODE"}): ${r6HealthError.message}. Jalankan FINAL_SETUP.sql R6 terbaru.`);
}
if (!r6Health || r6Health.ok !== true) {
  const missing = Array.isArray(r6Health?.missing) ? r6Health.missing : [];
  for (const item of missing) console.error(`  - ${String(item)}`);
  fail("Database contract R6 belum lengkap.");
}
console.log(`[PRE-FLIGHT] Database contract ${r6Health.version ?? "R6"}: OK`);

const { data: r7Health, error: r7HealthError } = await supabase.rpc("exam_platform_r7_healthcheck");
if (r7HealthError) {
  fail(`RPC exam_platform_r7_healthcheck belum siap (${r7HealthError.code ?? "NO_CODE"}): ${r7HealthError.message}. Jalankan R7_1_SUBSCRIPTION_REPAIR.sql.`);
}
if (!r7Health || r7Health.ok !== true) {
  const missing = Array.isArray(r7Health?.missing) ? r7Health.missing : [];
  for (const item of missing) console.error(`  - ${String(item)}`);
  fail("Database contract R7 subscription belum lengkap. Jalankan R7_1_SUBSCRIPTION_REPAIR.sql.");
}
console.log(`[PRE-FLIGHT] Database contract ${r7Health.version ?? "R7-SUBSCRIPTION"}: OK`);

const { data: r82Health, error: r82HealthError } = await supabase.rpc("exam_platform_r82_healthcheck");
if (r82HealthError) {
  fail(`RPC exam_platform_r82_healthcheck belum siap (${r82HealthError.code ?? "NO_CODE"}): ${r82HealthError.message}. Jalankan migration 20260817_r8_2_concurrency_hardening.sql.`);
}
if (!r82Health || r82Health.ok !== true) {
  const missing = Array.isArray(r82Health?.missing) ? r82Health.missing : [];
  for (const item of missing) console.error(`  - ${String(item)}`);
  fail("Database contract R8.2 concurrency belum lengkap.");
}
console.log(`[PRE-FLIGHT] Database contract ${r82Health.version ?? "R8.2-CONCURRENCY"}: OK`);

const { data: r83Health, error: r83HealthError } = await supabase.rpc("exam_platform_r83_healthcheck");
if (r83HealthError) {
  fail(`RPC exam_platform_r83_healthcheck belum siap (${r83HealthError.code ?? "NO_CODE"}): ${r83HealthError.message}. Jalankan migration 20260817_r8_3_admin_speed_ux.sql.`);
}
if (!r83Health || r83Health.ok !== true) {
  const missing = Array.isArray(r83Health?.missing) ? r83Health.missing : [];
  for (const item of missing) console.error(`  - ${String(item)}`);
  fail("Database contract R8.3 admin speed belum lengkap.");
}
console.log(`[PRE-FLIGHT] Database contract ${r83Health.version ?? "R8.3-ADMIN-SPEED"}: OK`);

const { error: authDirectoryError } = await supabase.rpc("exam_platform_admin_auth_directory");
if (authDirectoryError) {
  fail(`RPC exam_platform_admin_auth_directory belum dapat dipanggil service_role: ${authDirectoryError.message}`);
}

const { error: brandingBucketError } = await supabase.storage
  .from("exam-branding")
  .list("organizations", { limit: 1 });
if (brandingBucketError) {
  fail(`Storage bucket exam-branding belum siap (${brandingBucketError.message}). Jalankan FINAL_SETUP.sql R6 terbaru.`);
}
console.log("[PRE-FLIGHT] Storage branding: OK");
console.log("[PRE-FLIGHT] Memeriksa akses Data API service_role ke seluruh tabel source...");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tableFailures = [];

for (const table of sourceTables) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // Use GET instead of HEAD so PostgREST returns the real JSON error body/code.
    const { error } = await supabase.from(table).select("*").limit(1);
    if (!error) {
      lastError = null;
      break;
    }

    lastError = error;
    if (attempt < 3) await sleep(900);
  }

  if (lastError) {
    const parts = [
      lastError.code || "NO_CODE",
      lastError.message || "No message returned",
      lastError.hint ? `hint=${lastError.hint}` : null,
      lastError.details ? `details=${lastError.details}` : null,
    ].filter(Boolean);
    tableFailures.push(`${table} (${parts.join(" | ")})`);
  }
}

if (tableFailures.length) {
  for (const item of tableFailures) console.error(`  - ${item}`);
  fail("Data API belum memberi service_role akses ke semua tabel source. Jalankan FINAL_SETUP.sql R6 lalu ulangi audit:db.");
}

if (!process.env.RESEND_API_KEY?.trim()) {
  console.log("[PRE-FLIGHT] INFO — RESEND_API_KEY kosong. Fitur email dinonaktifkan sampai key diisi; fitur ujian lain tetap aman.");
} else if (!process.env.RESEND_FROM_EMAIL?.trim()) {
  console.log("[PRE-FLIGHT] WARN — RESEND_FROM_EMAIL kosong. Local development dapat memakai sender testing, tetapi production email dinonaktifkan sampai sender domain diisi.");
}

console.log("\n[PRE-FLIGHT] PASS — env + schema + table/RPC contract siap untuk UI testing.");
