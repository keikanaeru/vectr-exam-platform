# VECTR Exam Platform R8.3 — Admin Speed & Action UX

Fokus release ini adalah halaman Platform Owner dan admin operational UI.

## Yang dipercepat

- Lookup akun Auth tidak lagi memakai `auth.admin.listUsers()` sampai 1000 user.
  R8.3 memakai RPC service-role langsung ke `auth.users` untuk lookup email dan directory.
- Onboarding pelanggan tidak lagi melakukan lookup akun Auth yang sama dua kali.
- Platform page tidak lagi menjalankan 3 healthcheck RPC tambahan setiap render.
  Healthcheck utama tetap berjalan dari Admin Layout.
- Invalidasi cache setelah mutation Platform dipersempit ke `/admin/platform` dan `/admin`.
- Precheck delete organisasi untuk modul/batch/peserta/ujian sekarang paralel (`Promise.all`).
- Ambient cursor glow admin dinonaktifkan.
- Backdrop blur, layered glass, dan entrance animation admin dipangkas melalui
  `admin-performance-shell`.

## UX action

- Tombol mutation sekarang memiliki state pending yang jelas: Mengirim, Menyimpan,
  Menghapus, Memperpanjang, dll.
- Scroll position disimpan sebelum server action dan dipulihkan setelah redirect,
  sehingga action tidak lagi terasa "mental ke atas".
- `FlashNotice` tetap menjadi toast fixed dan memberi status sukses/gagal.
- Success email menggunakan wording akurat: email "diterima Resend untuk dikirim".
  Ini berarti provider menerima request; bukan klaim bahwa inbox penerima sudah delivered.

## Delete semantics

### Hapus admin

Hanya menghapus:
- membership admin,
- `admin_profiles`,
- Supabase Auth user.

Tidak menghapus organisasi, modul, peserta, batch, ujian, atau hasil ujian.

### Hapus organisasi

Tetap fail-safe. Organisasi TIDAK boleh dihapus jika masih memiliki:
- modul,
- batch,
- peserta,
- ujian.

Jika masih ada data tersebut, gunakan Nonaktifkan supaya histori aman.

Jika organisasi memang kosong dan dihapus, membership admin dilepas. Admin yang setelah
itu tidak memiliki membership ke organisasi mana pun akan ikut dibersihkan dari profile
+ Supabase Auth. Admin multi-workspace tetap dipertahankan.
