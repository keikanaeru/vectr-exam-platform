# VECTR Exam Platform R8.1 — Build Fix

R8.1 memperbaiki semantic TypeScript error pada halaman Communication yang muncul saat `next build`.

## Root cause

Placeholder `{{kode_akses}}` dirender langsung sebagai JSX child:

```tsx
<p>{{kode_akses}} aman dipakai...</p>
```

JSX menganggapnya sebagai object literal, sehingga React/TypeScript menolak `kode_akses` sebagai React child.

## Fix

Placeholder dirender sebagai string literal:

```tsx
<p>{"{{kode_akses}}"} aman dipakai...</p>
```

Tidak ada perubahan database, schema, credential, atau flow email.

## Audit hardening

`npm run audit:release` sekarang juga mendeteksi placeholder `{{variable}}` yang tidak sengaja dirender sebagai raw JSX object di file TSX, sementara placeholder yang memang berada di string/template email tetap diizinkan.

## Setelah overwrite

```powershell
npm.cmd run verify
```

R8.1 belum dianggap production-pass sampai command tersebut selesai tanpa error pada environment lokal yang memiliki dependency dan koneksi Supabase lengkap.
