# Exam Platform R5 — Release Audit

## Scope scanned

- 84 TS/TSX source files under `app/` + `lib/`.
- 12 admin Server Action files / 49 exported admin actions.
- 11 admin Route Handlers (Excel/PDF/Word/CSV/template/upload routes).
- Candidate login, join link, preparation, take/autosave/flag/submit, result, proctor beacon.
- Module/question, participant/batch/import, exam lifecycle, credential, settings, proctor, result export, Communication, Platform Owner flows.
- 19 Supabase tables referenced by source.
- 3 base V2 RPC contracts plus R5 healthcheck.

## Findings repaired in R5

- Database state CHECK/enum mismatch that can reject `modules.status = ACTIVE` even when 2 active questions exist.
- Admin read/mutation RLS-path inconsistency.
- Participant import missing `candidate_type`.
- Missing Communication table contract.
- Missing unique-index guarantees required by `onConflict/upsert`.
- Draft/autosave/optional field nullability mismatches.
- Participant import template/upload route guards.
- Resend import-time hard failure when email is not configured.
- Generic database mutation messages replaced with operation/code diagnostics on critical flows.
- Candidate login code matching changed to exact normalized match.
- Silent dependency-count failures before delete now checked.
- Candidate session token rejects extra segments.
- Global Admin DB compatibility banner added.

## Static verification result

- TypeScript/TSX parser: **0 syntax errors**.
- Local `@/` imports: **0 missing**.
- Admin Server Action auth coverage: **12/12 files**.
- Admin Route Handler auth coverage: **11/11 routes**.
- Admin user/RLS Supabase client references: **0** outside the intentional auth-context layer.
- Source tables covered by `exam_platform_healthcheck`: **19/19**.
- Source columns represented by health contract inventory: **165/165**.
- `upsert/onConflict` contracts inventoried: assignment, answer, delivery, login-rate, device-lock.
- Native `<select>` in app: **0**.
- TODO/FIXME/HACK under app/lib/scripts: **0**.
- `.env.local` / PEM / embedded Supabase/Resend secrets in release: **0**.

## Mandatory live verification

The user database cannot be queried from this sandbox because the Supabase connector denied database permission. Therefore R5 adds a live pre-flight that runs against the user's own `.env.local`:

```powershell
npm.cmd run audit:db
```

Do not UI-test until it ends with:

```text
[PRE-FLIGHT] PASS — env + schema + table/RPC contract siap untuk UI testing.
```

For the final local production gate, run:

```powershell
npm.cmd run verify
```

This executes the live DB pre-flight and then `next build`. Full Next.js build is intentionally not claimed as sandbox-verified because this sandbox does not contain the project's installed `node_modules` and its offline npm cache is incomplete.
