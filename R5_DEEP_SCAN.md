# R5 Deep Scan — Database Contract & End-to-End Boundary Repair

R5 dibuat setelah ditemukan pola bahwa beberapa halaman dapat membaca data dengan benar tetapi mutation berikutnya gagal saat tombol ditekan. Penyebabnya bukan satu komponen, melainkan kontrak source ↔ Supabase yang belum diverifikasi sebagai satu sistem.

## Temuan yang diperbaiki

1. **State database tidak pernah dinormalisasi oleh release sebelumnya.** Source menulis `modules.status = ACTIVE`, tetapi database V2 lama dapat masih memiliki CHECK/enum yang menolak state tersebut. R5 menormalisasi state contract Modul, Soal, Batch, Ujian, Sesi, candidate type, dan Communication.
2. **Admin read dan mutation memakai jalur Supabase yang berbeda.** Read tertentu masih melalui user/RLS client sementara mutation lain melalui service-role. R5 menyeragamkan admin server read/mutation setelah `requireAdminOrganization()`/platform-owner validation.
3. **Import peserta tidak mengisi `candidate_type`.** Sekarang import sama dengan create manual (`INDIVIDUAL`) dan batch wajib ACTIVE.
4. **`upsert(... onConflict)` mengasumsikan unique index yang belum pernah diverifikasi.** R5 memastikan/mengecek unique contract assignment, answer, result, session attempt, question/module code, candidate code, delivery queue, login rate, dan device lock.
5. **Flow DRAFT memang membutuhkan field nullable.** Credential assignment belum ada sebelum activation, flag-before-answer belum punya selected option/answered_at, dan participant/module/batch punya field optional. R5 memastikan nullability sesuai source tanpa menghapus data.
6. **Communication mereferensikan `exam_email_campaigns` dan `exam_email_deliveries`, tetapi release SQL sebelumnya tidak menjamin tabel itu ada.** R5 menambahkan storage contract lengkapnya.
7. **Dua participant import route tidak punya guard eksplisit.** Template/upload sekarang selalu memvalidasi admin organization.
8. **Resend diinisialisasi saat module import.** Jika `RESEND_API_KEY` kosong, area non-email dapat ikut gagal. R5 mengubah Resend menjadi lazy client; hanya aksi email yang memerlukan key.
9. **Error Supabase terlalu generik.** Mutation penting sekarang punya operation code + database error code/hint di development sehingga failure berikut tidak lagi tersembunyi sebagai “gagal diubah”.
10. **Candidate code matching memakai case-insensitive pattern.** Login candidate sekarang memakai exact match, menghindari wildcard/pattern match yang tidak semestinya.

## Pre-flight baru

`FINAL_SETUP.sql` membuat `exam_platform_healthcheck()` yang memeriksa seluruh tabel/kolom source, state contract, unique indexes, serta RPC V2 utama.

Jalankan setelah patch SQL:

```powershell
npm.cmd run audit:db
```

Jangan mulai UI testing sebelum keluar:

```text
[PRE-FLIGHT] PASS — env + schema + table/RPC contract siap untuk UI testing.
```

Semua halaman Admin sekarang juga menampilkan banner **DB CHECK REQUIRED** bila contract belum sehat, sehingga admin tidak perlu menebak tombol mana yang akan gagal. Platform Owner mendapat detail tambahan di halaman **Platform → Database Compatibility**.

## Batas verifikasi

Static source contract, local imports, route guards, SQL/source coverage, dan ZIP integrity dapat diverifikasi di paket. Live database milik deployment tetap harus lolos `audit:db` karena database V2 user tidak dapat dibaca dari sandbox tanpa izin connector. Production build harus dijalankan dengan `npm.cmd run verify` pada environment yang dependencies-nya sudah ter-install.
