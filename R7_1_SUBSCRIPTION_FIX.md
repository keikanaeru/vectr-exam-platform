# R7.1 Subscription DB Compatibility Fix

Root cause yang ditutup:
- Source R7 sudah aktif tetapi tabel subscription belum tersedia / belum terbaca lewat Supabase Data API.
- Next.js dev overlay sebelumnya muncul karena recoverable Supabase read error ditulis sebagai `console.error`.

Perubahan:
- `R7_1_SUBSCRIPTION_REPAIR.sql` bersifat idempotent dan repair-safe.
- Membuat/repair dua tabel subscription, backfill tenant lama, trigger tenant baru, function state/renewal, RLS + service_role grants, dan PostgREST reload.
- Healthcheck R7.1 juga memeriksa grants dan jumlah subscription vs organisasi.
- UI tidak lagi memunculkan dev error overlay hanya karena subscription database belum siap.
- Platform Owner mendapat kartu setup DB yang jelas jika Data API subscription belum siap.
- Non-owner tetap fail-closed agar subscription tidak bisa dibypass.

Urutan setelah patch:
1. Jalankan `R7_1_SUBSCRIPTION_REPAIR.sql` di Supabase SQL Editor.
2. Pastikan payload akhir `health.ok = true` dan kedua `service_role_select_* = true`.
3. Jalankan `npm.cmd run audit:db`.
4. Jalankan `npm.cmd run verify`.
5. Baru `npm.cmd run dev`.
