# VECTR Project State

## Current baseline

The current repository contains both:

- **R8.2 Concurrency Hardening**
- **R8.3 Admin Speed & Action UX**

The database migration set includes:

- `20260813000000_exam_proctoring.sql`
- `20260814000000_r5_database_contract.sql`
- `20260815000000_r6_accessibility_branding_multisection.sql`
- `20260817000100_r8_2_concurrency_hardening.sql`
- `20260817000200_r8_3_admin_speed_ux.sql`
- `20260831000000_r9_remedial_assignment_sections.sql` (per-candidate remedial module overrides)

## Runtime stack

- Next.js 16.3.0
- React 19.2.x
- Supabase JS 2.x
- Resend
- ExcelJS / docx / pdf-lib for exports
- Vercel deployment

## Candidate runtime

Candidate flow is approximately:

`/candidate/login`
→ signed candidate session + server-issued device identity
→ `/candidate`
→ `/candidate/exam/[id]`
→ policy acknowledgement/start
→ `/candidate/exam/[id]/take`
→ heartbeat/device lease
→ answer/flag persistence
→ section completion/final submit
→ `/candidate/exam/[id]/result`

For remedial exams, the active assignment may resolve to a candidate-specific
module set. If no override exists, the runtime intentionally falls back to the
exam's global sections.

R8.2 introduced server-side device identity in the signed candidate session and server-side device-lock checks. A second device must not silently take over an active session.

## Platform Owner runtime

`/admin/platform` owns customer organization/admin onboarding and management.

R8.3 includes:

- targeted admin auth directory RPC
- pending button states
- scroll preservation after server actions
- reduced revalidation
- safer organization deletion
- orphan-admin cleanup for empty deleted organizations

Admin onboarding does not use temporary passwords. Resend sends activation/setup links.

## Release gate

Current mandatory baseline command:

```powershell
npm.cmd run verify
```

Expected gates include database contract audit, release audit, and Next production build/type-check.

The database preflight also requires
`exam_platform_r9_remedial_healthcheck()` after the R9 migration is applied.

## Tooling branch

Developer tooling should remain isolated from product behavior until verified. Tooling must not change database runtime behavior.
