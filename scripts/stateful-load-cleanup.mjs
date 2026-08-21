import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const configuredEnv =
  process.env.VECTR_STATEFUL_ENV_FILE?.trim() ||
  ".env.stateful.local";
const file = path.resolve(process.cwd(), configuredEnv);
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
async function chunks(values, fn) {
  for (let i = 0; i < values.length; i += 100) await fn(values.slice(i, i + 100));
}

loadEnv();

const fixturePath = path.resolve(process.cwd(), "load-tests", ".stateful-fixture.json");
if (!fs.existsSync(fixturePath)) {
  console.log("[STATEFUL-CLEANUP] no fixture.");
  process.exit(0);
}
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const rows = fixture.rows || [];
if (!rows.length) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();

const STATEFUL_PRODUCTION_REF = "ihuxmsugczgbkoscnwkg";

function assertSafeStatefulTarget(targetUrl) {
  if (!targetUrl) return;

  let projectRef = "";

  try {
    const parsed = new URL(targetUrl);
    projectRef = parsed.hostname.split(".")[0];
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tidak valid.");
  }

  if (
    projectRef === STATEFUL_PRODUCTION_REF ||
    targetUrl.includes(STATEFUL_PRODUCTION_REF)
  ) {
    throw new Error(
      "STATEFUL LOAD BLOCKED: target adalah VECTR PRODUCTION Supabase."
    );
  }

  console.log(
    `[STATEFUL-SAFETY] dedicated non-production target: ${projectRef}`
  );
}

assertSafeStatefulTarget(url);
if (!url || !secret) throw new Error("Supabase env belum lengkap.");

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sessionIds = rows.map((x) => x.sessionId);
const sqIds = rows.map((x) => x.sessionQuestionId);
const assignmentIds = rows.map((x) => x.assignmentId);
const candidateIds = rows.map((x) => x.candidateId);

console.log(`[STATEFUL-CLEANUP] removing ${rows.length} load candidates...`);

await chunks(sqIds, async (ids) => {
  const { error } = await supabase.from("answers").delete().in("session_question_id", ids);
  if (error) console.warn("[cleanup answers]", error.message);
});
await chunks(sessionIds, async (ids) => {
  for (const table of ["results", "proctor_client_locks", "exam_section_progress", "session_questions"]) {
    const { error } = await supabase.from(table).delete().in("session_id", ids);
    if (error) console.warn(`[cleanup ${table}]`, error.message);
  }
});
await chunks(sessionIds, async (ids) => {
  const { error } = await supabase.from("exam_sessions").delete().in("id", ids);
  if (error) console.warn("[cleanup sessions]", error.message);
});
await chunks(assignmentIds, async (ids) => {
  const { error } = await supabase.from("exam_assignments").delete().in("id", ids);
  if (error) console.warn("[cleanup assignments]", error.message);
});
await chunks(candidateIds, async (ids) => {
  const { error } = await supabase.from("candidates").delete().in("id", ids);
  if (error) console.warn("[cleanup candidates]", error.message);
});

fs.rmSync(fixturePath, { force: true });
console.log("[STATEFUL-CLEANUP] PASS");
