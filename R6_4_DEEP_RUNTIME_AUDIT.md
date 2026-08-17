# R6.4 Deep Runtime Audit

Baseline: R6.2 + R6.3. Fokus audit ini adalah dependency chain, bukan patch per tombol.

## Lifecycle yang diaudit

Candidate:
login -> preparation -> start/resume -> session creation -> question provisioning ->
section progress -> autosave/flag -> section finish -> transition -> next section ->
global timeout -> final submit -> score -> result.

Proctor:
heartbeat -> violation log -> threshold auto-submit -> page-leave beacon ->
force submit -> finalize overdue -> force submit all.

Admin:
exam draft update -> section replacement -> batch participant sync -> rollback consistency.

Theme:
Auto/Light/Dark -> page -> flash notification -> submit modal -> proctor warning ->
fullscreen gate -> screenshot shield -> device conflict -> result score core.

## Masalah yang ditemukan dan ditutup

1. Legacy exam lifecycle RPC masih menjadi dependency tersembunyi.
   - start_or_resume_exam_session dihapus dari runtime R6.
   - submit_and_score_exam_session dihapus dari runtime R6.
   - hanya health/admin-context RPC yang tersisa.

2. Error query lama dapat muncul lagi saat refresh.
   - Flash query sekarang one-shot dan dibersihkan dari URL segera setelah dirender.
   - Pesan generik R6.2/R6.3 lama dibersihkan server-side sebelum halaman persiapan dirender.

3. Candidate Light theme tidak menjangkau overlay/feedback.
   - FlashNotice, fullscreen overlay, screenshot shield, policy auto-submit,
     device conflict, submit modal, loading overlay, dan score core memakai semantic surfaces.
   - Tidak ada hard-coded dark candidate surface selain theme dropdown yang memang punya light override.

4. Provisioning multi-section tidak aman terhadap partial insert/race.
   - kelengkapan soal diverifikasi per section.
   - missing question diinsert satu per satu.
   - duplicate race diverifikasi, bukan diabaikan.
   - progress row missing direpair.
   - first section diaktifkan bila session lama nyangkut seluruhnya PENDING.

5. Section finish/start tidak retry-safe.
   - double click/retry completion tidak lagi menjadi false error.
   - start section yang sudah ACTIVE mengembalikan deadline aktual.
   - race update direcheck sebelum menyatakan gagal.

6. Start button dapat diklik berulang selama server action berjalan.
   - useFormStatus dipakai; tombol disabled dan menampilkan Menyiapkan sesi...

7. Scoring/submit sekarang satu engine.
   - score dihitung dari immutable session question snapshot.
   - candidate manual submit, global timeout, section final,
     violation auto-submit, page-leave auto-submit, proctor force submit,
     finalize overdue, dan bulk force-submit memakai finalizeExamSession yang sama.

8. Edit Draft dapat menghasilkan state setengah berubah.
   - core exam dikembalikan bila replace section gagal.
   - total timer divalidasi terhadap section existing pada ujian ACTIVE.
   - batch change tidak lagi delete semua assignment.
   - jika sync batch gagal, core/section dibalik dan assignment disinkronkan kembali ke batch lama.

9. Placeholder candidate.
   - candidate code/access login memakai SVG user/key, bukan ID/* pseudo-icon.
   - candidate page tanpa logo tidak membuat fallback letter-logo.

## Static verification

- TypeScript/TSX files parsed: 103
- Parser errors: 0
- Missing local imports: 0
- Legacy start/submit RPC references in app/lib: 0
- onConflict(session_id,question_id): 0
- window.confirm in candidate flow: 0
- Single-letter JSX placeholder in candidate flow: 0
- Candidate <main> without candidate-surface: 0
- Embedded .env.local in package: 0

## Build

Production Next.js semantic build masih harus dijalankan di mesin pengguna:
npm.cmd run verify

Alasan: dependency Next.js tidak tersedia lengkap di sandbox ini.
