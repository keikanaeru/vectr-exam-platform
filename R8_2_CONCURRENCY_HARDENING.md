# VECTR Exam Platform R8.2 — Concurrency Hardening

Target operasional: **100–200 peserta mengerjakan ujian secara bersamaan** pada satu event organisasi.

R8.2 tidak mengubah workflow admin/peserta. Fokus release ini adalah mengurangi request fan-out ke Supabase, meratakan burst traffic, membuat finalisasi atomic, dan memperkuat single-device lock.

## Perubahan inti

### 1. Start / Resume tidak lagi insert soal satu per satu

Sebelumnya snapshot `session_questions` diprovision dengan satu request database per soal. Pada 200 peserta × 50 soal, jalur ini dapat menghasilkan sekitar 10.000 operasi insert terpisah ketika peserta menekan Mulai hampir bersamaan.

R8.2:
- module source dibaca secara batch;
- bank soal dibaca secara batch;
- shuffle dibuat deterministic per `session_id`, sehingga retry/concurrent start menghasilkan urutan yang sama;
- snapshot soal di-upsert dalam batch maksimal 100 row;
- progress section di-upsert sekaligus;
- `exam_sessions.snapshot_ready_at` menjadi fast-path sehingga reload/transition berikutnya tidak melakukan provisioning scan ulang.

### 2. Heartbeat menjadi satu RPC atomic + jitter

Sebelumnya satu heartbeat melakukan beberapa roundtrip (session, assignment, exam, device lock, update session). Browser juga heartbeat pada interval tetap 25 detik sehingga peserta yang start bersamaan dapat sinkron.

R8.2:
- `exam_candidate_heartbeat_r82` mengerjakan validasi + lease device + last_seen dalam satu database transaction;
- heartbeat browser disebar dengan initial jitter dan interval random 25–35 detik;
- heartbeat tetap aktif jika `enforceSingleDevice` ON walaupun proctoring umum OFF.

### 3. Autosave jawaban/flag menjadi satu RPC atomic

`saveAnswer` dan `saveFlag` tidak lagi melakukan 5–6 roundtrip validasi + write.

R8.2 menggunakan:
- `exam_candidate_save_answer_r82`;
- `exam_candidate_save_flag_r82`.

Keduanya memvalidasi candidate, assignment, session, global deadline, hard close, section deadline, dan device lease di database transaction yang sama.

### 4. Finalisasi + scoring menjadi satu RPC atomic

`finalizeExamSession()` sekarang memakai `exam_finalize_session_r82`.

Database akan:
- row-lock session;
- membaca snapshot + jawaban;
- menghitung benar/salah/kosong dan score;
- upsert result;
- menutup section;
- menutup session;
- commit sebagai satu transaction.

Ini juga mencegah race "jawaban terakhir masuk setelah score dihitung" pada batas waktu.

Bulk force-submit/finalize dari Proctor Monitor memakai worker pool concurrency 8 supaya 100–200 session tidak diproses sequential satu per satu dan juga tidak menembak database tanpa batas.

### 5. Single-device lock diperkeras

**Policy default tetap SATU perangkat aktif, bukan dua.**

R8.2 menambahkan `candidate_device` server-issued cookie dan `deviceId` ke signed candidate session token. Device lease divalidasi pada:
- heartbeat;
- save answer;
- save flag;
- membuka halaman pengerjaan (`/take`);
- submit;
- complete section;
- start section.

Device lain dengan credential yang sama tidak dapat menulis jawaban selama lease perangkat pertama masih fresh. Lease dapat diambil alih setelah 90 detik tanpa heartbeat, atau pengawas dapat menekan **Release Device Lock** di Proctor Monitor.

> Deploy R8.2 sebelum hari ujian. Candidate session R8.1 yang belum memiliki `deviceId` akan diminta login ulang setelah upgrade.

## Database migration wajib

Jalankan file berikut di Supabase SQL Editor **sebelum deploy source R8.2**:

```text
supabase/migrations/20260817000100_r8_2_concurrency_hardening.sql
```

Migration bersifat additive: menambah marker/index/RPC dan tidak menghapus data ujian.

## Urutan rollout aman

1. Backup/commit R8.1 yang sekarang.
2. Jalankan migration R8.2 di Supabase SQL Editor.
3. Replace source dengan patch R8.2.
4. Jalankan:

```powershell
npm.cmd run verify
```

5. Test localhost: login peserta, jawab, flag, pindah section, submit.
6. Test device lock dengan credential yang sama di dua browser/perangkat.
7. Commit + push ke branch preview.
8. Smoke test `exam.vectrtech.my.id` setelah merge ke `main`.

## Event-day checklist untuk 100–200 peserta

- Pastikan `npm.cmd run verify` PASS setelah migration.
- Pastikan Vercel Function Region ditempatkan sedekat mungkin dengan region database Supabase.
- Login window boleh dibuka lebih awal supaya login tidak menumpuk tepat pada detik start.
- Jangan melakukan import massal / regenerasi credential / edit bank soal saat ujian ACTIVE.
- Buka satu Proctor Monitor saja per pengawas yang memang perlu.
- Lakukan rehearsal sebelum event: 20 → 50 → 100 → target 200 client bila memungkinkan.
- Pantau Vercel Runtime Logs dan Supabase Database/API logs saat rehearsal.

## Batas klaim

R8.2 secara desain menghilangkan bottleneck paling jelas untuk target 100–200, tetapi angka concurrency bukan SLA. Supabase Free/Nano memakai shared CPU; performa nyata tetap dipengaruhi jumlah soal, jumlah section, violation rate, lokasi region, ukuran database, dan kondisi platform saat event. Rehearsal tetap wajib untuk event penting.
