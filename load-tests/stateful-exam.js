import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const fixture = JSON.parse(open("./.stateful-fixture.json"));
const rows = fixture.rows || [];
const users = Number(__ENV.USERS || 20);
const duration = __ENV.DURATION || "40s";

if (!__ENV.SUPABASE_URL || !__ENV.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY missing");
}
if (rows.length < users) {
  throw new Error(`Fixture hanya ${rows.length}, USERS=${users}`);
}

export const options = {
  vus: users,
  duration,
  thresholds: {
    rpc_failed: ["rate<0.01"],
    heartbeat_ms: ["p(95)<10000"],
    answer_ms: ["p(95)<3000"],
    flag_ms: ["p(95)<3000"],
  },
};

const heartbeatTrend = new Trend("heartbeat_ms", true);
const answerTrend = new Trend("answer_ms", true);
const flagTrend = new Trend("flag_ms", true);
const rpcFailed = new Rate("rpc_failed");

const base = `${__ENV.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc`;
const secretKey = __ENV.SUPABASE_SECRET_KEY;
const headers = {
  apikey: secretKey,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// New Supabase sb_secret_* API keys are NOT JWTs and should not be forced
// into Authorization: Bearer. Legacy service_role JWTs still use Bearer.
if (!secretKey.startsWith("sb_secret_")) {
  headers.Authorization = `Bearer ${secretKey}`;
}

let localIteration = 0;

function rpc(name, body, trend) {
  const response = http.post(`${base}/${name}`, JSON.stringify(body), {
    headers,
    tags: { name: name },
    timeout: "15s",
  });
  trend.add(response.timings.duration);
  const ok = response.status >= 200 && response.status < 300;
  rpcFailed.add(!ok);
  if (!ok) {
    console.error(`[RPC_FAIL] ${name} STATUS=${response.status} BODY=${response.body}`);
  }
  check(response, {
    [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
  return response;
}

export default function () {
  const row = rows[(__VU - 1) % users];
  localIteration += 1;

  // IMPORTANT: the old harness synchronized every VU on iteration #1,
  // causing 200 heartbeats + 200 saves to hit the same host almost at once.
  // The real ExamGuard uses jitter and real candidates answer at different times.
  // Spread first activity deterministically across ~0-5 seconds.
  if (localIteration === 1) {
    sleep(((__VU - 1) % 25) * 0.2);
  }

  // Per-VU phase offset prevents all heartbeat/flag requests from lining up.
  if ((localIteration + __VU) % 3 === 0) {
    rpc("exam_candidate_heartbeat_r82", {
      p_assignment_id: row.assignmentId,
      p_candidate_id: row.candidateId,
      p_exam_id: row.examId,
      p_client_id: row.clientId,
      p_user_agent: "k6/VECTR-stateful-v1.2",
    }, heartbeatTrend);
  }

  rpc("exam_candidate_save_answer_r82", {
    p_assignment_id: row.assignmentId,
    p_candidate_id: row.candidateId,
    p_exam_id: row.examId,
    p_session_question_id: row.sessionQuestionId,
    p_selected_option_id: row.optionId,
    p_client_id: row.clientId,
  }, answerTrend);

  if ((localIteration + __VU) % 10 === 0) {
    rpc("exam_candidate_save_flag_r82", {
      p_assignment_id: row.assignmentId,
      p_candidate_id: row.candidateId,
      p_exam_id: row.examId,
      p_session_question_id: row.sessionQuestionId,
      p_flagged: true,
      p_client_id: row.clientId,
    }, flagTrend);
  }

  sleep(5 + ((__VU + localIteration) % 4));
}
