# VECTR Exam Platform — R8 Production Candidate

Tanggal audit: 17 Agustus 2026

R8 adalah deep-scan pre-production atas alur tenant, customer onboarding, bank soal, peserta, ujian multi-modul, credential, komunikasi email, runtime candidate, subscription, export, dan guard operasional. Release ini tidak menambah migration SQL baru; seluruh perubahan memanfaatkan schema R7 yang sudah ada.

## Arsitektur brand

- **VECTR** = perusahaan teknologi.
- **Exam Platform** = produk.
- **Organization** = customer/tenant.
- **Exam** = kegiatan/ujian/kompetisi/sertifikasi customer.
- Branding peserta tetap mengutamakan logo/nama penyelenggara; VECTR hadir sebagai platform/powered-by, bukan mengambil alih identitas acara.

Rekomendasi production:

- Corporate/home: `https://vectrtech.my.id`
- Exam Platform: `https://exam.vectrtech.my.id`
- Sender: `VECTR <noreply@vectrtech.my.id>`
- `NEXT_PUBLIC_SITE_URL=https://exam.vectrtech.my.id`

## Flow bisnis customer

1. Lead/deal dan pembayaran manual.
2. Platform Owner membuka **Tambah Pelanggan**.
3. Sistem membuat organisasi + subscription 30 hari + PIC/Admin Utama.
4. Supabase menghasilkan invite token; Resend mengirim email branded VECTR.
5. PIC membuka link, mengonfirmasi aktivasi, lalu membuat password sendiri.
6. Customer login dan mengelola tenant-nya.
7. Renewal, suspend, retention/export, dan archive ditangani dari Platform Owner.
8. Suspend sekarang ditolak selama masih ada ujian `ACTIVE`, agar peserta live tidak terputus karena aksi billing yang tidak disengaja.

Tidak ada password sementara.

## Flow operasional ujian yang direkomendasikan

1. **Branding organisasi** — nama, logo, identitas penyelenggara.
2. **Modul & Bank Soal** — buat/import soal, validasi, aktifkan modul.
3. **Batch & Peserta** — import peserta, email, identitas, status.
4. **Buat Ujian** — pilih batch, satu atau beberapa modul/sesi, total timer, timer per sesi, jadwal, rules.
5. **Kesiapan Ujian** — sistem memblokir aktivasi bila batch/modul/soal/jadwal/durasi belum valid.
6. **Aktifkan Ujian** — peserta disinkronkan; security, punishment, session control, instruksi, modul/bank soal, serta identity login peserta yang terkait ujian live dikunci agar aturan tidak berubah di tengah pelaksanaan.
7. **Credential** — generate/perbaiki kode peserta & access code; export PDF/DOCX/XLSX/CSV memakai canonical public URL.
8. **Komunikasi** — buat kampanye, test email, siapkan antrean, review, kirim sekarang atau jadwalkan.
9. **Pelaksanaan** — Participant Link, login credential, global timer, timer per sesi, fullscreen/punishment/proctor/session control.
10. **Tutup login / selesai** — hasil per modul dan keseluruhan, visibility hasil, export, archive.

## Deep-scan utama R8

### Communication/Resend diselesaikan end-to-end

Sebelumnya flow communication memang belum lengkap untuk credential peserta. R8 menyelesaikan:

- `{{kode_akses}}` menjadi variabel email yang valid.
- Access code didekripsi **hanya di memory tepat sebelum request ke Resend**.
- Plaintext access code tidak disimpan ke `exam_email_deliveries`.
- Access code dilarang di subject email agar tidak muncul di lock-screen notification.
- Template juga mendukung nama peserta, kode peserta, organisasi, ujian, login-open, mulai, hard-close, durasi, dan tautan peserta.
- Test email memakai identitas/kode dummy dan tidak mengubah delivery peserta.
- Queue hanya mengambil peserta aktif dari batch ujian yang sekarang.
- Sebelum send/schedule, penerima divalidasi ulang untuk mencegah stale batch/email/assignment.
- Queue tidak boleh direbuild setelah ada provider history agar email yang sudah pernah diproses tidak terkirim dua kali.
- Retry hanya mengulang kegagalan yang belum pernah memiliki provider message ID.
- Scheduled email dapat dibatalkan melalui provider.
- Status provider dapat disinkronkan manual dari Resend.
- Email credential hanya boleh dikirim saat ujian `ACTIVE` dan sebelum Hard Close.
- Schedule email dibatasi maksimal 30 hari dan tidak boleh melewati Hard Close/subscription.
- UI detail kampanye mengunci send/schedule bila sender production belum siap.

### Konsistensi peserta

- Assignment sekarang diaudit berdasarkan candidate ID, bukan sekadar jumlah.
- Peserta yang dipindah batch menghasilkan status assignment stale dan harus disinkronkan.
- Export credential diblokir sampai assignment sinkron.
- Perubahan peserta diblokir bila masih ada email provider terjadwal.
- Saat peserta terhubung ke ujian `ACTIVE`, kode peserta dan batch dikunci; status master peserta juga tidak bisa dinonaktifkan. Penanganan peserta live dilakukan melalui proctor/session control.

