# Final Release Audit — 13 August 2026

## Release boundary

Project ini ditujukan sebagai upgrade aplikasi Exam Platform V2 yang sudah memiliki base schema/RPC Supabase. `FINAL_SETUP.sql` adalah patch final, bukan full database bootstrap.

## Last-pass fixes

- Master Proctoring sekarang benar-benar mematikan browser enforcement terkait.
- Start exam divalidasi server terhadap `starts_at` dan `hard_close_at`, dengan error ramah di candidate preparation.
- Hard Close menjadi batas mutlak: deadline sesi di-clamp, autosave/flag menolak setelah Hard Close, dan add-time admin tidak dapat melewatinya.
- Status CLOSED berarti **login baru ditutup**. Sesi ACTIVE tetap dapat login ulang/resume sebelum Hard Close; peserta yang belum punya sesi ACTIVE ditolak.
- Violation menyimpan punishment snapshot (`policy_action`, `counted`) saat event terjadi sehingga edit policy tidak menghitung ulang histori lama.
- Reset violation memakai checkpoint tanpa menghapus audit log.
- Offline event direplay setelah reconnect dengan timestamp putus koneksi asli.
- Candidate credential mendapat server-side brute-force throttling.
- Proctor Monitor menghitung COUNT event dari data counted server-backed, tidak bergantung hanya pada 1.000 event detail terbaru.
- Finalize Overdue dan Submit Semua Sesi Aktif ditambah untuk recovery/penutupan operasional.
- Delete DRAFT exam memeriksa histori session lewat `assignment_id`, konsisten dengan data model V2.
- Custom participant rules tetap tampil/harus diakui walaupun Proctoring OFF.

## Static QA performed

- Local import resolution scan.
- TypeScript syntax-focused compiler scan.
- Native `<select>` scan.
- Admin micro-text consistency scan.
- TODO/FIXME/HACK scan.
- Secret/.env artifact scan.
- ZIP integrity test sebelum handoff.

## Verification limitation

Full `next build` tidak dijadikan bukti pada sandbox ini karena dependency install tidak lengkap; `npm ci --offline` berhenti karena tarball `zod-validation-error` tidak tersedia di cache. Jalankan `npm install && npm run build` pada environment deployment yang memiliki akses registry sebelum production.

## Screenshot limitation

Browser web tidak bisa menjamin pencegahan screenshot OS, kamera/perangkat kedua, atau software capture di luar browser. Implementasi PrintScreen adalah best-effort detection + shield + audit/punishment.
