# R6.6 — Light Glass + Preview Ready

Fokus patch ini hanya polish visual/admin sebelum Preview Deployment.

- Light mode kembali memakai liquid glass translucency, bukan kartu putih opaque.
- Contrast menu/nav diperkuat agar item aktif dan nonaktif tidak menyaru.
- Sticky header diberi scrim lembut agar konten yang discroll tidak bertabrakan secara visual dengan glass header.
- Mouse-follow glow dimatikan khusus Light Mode karena terlihat seperti haze/noda pada background terang.
- Tema admin dipasang sebelum first paint dari localStorage/device preference untuk mengurangi flash gelap→terang saat load/navigasi.
- Indicator nav dipercepat agar perpindahan menu terasa lebih tegas.
- Ditambah admin/loading.tsx agar navigasi server-rendered menampilkan loading surface yang konsisten, bukan mempertahankan halaman lama terlalu lama.
- Tombol "Kelola Batch" di header kartu dihapus. Status tetap tampil sebagai status; edit status/hapus batch dipindahkan ke panel "Edit informasi batch".
- Tidak ada perubahan database, environment variable, atau dependency.

Sebelum Preview Vercel:
1. npm.cmd run verify
2. npm.cmd run dev dan smoke test Light + Dark
3. commit ke Git
4. deploy branch ke Vercel Preview
