# Exam Platform — Final

Platform ujian multi-organisasi berbasis Next.js 16, React 19, dan Supabase untuk ujian, kompetisi, pelatihan, dan sertifikasi.

## Setup

> **Penting:** paket ini adalah **upgrade dari database V2 yang sudah ada**, bukan bootstrap database Supabase kosong. Base schema + RPC V2 (`start_or_resume_exam_session`, `submit_and_score_exam_session`, dan tabel inti ujian) harus sudah tersedia.

1. Extract project.
2. Copy `.env.local` milik deployment V2 ke root project dan cocokkan dengan `.env.example`.
3. Jalankan `FINAL_SETUP.sql` **R5 terbaru** di Supabase SQL Editor. Baris terakhir akan menjalankan `exam_platform_healthcheck()` dan menampilkan semua gap schema/RPC yang masih tersisa sekaligus. Jangan lanjut UI testing sampai payload health menunjukkan `"ok": true`.
4. Install dependency: `npm install` (di Windows/PowerShell yang memblok `npm.ps1`, gunakan `npm.cmd install`).
5. Jalankan pre-flight database: `npm run audit:db` atau `npm.cmd run audit:db`. Wajib berakhir dengan `[PRE-FLIGHT] PASS`.
6. Jalankan lokal: `npm run dev` / `npm.cmd run dev`.
7. Sebelum production: `npm run verify` / `npm.cmd run verify`. Script ini menjalankan database pre-flight lalu production build. 

Environment wajib: Supabase URL/publishable/secret key, `CANDIDATE_SESSION_SECRET`, dan `ACCESS_CODE_ENCRYPTION_KEY`. Resend hanya diperlukan bila fitur communication email dipakai.

## Fitur utama

### Platform & Admin
- Multi-organization + owner/admin management.
- Batch dan participant CRUD/import/export dengan duplicate detection.
- Module/question bank CRUD, template/import/export, bobot, shuffle question dan option.
- Exam create/edit, login-open, start, hard-close, duration, activate/close/reopen.
- Participant assignment sync dan unique access code.
- Credential export Word/PDF/Excel dan result export Excel.
- Communication/campaign flow yang sudah ada pada V2 tetap dipertahankan.

### Exam Security & Punishment
Setiap ujian memiliki halaman **Pengaturan & Punishment** dengan policy terpusat:
- Proctoring ON/OFF.
- Wajib fullscreen.
- Deteksi tab/app hidden dan window blur.
- Deteksi `PrintScreen` best-effort.
- Duplicate-tab detection.
- Single-device lock untuk credential yang sama.
- Block copy/cut/paste, right-click, print, save page, shortcut devtools, dan optional text selection.
- Offline event logging tertunda: timestamp putus koneksi disimpan di browser lalu dikirim saat koneksi kembali.
- Reload/page-leave logging + browser leave warning.
- Punishment per event: `LOG`, `COUNT`, atau `AUTO SUBMIT`.
- Violation limit + optional auto-submit saat limit tercapai.

### Session Control
- Maximum attempts.
- Allow/disallow resume.
- Allow/disallow kembali ke soal sebelumnya.
- Submit confirmation.
- Optional question-code visibility.
- Autosave jawaban, flag soal, server deadline recovery.
- Per-participant extra time sebelum start.
- Pengawas dapat menambah waktu ke sesi aktif tanpa menembus Hard Close.
- Hard Close diperlakukan sebagai batas mutlak pengerjaan.
- Ujian CLOSED menghentikan login baru, tetapi sesi yang sudah ACTIVE tetap dapat login ulang/resume sebelum Hard Close.
- Force submit satu peserta maupun semua sesi aktif dari Proctor Monitor.
- Finalize Overdue untuk memfinalisasi sesi ACTIVE yang deadline/Hard Close-nya sudah lewat.

