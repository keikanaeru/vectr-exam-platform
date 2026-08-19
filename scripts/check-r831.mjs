import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/u);
  for (const rawLine of lines) {
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !secret) {
  console.error("[R8.3.1-CHECK] FAIL — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc("exam_platform_r831_healthcheck");

if (error) {
  console.error(`[R8.3.1-CHECK] FAIL — ${error.code ?? "DB"}: ${error.message}`);
  process.exit(1);
}

if (!data?.ok) {
  console.error("[R8.3.1-CHECK] FAIL");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("[R8.3.1-CHECK] PASS");
console.log(JSON.stringify(data, null, 2));
