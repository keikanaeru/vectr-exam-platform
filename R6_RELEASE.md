# Exam Platform R6 — Accessibility, Branding & Multi-Section

R6 dibangun di atas R5.4 yang sudah lolos pre-flight dan production build pada environment pengguna.

## Fitur utama

- Tema peserta: **Auto / Terang / Gelap**. Auto mengikuti preferensi perangkat dan pilihan peserta disimpan di browser.
- Branding organisasi: admin dapat mengunggah logo PNG/JPG/WEBP (maks. 512 KB) dan nama tampilan.
- `Powered by Exam Platform` bersifat **opsional dan default OFF**. Tidak memakai istilah “Sponsored by”.
- Participant Link `/join/{examId}` menampilkan branding organisasi. `/candidate/login` tetap memakai branding platform generik karena organisasi belum diketahui sebelum konteks ujian/credential ditemukan.
- Konfirmasi submit memakai modal internal web, bukan `window.confirm`, sehingga tidak sengaja memicu dialog browser/fullscreen exit.
- Download admin dipisah menjadi **Link & Credential Peserta** dan **Hasil Ujian**. Hasil tersedia dalam Word, PDF, dan Excel.
- Multi-section exam: satu ujian dapat berisi sampai 10 modul berbeda dengan urutan dan batas waktu sesi masing-masing.
- Timer total ujian terus berjalan selama transisi antar sesi. Timer sesi berikutnya baru mulai saat peserta menekan tombol siap.
- Hasil akhir tetap memiliki skor overall, ditambah skor per modul/sesi.
- Bank soal/modul dikunci saat dipakai ujian `ACTIVE` agar peserta yang mulai pada waktu berbeda menerima snapshot yang konsisten.
- Ujian lama otomatis diperlakukan sebagai ujian satu sesi setelah migration R6.

## Aturan durasi

`Durasi Total Ujian` adalah batas global. Jumlah batas waktu semua sesi modul **tidak boleh melebihi** durasi total. Selisih waktu dapat menjadi buffer/jeda antar sesi, tetapi timer global tidak berhenti.

Contoh:

- Durasi total: 180 menit
- Modul A: 60 menit
- Modul B: 30 menit
- Modul C: 75 menit
- Buffer antar sesi/keleluasaan global: 15 menit

## Instalasi dari project R5.4 yang sudah berjalan

1. Stop `npm.cmd run dev` dengan `Ctrl + C`.
2. Overwrite isi patch R6 ke root project.
3. **Jangan ganti `.env.local`.**
4. Supabase SQL Editor: jalankan `R6_UPGRADE.sql` sekali. File ini idempotent dan juga menyediakan `exam_platform_r6_healthcheck()`.
5. Terminal:

   ```powershell
   npm.cmd run audit:db
   npm.cmd run verify
   ```

6. Hanya jika keduanya PASS, jalankan:

   ```powershell
   npm.cmd run dev
   ```

## Smoke test R6

Buat ujian dummy 2–3 modul dan cek:

1. branding + theme di Participant Link;
2. create exam multi-module + reorder;
3. activate exam (semua modul harus ACTIVE dan punya soal ACTIVE);
4. candidate start section 1;
5. submit section 1 via modal web;
6. halaman transisi muncul dan timer global terus berkurang;
7. start section 2 dan pastikan timer section baru mulai saat tombol siap ditekan;
8. final submit;
9. halaman result menunjukkan skor overall + per modul;
10. admin download hasil Word/PDF/Excel;
11. coba edit soal dari modul yang masih dipakai ujian ACTIVE — harus ditolak untuk menjaga fairness.

## Catatan QA

Static source QA R6 di sandbox:

- TypeScript/TSX parser: 0 syntax error
- Local import: 0 missing
- Candidate native `window.confirm`: 0
- Candidate placeholder icon huruf `E/U/M/P/I/A`: 0
- Secret scan: tidak ditemukan key/secret tertanam di source

Production `next build` R6 tetap harus dibuktikan melalui `npm.cmd run verify` di environment lokal karena sandbox pembuatan paket tidak memiliki dependency npm lengkap/internet.
