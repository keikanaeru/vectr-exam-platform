# R7 — Subscription & Customer Lifecycle

## Terminologi

- `organization` tetap dipakai sebagai istilah teknis tenant/database karena paling luas: sekolah, kampus, perusahaan, lembaga, komunitas, dan panitia lomba semuanya masih cocok.
- Area Platform Owner memakai konteks `Pelanggan & Langganan` untuk sisi komersial.

## Lifecycle

1. **FULL** — 30 hari akses penuh.
   - Admin dapat create/edit/delete/import/communication/proctor/branding/settings.
   - Peserta dapat memulai sesi baru.
   - Export tetap tersedia.
2. **EXPORT_ONLY** — otomatis setelah 30 hari, selama 90 hari.
   - Admin masih dapat login, membaca data, search/filter, dan export.
   - Semua mutation server-side diblokir.
   - Import/template operasional diblokir.
   - Peserta tidak dapat membuat sesi baru.
   - Sesi peserta yang sudah ACTIVE tetap dapat dilanjutkan sampai deadline/hard close.
3. **PURGE_DUE** — setelah 90 hari masa retensi selesai.
   - Workspace pelanggan dikunci.
   - Export juga tidak tersedia.
   - Data belum dihapus otomatis.
4. **SUSPENDED** — override manual Platform Owner.

## Kenapa data tidak auto-delete pada R7

Permanent deletion sengaja tidak dijalankan otomatis pada release pertama subscription. Kesalahan pembayaran, lupa memperpanjang, atau salah konfigurasi tanggal tidak boleh langsung menghancurkan histori ujian. Setelah retention habis, workspace dikunci dan Platform Owner dapat menonaktifkan organisasi. Permanent tenant purge dapat ditambahkan setelah prosedur backup/restore produksi sudah diuji.

## Platform Owner

Pada `/admin/platform` tersedia:

- status subscription tiap pelanggan;
- tanggal akses penuh berakhir;
- tanggal retensi berakhir;
- `+30 Hari` untuk renewal bulanan;
- suspend/resume dengan alasan;
- warning bila retention sudah habis.

Renewal menggunakan rule:

- jika masih aktif: tambah 30 hari dari expiry sekarang;
- jika sudah expired: mulai 30 hari baru dari waktu renewal;
- retention selalu diperpanjang menjadi 90 hari setelah access expiry baru.

## Deep-scan boundaries

Subscription gate diterapkan ke:

- Dashboard/admin read access;
- Modul CRUD + question CRUD/import;
- Peserta CRUD + batch CRUD/import;
- Ujian create/edit/activate/close/reopen/sync credential;
- Settings & punishment;
- Branding;
- Communication;
- Proctor mutation;
- Participant/question/result/credential/proctor export;
- Candidate global login;
- Candidate exam share-link login;
- Candidate preparation/start session;
- Active-session resume behavior;
- Data API preflight + release audit.

Platform Owner bypass subscription write restriction untuk kebutuhan support/renewal.

## Install

1. Overwrite patch source.
2. Jalankan `R7_SUBSCRIPTION_UPGRADE.sql` sekali di Supabase SQL Editor.
3. Jalankan `npm.cmd run verify`.
4. Pastikan healthcheck R5/R6/R7 dan production build PASS.
5. Baru jalankan `npm.cmd run dev` atau deploy Preview Vercel.

## Billing

R7 adalah **subscription access engine**, belum payment gateway. Setelah pembayaran diterima secara manual, Platform Owner klik `+30 Hari`. Payment automation (Midtrans/Xendit/Stripe/dll.) dapat dihubungkan kemudian tanpa mengubah lifecycle akses ini.

## Deep-scan tambahan: operasi bertanggal masa depan

Subscription tidak hanya dicek saat tombol ditekan. R7 juga mencegah admin organisasi membuat, mengaktifkan, membuka kembali, atau mengubah ujian dengan **Hard Close yang melewati `access_until`**. Campaign email terjadwal juga tidak boleh dijadwalkan sesudah masa aktif berakhir. Ini mencegah konfigurasi terlihat valid hari ini tetapi gagal saat hari ujian tiba. Platform Owner tetap dapat melakukan support override.

## Penghapusan setelah retensi

R7 sengaja **tidak melakukan auto-delete permanen**. Setelah 90 hari mode export-only berakhir, workspace masuk `PURGE_DUE` dan dikunci. Penghapusan permanen dilakukan manual oleh Platform Owner setelah memastikan pembayaran, backup, dan kebutuhan pemulihan. Akun Auth juga tidak otomatis dihapus karena satu user dapat memiliki akses ke lebih dari satu organisasi.
