import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Trend, Rate } from "k6/metrics";

const fixture = JSON.parse(open("./.stateful-fixture.json"));
const rows = fixture.rows || [];
const users = Number(__ENV.USERS || rows.length || 200);

if (!__ENV.SUPABASE_URL || !__ENV.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY missing");
}

export const options = {
  scenarios: {
    submit_burst: {
      executor: "shared-iterations",
      vus: users,
      iterations: users,
      maxDuration: "2m",
    },
  },
  thresholds: {
    submit_failed: ["rate<0.01"],
    submit_ms: ["p(95)<5000"],
  },
};

const submitTrend = new Trend("submit_ms", true);
const submitFailed = new Rate("submit_failed");
const url = `${__ENV.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/exam_finalize_session_r82`;
const secretKey = __ENV.SUPABASE_SECRET_KEY;
const headers = {
  apikey: secretKey,
  "Content-Type": "application/json",
};
if (!secretKey.startsWith("sb_secret_")) {
  headers.Authorization = `Bearer ${secretKey}`;
}

export default function () {
  const index = exec.scenario.iterationInTest;
  const row = rows[index];
  if (!row) return;

  const response = http.post(url, JSON.stringify({
    p_session_id: row.sessionId,
  }), {
    headers,
    timeout: "20s",
    tags: { name: "exam_finalize_session_r82" },
  });

  submitTrend.add(response.timings.duration);
  const ok = response.status >= 200 && response.status < 300;
  submitFailed.add(!ok);

  if (!ok) {
    console.error(
      `[SUBMIT_FAIL] index=${index} session=${row.sessionId} STATUS=${response.status} ERROR_CODE=${response.error_code || ""} ERROR=${response.error || ""} DURATION_MS=${response.timings.duration} BODY=${String(response.body || "").slice(0, 2000)}`
    );
  }

  check(response, {
    "finalize 2xx": (r) => r.status >= 200 && r.status < 300,
  });
}
