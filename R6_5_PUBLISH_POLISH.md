# R6.5 — Publish Polish

Patch produksi setelah R6.4. Fokusnya bukan menambah engine ujian baru, tetapi menghilangkan friction UI/runtime yang masih terlihat saat trial.

## Runtime
- Memperbaiki `NEXT_REDIRECT` yang tertangkap oleh `try/catch` saat auto-finalize deadline.
- `redirect()` dilakukan setelah finalisasi sukses, bukan di dalam blok `try`.
- `npm run verify` sekarang menjalankan `audit:release` sebelum production build.

## Dropdown & filter
- `GlassSelect` dirender melalui portal fixed layer sehingga tidak lagi terpotong `overflow:hidden` card/form.
- Posisi dropdown mengikuti viewport, scroll, dan resize.
- Default value disinkronkan ulang setelah navigation/filter.
- Pencarian peserta menampilkan panel hasil yang eksplisit.
- Saat filter aktif, batch tanpa hasil disembunyikan dan panel CRUD batch disederhanakan agar peserta yang dicari langsung terlihat.

## Peserta
- Header hanya menampilkan `Import Peserta` dan `Export Peserta`.
- Download template tetap tersedia di halaman Import.
- Status peserta/batch menggunakan label Indonesia.

## Admin shell
- Menu akun admin sekarang memiliki Tema `Auto / Terang / Gelap` dan `Keluar dari Admin`.
- Tema terang mencakup card, form, navbar, toast, portal dropdown, dan modal konfirmasi.
- Header sticky dibuat lebih solid agar konten di belakang tidak terlihat tumpang tindih saat scroll.
- Browser-native `window.confirm()` di seluruh admin diganti modal web.

## Ujian
- `Credential lengkap` sekarang benar-benar status, bukan tombol palsu.
- Tombol perbaikan credential hanya muncul bila memang ada credential yang belum siap.
- Aksi buka/tutup login dipindahkan ke blok `Kontrol Ujian` agar jelas sebagai action, bukan status.
- Label status ujian diperjelas: AKTIF / LOGIN DITUTUP / DRAFT.

## Platform
- Card development `Database Compatibility · R6 / HEALTHY` tidak lagi tampil ketika sistem sehat.
- Detail teknis database hanya muncul bila ada masalah yang perlu tindakan.
- Copy UI produksi tidak lagi menyebut versi R5/R6 pada pesan yang terlihat pengguna.

## Sengaja tidak diubah di patch ini
- Tidak menambahkan tombol `Kembali ke Portal Peserta` di result page karena user meminta hanya opini, bukan eksekusi.
- Tidak menambahkan fitur sponsor event. Rekomendasi arsitektur: sponsor harus per-ujian/event (bukan branding organisasi global) dan sebaiknya ditambahkan setelah deployment pertama agar tidak menambah migration/storage risk menjelang ujian.

## Install
Tidak perlu SQL baru dan tidak perlu `npm install` ulang.

1. Overwrite patch ke project R6.4.
2. `npm.cmd run verify`
3. Jika PASS: `npm.cmd run dev`
4. Trial UI dan publish preview deployment.
