import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const latency = new Trend("vectr_http_latency", true);
const failures = new Rate("vectr_http_failures");

export const options = {
  vus: Number(__ENV.USERS || 5),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    vectr_http_failures: ["rate<0.01"],
  },
};

const baseURL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export default function candidateLoginSmoke() {
  const response = http.get(`${baseURL}/candidate/login`, {
    tags: { route: "candidate-login" },
  });

  latency.add(response.timings.duration);
  const ok = check(response, {
    "candidate login returns 200": (r) => r.status === 200,
    "candidate login has expected content": (r) =>
      r.body && r.body.includes("Login Peserta"),
  });
  failures.add(!ok);

  sleep(Math.random() * 1.5 + 0.5);
}
