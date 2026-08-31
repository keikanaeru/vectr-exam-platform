/*
VECTR READ-ONLY LOAD PROFILE

This deliberately does NOT fake Next.js Server Action IDs and does NOT use a
service-role key. It measures public/server-rendered page pressure safely.

For realistic start/heartbeat/save/submit load, create a dedicated test tenant
and a stable load-test harness. Do not point a privileged direct-DB script at
production.
*/

import http from "k6/http";
import { check, sleep } from "k6";

const users = Number(__ENV.USERS || 20);
const duration = __ENV.DURATION || "2m";
const baseURL = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const examId = __ENV.EXAM_ID || "";

export const options = {
  scenarios: {
    vectr_read_load: {
      executor: "ramping-vus",
      stages: [
        { duration: "20s", target: users },
        { duration, target: users },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
};

export default function vectrReadLoad() {
  const routes = ["/candidate/login"];

  if (examId) {
    routes.push(`/join/${examId}`);
  }

  for (const route of routes) {
    const response = http.get(`${baseURL}${route}`, {
      tags: { route },
    });

    check(response, {
      [`${route} responds without 5xx`]: (r) => r.status < 500,
    });

    sleep(Math.random() * 0.8 + 0.2);
  }
}
