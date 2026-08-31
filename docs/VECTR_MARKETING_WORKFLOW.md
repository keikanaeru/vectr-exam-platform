# VECTR Marketing Landing Workflow (Phase 3)

Dokumen ini adalah workflow persiapan saja. Landing page tidak dibangun sebelum Admin dan Participant lulus production gate.

## Gate sebelum Phase 3

- Admin + Participant: lint, typecheck, release audit, production build, dan smoke/E2E yang aman sudah pass.
- Migration database yang diperlukan sudah diterapkan melalui pipeline resmi dan preflight database pass.
- Ada owner untuk copy, legal/privacy, domain, CTA, dan follow-up calon organisasi.
- Tidak ada perubahan pada `/admin`, `/candidate`, policy ujian, atau database domain hanya demi landing page.

## M0 — Keputusan bisnis (checkpoint)

Tentukan ICP utama (sekolah, lembaga kursus, atau perusahaan), satu CTA utama (misalnya minta demo atau mulai workspace), area layanan, bahasa, dan apakah harga ditampilkan. Jika belum ada proses sales/support, gunakan CTA kontak manual; jangan menambah billing hanya karena landing page.

## M1 — Information architecture (checkpoint)

Susun halaman minimal: hero + CTA, bukti kepercayaan, masalah yang diselesaikan, alur `PLAN → CONTENT → PEOPLE → DELIVERY → LIVE → RESULTS`, manfaat Admin, manfaat Participant, FAQ, dan footer legal. Setiap tombol harus menuju tujuan nyata atau diberi status “segera hadir”.

## M2 — Content and design review (checkpoint)

Gunakan bahasa Indonesia yang jelas, klaim yang dapat dibuktikan, dan screenshot yang tidak memuat data peserta. Pertahankan VECTR Signal System: graphite/ink, warm white, signal cyan, serta green/amber/red semantik. Hindari dark navy/violet glow, glassmorphism berlebihan, pill soup, dan klaim “AI/aman” tanpa bukti.

## M3 — Implementasi terisolasi (checkpoint)

Bangun landing sebagai route publik terpisah dari auth dan aplikasi (`/` atau `/platform` sesuai keputusan domain). Reuse token visual yang sudah ada tanpa membawa state Admin/Participant ke client publik. Tidak ada akses database, service-role key, atau secret di bundle publik.

## M4 — Verification (checkpoint)

Uji keyboard/focus, reduced motion, kontras, mobile 320–430px, canonical metadata, Open Graph, robots/sitemap, link CTA, dan performance. Jalankan lint, typecheck, build, route smoke, serta link check. Screenshot/analytics harus opt-in dan tidak mengumpulkan data ujian.

## M5 — Publish decision

Review copy, legal, domain, dan CTA bersama owner. Hanya setelah approval eksplisit, lakukan deploy terpisah. Jika belum ada kebutuhan akuisisi, tetap gunakan outreach/manual marketing dan simpan landing sebagai backlog; tidak ada alasan teknis untuk memaksa Phase 3 sekarang.

## Output Phase 3

Brief satu halaman, sitemap, copy final, token/component map, daftar bukti yang diizinkan, checklist accessibility/performance, dan rollback plan. Phase 3 dianggap selesai hanya jika semua checkpoint pass dan jalur CTA benar-benar diterima oleh owner.