### Proctor Monitor
- Auto-refresh live monitoring.
- Status peserta, attempt, heartbeat/last seen, deadline, violation count server-backed.
- Event terakhir per peserta.
- Release single-device lock.
- Reset violation **counter** tanpa menghapus audit historis.
- Force submit.
- Audit-event table.
- Export audit proctoring ke Excel.

### Result Visibility
Admin dapat menentukan apakah peserta boleh melihat:
- halaman hasil,
- nilai akhir,
- benar/salah/kosong,
- completion summary,
- status Lulus/Tidak Lulus,
- passing score.

## Catatan keamanan screenshot

Web browser tidak dapat menjamin screenshot OS terblokir 100% dan tidak dapat mendeteksi kamera/perangkat kedua. Implementasi memakai best-effort `PrintScreen` detection, screen shield, audit event, warning, dan punishment. Jangan mengiklankan fitur ini sebagai DRM atau screenshot prevention absolut.

## Database patch

`FINAL_SETUP.sql` R5 menambah/memperbarui:
- `proctor_events` termasuk snapshot `policy_action` + `counted` agar perubahan punishment tidak mengubah histori lama secara retroaktif,
- `proctor_client_locks`, `proctor_violation_resets`, dan `candidate_login_rate_limits`,
- storage Communication: `exam_email_campaigns` + `exam_email_deliveries`,
- compatibility contract untuk status Modul/Soal/Batch/Ujian/Sesi,
- nullable contract yang memang diperlukan flow draft/autosave (`exam_assignments` credential dan `answers`),
- unique index yang diperlukan seluruh `upsert/onConflict`, hanya jika data existing tidak duplikat,
- `exam_platform_healthcheck()` untuk memeriksa tabel, kolom, state contract, unique index, dan RPC V2 sekaligus.

Admin CRUD/read/export dijalankan server-side setelah admin + organisasi aktif diverifikasi. Fitur email sekarang lazy-loaded: `RESEND_API_KEY` yang kosong hanya menonaktifkan Communication, tidak merusak area ujian lain.


## Pre-flight sebelum klik UI

Setelah `FINAL_SETUP.sql` R5 selesai, jalankan:

```bash
npm.cmd run audit:db
```

Target akhir:

```text
[PRE-FLIGHT] PASS — env + schema + table/RPC contract siap untuk UI testing.
```

Kalau pre-flight menampilkan beberapa item `Missing`, perbaiki **semuanya sekaligus** sebelum mengetes tombol admin/candidate. Ini sengaja dibuat agar mismatch database tidak baru ditemukan satu per satu dari UI.

## Acceptance test

1. Buat/aktifkan exam dan buka **Pengaturan & Punishment**.
2. Set tab switch = COUNT, PrintScreen = COUNT atau AUTO SUBMIT, violation limit = 3.
3. Login sebagai peserta dan konfirmasi aturan sebelum start.
4. Uji tab switch, copy/paste, klik kanan, PrintScreen, fullscreen exit, offline, dan duplicate tab sesuai policy.
5. Buka credential yang sama pada perangkat/browser lain dan pastikan single-device lock muncul.
6. Pantau event dan heartbeat di **Proctor Monitor**.
7. Reset counter; pastikan counter kembali dari checkpoint tetapi audit lama tetap tampil/exportable.
8. Uji add time dekat Hard Close; pastikan deadline tidak bisa melewati Hard Close.
9. Saat ada sesi ACTIVE, klik **Tutup Login Baru**; pastikan peserta baru ditolak tetapi peserta ACTIVE bisa login ulang/resume.
10. Tutup browser peserta sampai deadline lewat, lalu uji **Finalize Overdue**.
11. Uji **Submit Semua Sesi Aktif** pada exam dummy.
12. Uji maximum attempt + resume policy.
13. Uji Result Visibility dan passing score.
14. Salah login >8 kali pada credential dummy dan pastikan throttling aktif.
15. Export Result Excel dan Proctor Audit Excel.
