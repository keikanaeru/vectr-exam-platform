<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# VECTR Exam Platform Engineering Rules

## Product priorities

For every change use this priority order:

1. exam correctness and data integrity
2. security and tenant isolation
3. reliability under concurrent candidates
4. clear user feedback
5. performance
6. visual effects

Candidate exam pages are performance-first. Decorative effects must never make answering, saving, navigation, timer, or submit less reliable.

## Current architecture

- Next.js 16 App Router
- React 19
- Supabase Auth + Postgres + Storage
- Resend for transactional email
- Vercel deployment
- R8.2 concurrency hardening is part of the runtime contract.
- R8.3 admin speed/action UX is part of the runtime contract.

## Security invariants

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, Resend API keys, encryption keys, or `.env.local`.
- Never put service-role credentials in client components or browser code.
- Candidate access codes remain hashed/encrypted according to the existing contract.
- Do not reintroduce temporary admin passwords. Admin onboarding uses invite/recovery links and users create their own password.
- Keep tenant filters (`organization_id`) on organization-owned data.
- Keep single-device enforcement fail-closed on server-side candidate exam entry and mutations.
- Duplicate-tab detection and device-lock enforcement are separate protections.
- Do not weaken proctoring/security merely to improve performance.

## Database rules

- Schema/RPC/index changes require a new migration under `supabase/migrations/`.
- Never edit an already-applied production migration to represent a new release.
- Prefer atomic RPCs for hot candidate paths when multiple round trips create race conditions.
- Preserve the R8.2 heartbeat/save/flag/finalize contracts unless the change explicitly migrates them.
- Organization deletion must not cascade through exam business data by accident.
- Deleting an admin must not delete organization/module/candidate/exam/result data.

## Performance rules

- Avoid sequential independent Supabase reads; use `Promise.all` where safe.
- Avoid `auth.admin.listUsers()` fan-out for normal admin page reads.
- Avoid full-page revalidation when a narrow path is enough.
- Candidate hot paths should avoid unnecessary rendering effects and unnecessary database round trips.
- Never solve latency by removing server validation.

## UX rules

Every destructive/slow admin action needs:

- visible pending state
- success/error feedback
- confirmation for destructive actions
- no unexplained scroll jump after completion

## Testing gates

Before a release:

1. `npm.cmd run verify`
2. `npm.cmd run test:e2e` when Playwright is installed/configured
3. manual smoke test for changed user flow
4. Lighthouse when UI/performance changed
5. staged load testing when candidate hot paths/database contracts changed

Never merge a concurrency/database change based only on TypeScript compilation.

## AI/patch workflow

When assisting through AI:

- read `docs/PROJECT_STATE.md` first
- use the latest Repomix output when available
- identify root cause before patching
- prefer a small copy-paste patch over broad rewrites
- list migrations separately from application files
- never edit `.env.local`
- never ask to use `npm audit fix --force`
- keep historical behavior unless the requested change explicitly replaces it
