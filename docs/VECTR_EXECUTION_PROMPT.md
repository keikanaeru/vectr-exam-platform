# VECTR Product-System Execution Prompt

Target repository: `C:\Users\User\exam-platform-final`
Current working branch: `r8-4-admin-visual`

## Mission

Build the strongest practical exam experience for administrators and candidates while preserving validated domain behavior. VECTR is an exam operations control center, not a generic SaaS dashboard. Admin work follows `PLAN → CONTENT → PEOPLE → DELIVERY → LIVE → RESULTS`. Primary Admin navigation is `Overview | Ujian | Bank Soal | Peserta | Workspace | Platform` (Platform is owner-only).

## Safety constraints

1. Resolve the repository root, branch, and dirty paths before editing. Treat every pre-existing dirty change as user-owned.
2. Never reset, clean, stash, checkout-over, discard, or overwrite unrelated work.
3. Never reveal or copy `.env*`, tokens, keys, credentials, service-role values, or user data.
4. Never access or mutate production databases or production environments.
5. Never push, deploy, merge, commit, rebase, or amend without an explicit user request.
6. Do not edit applied database migrations. UI work should not require schema changes.
7. Do not add paid services or paid-only dependencies. Prefer platform APIs, native HTML, existing packages, and mature free/open-source components.
8. Read `AGENTS.md`, `docs/PROJECT_STATE.md`, and the relevant repo-local Next.js 16 documentation before framework-sensitive changes.
9. Preserve authorization, tenant filtering, session integrity, scoring, exports, subscription guards, redirect destinations, and mutation semantics unless an evidence-backed task explicitly changes them.

## Product and visual contract

- VECTR Signal System: graphite/ink, warm white, restrained signal cyan, semantic green/amber/red, blue for neutral information.
- Identity comes from precision lines, status nodes, lifecycle rails, operational metadata, disciplined typography, and consistent geometry.
- Avoid violet glow, decorative glassmorphism, nested-card overload, pill soup, random gradients, giant rounded SaaS cards, and intrusive floating actions.
- Radius: controls 9px, surfaces 13px, dialogs/popovers 15px. Pills only for genuine status/tags.
- Spacing rhythm: 4/8/12/16/24/32px. Keep dense operational rows deliberate, not cramped.
- Light/dark themes change semantic token values, not component structure.
- No new `[class*="..."]` selectors and no `!important`-driven design patches.
- State must remain understandable without color alone.

## Interaction contract

- Use native HTML controls when they already provide the correct accessible behavior.
- Dialogs must contain focus, support Escape when safe, expose labelled title/description, focus Cancel first for destructive actions, and restore focus to the trigger.
- Destructive confirmation repeats the exact action label and keeps pending feedback visible until completion.
- Every mutation has local pending feedback and duplicate-submit protection.
- Field errors stay with fields; form errors stay at the form; page-level redirect feedback appears near the page header. Errors do not auto-dismiss.
- Preserve form input after failure. Native disabled is reserved for truly unavailable controls whose reason is visible.
- Keyboard access, visible focus, reduced motion, 320px layouts, 200% zoom, and touch targets are release requirements.

## Architecture goals

- One shared implementation per role: PageHeader, Surface, MetricStrip, Button, Status, Field, Select, FormSection, FormActions, Banner, EmptyState, AlertDialog, loading state, and overlay behavior.
- Migrate legacy `liquid-*` Admin styling route-by-route; do not patch it with more global selector overrides.
- Keep Candidate visual work separate from Candidate session/security logic.
- Extract pure view-model helpers only when duplication is proven. Keep domain decisions on trusted server boundaries.
- Prefer small route clusters and compatibility adapters over a giant rewrite.

## Execution loop

1. Run safety precheck and record the dirty baseline.
2. Deep-scan the complete route cluster, shared UI/CSS, actions, redirects, revalidation, policies, loaders, and tests.
3. State the root cause and smallest coherent checkpoint.
4. Add characterization coverage before replacing high-risk interaction code.
5. Implement the checkpoint without changing business semantics.
6. Run lint, dead-code analysis, build/type validation, targeted tests, keyboard checks, responsive checks, and diff review.
7. If a gate fails, diagnose, patch, and rerun. Continue until it passes; do not stop at the first failure.
8. Stop only for missing authority, an unavailable required input, a production/secret boundary, or a product decision that cannot be safely inferred.
9. After PASS, report changed files, preserved behavior, test evidence, residual risks, and the next checkpoint. Do not commit, push, or deploy.

## Continuation and model-effort protocol

- Treat every checkpoint as resumable. Record the current checkpoint, the last passing gate, the first failing gate (if any), and the next smallest action in the handoff message; when useful, also keep that note in a non-secret repository document.
- If a conversation or tool run is interrupted, do not assume completion. Re-run the safety precheck, inspect the current branch and dirty diff, verify the last claimed PASS, and continue from the first incomplete gate. Never restart by resetting or recreating the working tree.
- Keep routine inventory, focused scans, formatting, lint, dead-code checks, and ordinary test reruns on the configured compact reasoning mode. Use deeper reasoning only for high-risk authorization/domain boundaries, failing build or test diagnosis, accessibility focus/keyboard changes, or broad refactors; return to the compact mode after the gate is green.
- Model or effort changes are optional and host-controlled. A model switch never substitutes for evidence: the same PASS gates and diff review are required after any switch.
- “Resume later” means continue when the user sends a new message. Do not create background work, paid services, or scheduled jobs unless the user explicitly requests and authorizes them.

## Do-not-touch domain contracts

- Candidate heartbeat/save/flag/finalize concurrency and idempotency.
- Single-device and duplicate-tab protections.
- Candidate session signing, device identity, access-code protection, and credential export guards.
- Tenant/organization membership and authorization checks.
- Scoring, result aggregation, section/session correctness, and validated exports.
- Subscription/retention computation and write guards.
- Communication provider/idempotency and scheduled-send semantics.
- Proctor security/punishment/runtime-lock semantics.
- Existing Supabase migrations and production infrastructure.

## PASS definition

PASS requires clean targeted behavior, no new lint error, successful dead-code check, successful build/type gate, relevant automated tests, accessible keyboard/focus behavior, responsive review, safe diff review, and preserved domain semantics. A compiling UI alone is not PASS.
