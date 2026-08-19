import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envPath = path.resolve(root, ".env.local");

if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(name in process.env)) {
      process.env[name] = value;
    }
  }
}

function fail(message, detail) {
  console.error(`\n[R8.3.2-FINALIZER] FAIL — ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secret) {
  fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY belum tersedia.");
}

const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260818_r8_3_2_finalize_rpc_ambiguity_repair.sql"
);

if (!fs.existsSync(migrationPath)) {
  fail(`Migration tidak ditemukan: ${migrationPath}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const staticMarkers = [
  "#variable_conflict use_column",
  "UPDATE public.exam_section_progress AS esp",
  "WHERE esp.session_id = p_session_id",
  "UPDATE public.exam_sessions AS es",
  "WHERE es.id = p_session_id",
  "exam_platform_r832_healthcheck",
];

const missingStatic = staticMarkers.filter((marker) => !migration.includes(marker));
if (missingStatic.length) {
  fail(
    "Migration lokal kehilangan guard finalizer.",
    missingStatic.map((item) => `  - ${item}`).join("\n")
  );
}

const supabase = createClient(url, secret, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await supabase.rpc("exam_platform_r832_healthcheck");

if (error) {
  fail(
    `RPC healthcheck belum dapat dipanggil (${error.code ?? "DB"}).`,
    error.message
  );
}

if (!data || data.ok !== true) {
  fail(
    "Database belum memakai finalizer R8.3.2.",
    JSON.stringify(data, null, 2)
  );
}

console.log("[R8.3.2-FINALIZER] PASS");
console.log(JSON.stringify(data, null, 2));
