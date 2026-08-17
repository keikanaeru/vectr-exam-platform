# Deep Scan R4

Release pass focused on functional consistency across admin mutations, exports, exam lifecycle, candidate/proctor integration, and database upgrade compatibility.

## Fixed in R4

- Standardized authenticated admin mutations to use the server admin Supabase client after `requireAdminOrganization()` validation, while keeping every operation scoped to the active organization/exam/module/batch.
- Covered Participant CRUD, participant import, Module CRUD, Question CRUD/import, Exam create/activate/close/schedule/reopen/delete/sync/credential generation, Exam Settings, and Communication campaign actions.
- Standardized credential/result/participant/question export routes to use the server admin client after admin authorization, removing RLS-dependent export behavior.
- Preserved the real logged-in admin ID for `created_by` by sourcing it from verified admin context before service-role DB writes.
- Added the missing upgrade migration for `proctor_events.client_event_at`. Older databases created by previous FINAL_SETUP versions otherwise fail deferred offline/page-leave audit inserts and proctor XLSX reads.
- Retained R2 navigation/icon/module dropdown fixes and R3 participant sync + credential fixes.

## Static verification

- TypeScript/TSX syntax parse: 85 files, 0 syntax errors.
- Admin mutation files using only user/RLS client: 0.
- Local changed-file import check: no missing `createAdminClient` imports.
- Literal internal navigation targets checked against current route structure.

## Database

Run the R4 `FINAL_SETUP.sql` again. It is idempotent and adds the missing `client_event_at` column for installations that already ran an older setup file.