### Konsistensi modul dan bank soal

- Modul dan soal yang sedang dipakai ujian `ACTIVE` dikunci dari edit/status mutation.
- Ini mencegah peserta yang mulai pada waktu berbeda menerima bank/rule yang berbeda.

### Fairness runtime

Setelah ujian bukan `DRAFT`, Security, Punishment, Session Control, dan Instruksi dikunci. Result Visibility tetap dapat diubah setelah aktivasi sehingga admin masih bisa publish/hide hasil tanpa mengubah aturan ujian.

### Canonical URL

Link email auth, communication, dan seluruh credential export memakai `NEXT_PUBLIC_SITE_URL` bila tersedia. Ini mencegah link produksi tergantung host request/preview URL yang kebetulan sedang dipakai admin.

### Auth email

- Invite/recovery memakai branded Resend email.
- Token Supabase tidak dikonsumsi pada GET `/auth/confirm`; user masuk activation gate dahulu sehingga link-preview/email scanner tidak menghabiskan token sebelum manusia membukanya.
- Session activation/recovery di-sign-out setelah password selesai dibuat.

## Environment production

`.env.local` lokal / Vercel Environment Variables:

```env
NEXT_PUBLIC_SITE_URL=https://exam.vectrtech.my.id
RESEND_API_KEY=...
RESEND_FROM_EMAIL="VECTR <noreply@vectrtech.my.id>"
RESEND_REPLY_TO_EMAIL=
```

`RESEND_REPLY_TO_EMAIL` opsional. Kosongkan jika belum mempunyai inbox reply resmi.

## Security sebelum production

Secret yang pernah terlihat di screenshot/chat harus dianggap terekspos. Sebelum production:

- rotate `SUPABASE_SECRET_KEY`;
- rotate `RESEND_API_KEY`;
- generate ulang `CANDIDATE_SESSION_SECRET`;
- rotate secret/token-encryption key yang terekspos sesuai dampak data yang sudah terenkripsi;
- jangan commit `.env.local` ke GitHub.

Jika `ACCESS_CODE_ENCRYPTION_KEY` dirotasi, credential yang dienkripsi dengan key lama tidak bisa dibaca lagi. Jika database saat ini hanya dummy/testing, paling bersih rotate lalu generate ulang semua credential sebelum trial production.

## Validasi R8 di paket

Static checks yang dilakukan pada source release:

- release contract audit;
- TypeScript/TSX parser syntax scan;
- local import resolution scan;
- browser-native confirm/alert/prompt scan;
- native `<select>` scan;
- TODO/FIXME/HACK / ts-ignore / `as any` scan;
- obvious inline secret pattern scan;
- redirect-inside-try scan;
- admin read/write/export subscription-boundary audit.

Full `next build` **tetap harus dijalankan di PC project** karena paket release tidak membawa `.env.local` dan `node_modules`, dan environment audit memerlukan Supabase project nyata.

Jalankan:

```powershell
npm.cmd run verify
```

Lanjut hanya jika command tersebut PASS.

## Smoke test sebelum Vercel

1. Platform Owner login.
2. Banner Platform menunjukkan **Email produksi siap**.
3. Buat customer dummy dengan Gmail lain → invite masuk → set password → login admin.
4. Forgot password → email recovery → password baru → login.
5. Buat modul dummy + minimal soal aktif.
6. Import/buat batch dan 3 peserta dengan email dummy.
7. Buat ujian 2–3 modul; cek Kesiapan Ujian.
8. Aktifkan → pastikan runtime policy dan bank soal terkunci.
9. Generate credential → export PDF/DOCX/XLSX/CSV → tautan mengarah ke canonical app URL.
10. Communication → Test Email → Siapkan Antrean → Review → Kirim ke email dummy.
11. Buat scheduled test → cancel → sync status Resend.
12. Login candidate → kerjakan lintas sesi → submit → cek hasil per modul + overall.
13. Test tab-switch/fullscreen/punishment/proctor.
14. Test dark/light di admin dan candidate termasuk modal/toast/dropdown.
15. Test suspend customer: harus ditolak saat ujian ACTIVE; setelah ujian ditutup baru boleh suspend.
16. Jalankan kembali `npm.cmd run verify`.

## Catatan operasional email

Email bukan satu-satunya jalur credential. Tetap pertahankan export credential sebagai fallback event-day. Sebelum kampanye besar, cek quota dan deliverability provider di dashboard Resend; jangan pertama kali menguji mass-send pada hari ujian.

Webhook otomatis Resend sengaja belum ditambahkan pada release ini. R8 memakai **Sinkronkan Status Resend** secara eksplisit sehingga tidak menambah endpoint secret, signature verification, atau migration idempotency baru tepat sebelum production. Webhook dapat menjadi upgrade setelah Vercel Preview stabil.

## Tidak ada SQL baru

R8 tidak memerlukan migration SQL tambahan. Jangan menjalankan repair/reset database baru hanya untuk memasang release ini.
