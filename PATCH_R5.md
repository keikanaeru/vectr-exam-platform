# R5 Deep Scan Patch

Patch ini untuk project R4 yang sudah berjalan. Tidak menambah dependency npm.

## Pasang
1. Stop dev server (`Ctrl + C`).
2. Copy seluruh isi folder patch ini ke root project dan Replace/Overwrite file yang sama.
3. Jangan ubah atau hapus `.env.local`.
4. Buka `FINAL_SETUP.sql` hasil patch, copy seluruh isi, jalankan di Supabase SQL Editor.
5. Di result terakhir SQL, buka nilai `exam_platform_health`. `ok` harus `true`.
6. Di terminal project jalankan `npm.cmd run audit:db`.
7. Hanya jika pre-flight PASS, jalankan `npm.cmd run dev`.
8. Hard refresh browser (`Ctrl + Shift + R`).

## Kalau health check gagal
Jangan lanjut klik tombol UI satu-satu. Copy seluruh JSON `exam_platform_health` atau output `npm.cmd run audit:db`; daftar `missing` menunjukkan semua contract DB yang belum cocok sekaligus.

## Production gate
Sebelum deploy jalankan:

```powershell
npm.cmd run verify
```

Perintah ini menjalankan DB pre-flight lalu production `next build`.
