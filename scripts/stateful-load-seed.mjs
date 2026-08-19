import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) throw new Error(".env.local tidak ditemukan.");
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function insertBatches(client, table, rows, select = "") {
  const output = [];
  for (let i = 0; i < rows.length; i += 100) {
    let q = client.from(table).insert(rows.slice(i, i + 100));
    if (select) q = q.select(select);
    const { data, error } = await q;
    if (error) throw new Error(`${table} insert gagal [${error.code ?? "DB"}]: ${error.message}`);
    if (data) output.push(...data);
  }
  return output;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
const count = Math.max(1, Math.min(200, Number(process.argv[2] || 200)));

if (!url || !secret) throw new Error("Supabase env belum lengkap.");

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: exams, error: examError } = await supabase
  .from("exams")
  .select("id,title,organization_id,batch_id,duration_minutes,status,hard_close_at")
  .ilike("title", "Golden Exam %")
  .eq("status", "ACTIVE")
  .order("hard_close_at", { ascending: false })
  .limit(10);

if (examError) throw new Error(`Gagal mencari Golden Exam: ${examError.message}`);
const exam = exams?.[0];
if (!exam) {
  throw new Error("Golden Exam ACTIVE tidak ditemukan. Jalankan Golden Full V2 dulu.");
}

const now = new Date();
const hardClose = new Date(now.getTime() + 90 * 60_000);
const startsAt = new Date(now.getTime() - 5 * 60_000);
const loginOpen = new Date(now.getTime() - 10 * 60_000);

const { error: scheduleError } = await supabase
  .from("exams")
  .update({
    login_open_at: loginOpen.toISOString(),
    starts_at: startsAt.toISOString(),
    hard_close_at: hardClose.toISOString(),
  })
  .eq("id", exam.id);

if (scheduleError) throw new Error(`Golden Exam schedule refresh gagal: ${scheduleError.message}`);

const { data: sections, error: sectionError } = await supabase
  .from("exam_sections")
  .select("id,module_id,duration_minutes,order_index")
  .eq("exam_id", exam.id)
  .order("order_index", { ascending: true });

if (sectionError || !sections?.length) {
  throw new Error(`Golden Exam section tidak ditemukan: ${sectionError?.message ?? "empty"}`);
}
const section = sections[0];

const { data: question, error: questionError } = await supabase
  .from("questions")
  .select("id,code,question_text,options,correct_option_id,weight,module_id")
  .eq("module_id", section.module_id)
  .eq("status", "ACTIVE")
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle();

if (questionError || !question) {
  throw new Error(`Golden question tidak ditemukan: ${questionError?.message ?? "empty"}`);
}

const options = Array.isArray(question.options) ? question.options : [];
const optionIds = options
  .map((o) => String(o?.id ?? "").trim())
  .filter(Boolean);

if (!optionIds.length) throw new Error("Golden question tidak memiliki option id.");

const runId = Date.now().toString(36).toUpperCase();
const candidateRows = Array.from({ length: count }, (_, i) => ({
  organization_id: exam.organization_id,
  batch_id: exam.batch_id,
  candidate_type: "INDIVIDUAL",
  candidate_code: `LOAD-${runId}-${String(i + 1).padStart(3, "0")}`,
  display_name: `Load Candidate ${String(i + 1).padStart(3, "0")}`,
  external_identifier: null,
  email: null,
  active: true,
}));

console.log(`[STATEFUL-SEED] Golden exam: ${exam.title} (${exam.id})`);
console.log(`[STATEFUL-SEED] Membuat ${count} candidate...`);

const candidates = await insertBatches(
  supabase,
  "candidates",
  candidateRows,
  "id,candidate_code"
);

const assignmentRows = candidates.map((candidate) => ({
  exam_id: exam.id,
  candidate_id: candidate.id,
  extra_time_minutes: 0,
  active: true,
}));

const assignments = await insertBatches(
  supabase,
  "exam_assignments",
  assignmentRows,
  "id,candidate_id"
);

const assignmentByCandidate = new Map(
  assignments.map((row) => [String(row.candidate_id), String(row.id)])
);

const startedAt = new Date();
const deadlineAt = new Date(startedAt.getTime() + 60 * 60_000);

const sessions = candidates.map((candidate) => ({
  id: randomUUID(),
  assignment_id: assignmentByCandidate.get(String(candidate.id)),
  attempt_no: 1,
  status: "ACTIVE",
  started_at: startedAt.toISOString(),
  deadline_at: deadlineAt.toISOString(),
  submitted_at: null,
  last_seen_at: startedAt.toISOString(),
  updated_at: startedAt.toISOString(),
  snapshot_ready_at: startedAt.toISOString(),
}));

await insertBatches(supabase, "exam_sessions", sessions);

const sessionQuestions = sessions.map((session) => ({
  id: randomUUID(),
  session_id: session.id,
  question_id: question.id,
  exam_section_id: section.id,
  order_index: 1,
  option_order: optionIds,
  question_snapshot: {
    code: question.code,
    question_text: question.question_text,
    options,
    correct_option_id: question.correct_option_id,
    weight: Number(question.weight ?? 1),
    module_id: section.module_id,
    exam_section_id: section.id,
  },
}));

await insertBatches(supabase, "session_questions", sessionQuestions);

const progressRows = sessions.map((session) => ({
  session_id: session.id,
  exam_section_id: section.id,
  status: "ACTIVE",
  started_at: startedAt.toISOString(),
  deadline_at: deadlineAt.toISOString(),
  completed_at: null,
  updated_at: startedAt.toISOString(),
}));

await insertBatches(supabase, "exam_section_progress", progressRows);

const candidateById = new Map(candidates.map((x) => [String(x.id), x]));
const sqBySession = new Map(sessionQuestions.map((x) => [String(x.session_id), x]));

const fixture = sessions.map((session) => {
  const assignment = assignments.find((a) => String(a.id) === String(session.assignment_id));
  const candidate = candidateById.get(String(assignment.candidate_id));
  const sq = sqBySession.get(String(session.id));
  return {
    examId: String(exam.id),
    candidateId: String(candidate.id),
    candidateCode: String(candidate.candidate_code),
    assignmentId: String(assignment.id),
    sessionId: String(session.id),
    sessionQuestionId: String(sq.id),
    optionId: String(optionIds[0]),
    clientId: `k6-${runId}-${String(candidate.candidate_code)}`,
  };
});

const fixturePath = path.resolve(process.cwd(), "load-tests", ".stateful-fixture.json");
fs.writeFileSync(
  fixturePath,
  JSON.stringify({
    version: "VECTR-STATEFUL-K6-V1",
    createdAt: new Date().toISOString(),
    examId: String(exam.id),
    examTitle: String(exam.title),
    runId,
    rows: fixture,
  }, null, 2),
  "utf8"
);

console.log(`[STATEFUL-SEED] PASS — ${fixture.length} active sessions ready.`);
console.log(`[STATEFUL-SEED] fixture: ${fixturePath}`);
