# R8.3.1 — Session Question Upsert Repair

## Symptom

Starting an exam shows:

`Soal sesi gagal diprovision secara batch [42P10]: there is no unique or exclusion constraint matching the ON CONFLICT specification`

## Root cause

`lib/exam-sections.ts` in R8.2 provisions questions in batches using Supabase
`upsert(..., { onConflict: "session_id,question_id", ignoreDuplicates: true })`.

That requires PostgreSQL to infer a non-partial unique/exclusion rule for
`(session_id, question_id)`. A database that still has the older partial R6
index does not satisfy that conflict target.

This is a migration-contract regression: the application started depending on
the stronger index contract, while an already-upgraded database could retain
the older R6 index.

## Repair

The migration creates a new additive non-partial unique index:

`exam_platform_session_question_upsert_uidx_r831`

on:

`session_questions(session_id, question_id)`

No business data is deleted. If duplicate pairs exist, migration stops instead
of guessing which rows are safe to remove.

A failed Start can simply be retried after migration; provisioning is designed
to inspect existing rows and fill missing snapshot rows.
