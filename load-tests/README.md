# VECTR Load Test Notes

Start with the safe read-only profile.

```powershell
k6 run -e USERS=20 -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
```

Then:

```powershell
k6 run -e USERS=50  -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
k6 run -e USERS=100 -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
k6 run -e USERS=150 -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
k6 run -e USERS=200 -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
```

If a dummy public join page should also be loaded:

```powershell
k6 run -e USERS=20 -e EXAM_ID=<DUMMY_EXAM_ID> -e BASE_URL=http://127.0.0.1:3000 load-tests/exam-load.js
```

This is NOT yet a stateful answer/heartbeat/submit benchmark.

Do not invent or scrape unstable Next Server Action identifiers for load testing.
Do not put a Supabase service-role key in k6 scripts.
A realistic R8.2 stateful benchmark should be added only against a dedicated
test tenant/project with explicit fixtures and cleanup.

## STATEFUL SAFETY CONTRACT

Stateful load tests must use a dedicated non-production Supabase project.

Create a local ignored file:

`.env.stateful.local`

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

The stateful runners deliberately refuse the VECTR production project
`ihuxmsugczgbkoscnwkg`.

Do not copy production `.env.local` into `.env.stateful.local`.

The stateful harness creates and mutates load-test candidates,
assignments, sessions, answers, heartbeats, flags, results, and
finalization state.