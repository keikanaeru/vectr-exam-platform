# R5.2 Data API / REST patch

Fixes service-role Data API grants for all source tables and makes `npm run audit:db` show real PostgREST error codes instead of empty `NO_CODE` messages.

1. Copy `scripts/db-health.mjs` into the project.
2. Run `FIX_REST_GRANTS_R5_2.sql` in Supabase SQL Editor.
3. Run `npm.cmd run audit:db`.
