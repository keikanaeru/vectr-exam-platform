# Complete V2 — Acceptance Notes

This build supersedes the earlier `exam-platform-fixed` build.

## Fixes for the reported test failures

### Same participant with different candidate code
The supplied participant file contains:

- `P-008` — cihab — `230000008` — `peserta8@gmail.com`
- `P-009` — cihab — `230000008` — `peserta8@gmail.com`

V2 treats `P-009` as the same participant because NIK/NIM and email already appeared. Candidate code alone is no longer the only duplicate key.

### Credential only exported one participant
Existing exams previously kept only the assignment snapshot created on exam creation. V2 adds participant synchronization:

- Ujian page compares active batch count vs active assignment count.
- `Sinkronkan Peserta` adds missing assignments.
- `Generate Missing Access Code` performs sync automatically before generating codes.
- Credential Word/PDF/Excel cannot silently export an incomplete current batch.

### Hard Close confusion
V2:

- rejects new/existing edited schedules when Hard Close is already in the past,
- highlights past Hard Close on the Ujian card,
- allows schedule editing,
- allows CLOSED exams to reopen after the Hard Close is moved into the future.

### Incomplete admin management
V2 Owner Console supports create/edit/status/delete for organizations and admins, including display name, login email, optional new password, and multi-organization access.

### Missing question import
V2 provides question template, Excel/CSV import, skip/update duplicate mode, full question CRUD, and Excel export.

### UI inconsistency
All native `<select>` elements under `app` were replaced with custom Liquid Glass dropdowns. Exam date/time fields also use the custom WIB picker.

## Recommended acceptance test order

1. Login admin.
2. Switch organization, refresh, verify persistence.
3. Platform Owner: edit an organization name then restore it.
4. Create a test admin, edit display name/access, deactivate/reactivate, then delete.
5. Participant import using the supplied template: expect P-009 to be skipped when P-008 is new in the same file.
6. Import the same file again: existing identities should be skipped individually.
7. Create/edit/deactivate/reactivate a participant.
8. Module: create/edit a module.
9. Download question template, import questions, edit one question, export bank soal.
10. Create a DRAFT exam; edit module/batch/schedule.
11. Add/import another participant to its batch.
12. On Ujian, verify unsynced warning then click Generate Missing Access Code (auto-sync).
13. Verify Word/PDF/Excel credential count equals active batch count.
14. Set Hard Close in the future and activate/open the Participant Link.
15. Complete one participant attempt and export Hasil Excel.
