# R7.3 — VECTR Pre-Production Release

## Fokus release

- Identitas perusahaan dipisahkan jelas: **VECTR** sebagai brand, **Exam Platform** sebagai produk, organisasi pelanggan tetap menjadi brand utama di portal peserta.
- Sender Resend production dibuat fail-closed: production tidak lagi diam-diam jatuh ke `resend.dev`.
- Link email memakai `NEXT_PUBLIC_SITE_URL` sebagai canonical origin sebelum fallback Vercel/request host.
- Flow `GET /auth/confirm` tidak lagi mengonsumsi one-time token. Token baru dipakai setelah manusia menekan tombol di `/activate-account`, sehingga lebih tahan terhadap email scanner/link preview.
- `Lupa password` admin sekarang memakai `generateLink(recovery)` + email VECTR melalui Resend, bukan email Supabase browser default.
- Metadata, export creator, admin shell, login, activation, password setup, dan optional powered-by sudah memakai VECTR.
- Asset `public/vectr-logo.png`, `public/vectr-mark.png`, dan `app/icon.png` ditambahkan.

## Environment sebelum production

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=https://app.vectrtech.my.id
SUPABASE_SECRET_KEY=
CANDIDATE_SESSION_SECRET=
ACCESS_CODE_ENCRYPTION_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=VECTR <noreply@vectrtech.my.id>
```

Untuk localhost, `NEXT_PUBLIC_SITE_URL` boleh dikosongkan agar link mengikuti `localhost:3000`.

## WAJIB sebelum Vercel

Secret pernah terlihat di screenshot selama development. Rotate/revoke nilai berikut sebelum production, lalu perbarui `.env.local` dan Environment Variables Vercel:

- `SUPABASE_SECRET_KEY`
- `CANDIDATE_SESSION_SECRET`
- `RESEND_API_KEY`
- `ACCESS_CODE_ENCRYPTION_KEY` — **perhatian:** jika credential ujian lama masih perlu didekripsi, jangan rotate key ini tanpa strategi migrasi/re-enkripsi. Untuk data dummy/pre-production, buat ulang credential setelah rotasi.
- secret lain yang pernah tampil di layar dan masih digunakan aplikasi.

`NEXT_PUBLIC_SUPABASE_URL` dan publishable key memang ditujukan untuk client, tetapi RLS/authorization tetap harus menjadi boundary keamanan.

## Checklist publish

1. Simpan `.env.local`, restart dev server, pastikan card Platform menampilkan **Email produksi siap**.
2. Jalankan `npm.cmd run audit:release`.
3. Jalankan `npm.cmd run verify` pada PC development yang memiliki dependency lengkap dan koneksi ke Supabase.
4. Tes end-to-end: onboarding customer → email invite → activate → set password → login.
5. Tes `Lupa password` ke akun aktif dan pastikan email datang dari `noreply@vectrtech.my.id`.
6. Rotate secret yang terekspos.
7. Push ke GitHub private.
8. Deploy Vercel Preview, isi seluruh environment variable.
9. Pasang `app.vectrtech.my.id` ke Vercel dan set `NEXT_PUBLIC_SITE_URL=https://app.vectrtech.my.id`.
10. Ulang smoke test candidate: login → start → section transition → punishment → submit → result/export.

## Keputusan scope

Fitur sponsor kegiatan tidak ditambahkan pada release ini. Sponsor adalah domain data/UI baru dan tidak layak dimasukkan tepat sebelum production tanpa schema, permissions, preview, dan regression test lengkap. Branding organisasi yang sudah ada tetap dipertahankan.
