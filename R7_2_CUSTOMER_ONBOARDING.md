# R7.2 Customer Onboarding & Branded Invite

Upgrade dari R7.1. Tidak membutuhkan SQL baru.

## Customer lifecycle

Platform Owner sekarang membuat pelanggan dalam satu form:
1. organisasi/tenant,
2. subscription 30 hari (trigger R7 yang sudah ada),
3. Admin Utama/PIC,
4. Supabase Auth invite link,
5. branded transactional email melalui Resend,
6. klien memverifikasi link lalu membuat password sendiri.

Tidak ada lagi password sementara yang dibuat/dibagikan Platform Owner.

## Existing account behavior

- Email belum ada di Auth: Supabase `generateLink(type: invite)` membuat invitation token.
- Email sudah ada tetapi belum aktif: magic-link token dipakai untuk melanjutkan aktivasi tanpa membuat user duplikat.
- Email sudah aktif: membership organisasi ditambah dan user mendapat email pemberitahuan akses baru.
- Reset password dari Platform Owner: recovery token dibuat dan dikirim via Resend.

## Anti-link-scanner

Email tidak langsung mengeksekusi token. Link membuka `/activate-account`, lalu user harus menekan tombol konfirmasi sebelum `verifyOtp` dijalankan. Ini mengurangi risiko link satu-kali terpakai oleh email security scanner/prefetch.

## Platform UI

- Form `Tambah Organisasi` + `Tambah Admin` digabung menjadi `Buat Pelanggan Baru`.
- Admin tambahan diundang dari kartu organisasi.
- Status akun: `UNDANGAN`, `AKUN AKTIF`, `NONAKTIF`.
- Pending admin: `Kirim Ulang Undangan`.
- Active admin: `Kirim Link Password`.
- Platform Owner tidak lagi mengatur password admin pelanggan.
- Status konfigurasi Resend terlihat pada form onboarding.

## TypeScript

`baseUrl` dihapus dari `tsconfig.json`. Alias `@/*` tetap menggunakan `paths` relatif ke `tsconfig.json`, sehingga warning deprecation TypeScript 7 hilang tanpa menonaktifkan warning.

## Resend

`RESEND_API_KEY` dibutuhkan. Untuk mengirim ke alamat klien nyata, gunakan `RESEND_FROM_EMAIL` dari domain yang sudah diverifikasi di Resend. `onboarding@resend.dev` hanya cocok untuk testing ke email akun Resend sendiri.

## Verify

Setelah overwrite patch:

```powershell
npm.cmd run verify
```

Tidak perlu menjalankan SQL baru atau `npm install`.
