# Exam Platform R6.2 — Runtime & UX Fix

Patch ini dibuat di atas R6.1.

## Fix utama
- Notifikasi error/success dipindah menjadi toast fixed yang selalu terlihat (desktop kanan-bawah, mobile full-width bawah). Error tidak auto-hilang.
- Jam/menit pada jadwal ujian dan jadwal Communication sekarang bisa diketik langsung; nilai di luar batas otomatis dijepit ke 00–23 / 00–59.
- Label `Batch` pada pembuatan/edit ujian menjadi `Batch Peserta`.
- `Durasi Total Ujian` dijelaskan sebagai `Timer Utama`, dengan ringkasan Total Sesi + Buffer/Jeda + Timer Utama.
- Durasi sesi dan timer utama bisa diketik langsung; timer utama otomatis minimal sama dengan total batas semua sesi.
- Candidate preparation tidak lagi memakai badge huruf P/Q/T; diganti icon yang bermakna.
- Jika organisasi belum upload logo, area logo tidak ditampilkan ke peserta (tidak ada placeholder logo palsu).
- Provisioning soal multi-modul tidak lagi bergantung pada PostgREST `ON CONFLICT(session_id,question_id)`, sehingga error `no unique or exclusion constraint matching the ON CONFLICT specification` tidak terjadi lagi.
- Retry Start/Resume dapat melengkapi soal sesi yang belum sempat dibuat setelah kegagalan sebelumnya.

## Instalasi dari R6.1
1. Stop `npm.cmd run dev` dengan Ctrl+C.
2. Copy seluruh isi ZIP patch ke root project dan Replace all.
3. Tidak perlu SQL ulang.
4. Tidak perlu npm install ulang.
5. Jalankan `npm.cmd run verify`.
6. Jika hijau, jalankan `npm.cmd run dev`.

## Catatan sesi yang sebelumnya gagal start
Tidak perlu menghapus peserta atau membuat ujian baru. Setelah patch, buka kembali Participant Link lalu pilih Mulai/Lanjutkan Ujian; provisioning akan membaca soal yang sudah ada dan hanya menambahkan yang masih kurang.
