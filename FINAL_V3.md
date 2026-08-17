# Final V3 — Exam Governance & Proctoring

Final V3 menutup gap utama V2 pada exam governance: pengaturan punishment sekarang bukan hanya tampilan admin, tetapi terhubung ke candidate runtime, server-side audit, enforcement, monitoring, dan result visibility.

## Yang ditambahkan

- Central `ExamPolicy` pada `exams.settings.exam_policy`.
- Admin **Pengaturan & Punishment** per exam.
- Punishment per violation (`LOG`, `COUNT`, `SUBMIT`).
- Fullscreen, focus/tab, PrintScreen best-effort, clipboard, context-menu, print/save/devtools shortcut, duplicate-tab, offline dan page-leave controls.
- Single-device session lock dengan heartbeat.
- Server-backed proctor event log + idempotency key.
- Server-side violation counting dan auto-submit.
- Audit-preserving reset counter checkpoint.
- Proctor Monitor + add time + extra time + release device + force submit.
- Proctor audit Excel export.
- Max attempt/resume/navigation/submit-confirm controls.
- Candidate pre-start rule acknowledgement.
- Configurable result visibility dan pass/fail threshold.
- Result Excel pass/fail column.

## QA source

- TypeScript parser scan: tidak ditemukan syntax/parser errors pada source final.
- Native `<select>` scan di `app`: 0.
- TODO/FIXME/HACK scan pada area exam/proctoring: 0.
- Full dependency type-check/build tetap harus dijalankan setelah `npm install` pada environment deployment karena dependency tidak disertakan dalam ZIP.
