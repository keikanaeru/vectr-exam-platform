# R8.3.2 — Finalizer RPC Ambiguity Repair

## Failure reproduced by Playwright/runtime

`Finalisasi ujian gagal [42702] column reference "session_id" is ambiguous.`

The R8.2 function returns a table with an output field named `session_id` and
also used bare `session_id` SQL references inside PL/pgSQL.

R8.3.2 keeps the public RPC signature unchanged, because the TypeScript client
expects `row.session_id`, but makes PostgreSQL resolve SQL names as table
columns and qualifies the UPDATE predicates.

## Why this was not caught by the prior pre-flight

The prior R8.2 healthcheck checked that the RPC existed, not that the finalizer
body was safe when executed. R8.3.2 adds a dedicated DB/static guard and wires
it into `npm run verify` through the installer.

## Scope

Database-function replacement only. No application data deletion and no
TypeScript runtime replacement.
