# Exam Platform R2 UI + Exam Flow Patch

Patch ini memperbaiki tiga masalah yang ditemukan saat visual testing:

1. Import peserta tidak lagi menjadi tab utama. Import tetap tersedia di menu Peserta sebagai sub-flow.
2. Placeholder icon huruf diganti icon SVG konsisten untuk brand, nav, dashboard, dan profile.
3. Modul DRAFT kini dapat dipilih saat membuat Ujian DRAFT. Modul INACTIVE tidak dapat dipilih. Sebelum Ujian diaktifkan, modul wajib ACTIVE dan memiliki soal ACTIVE.

Tambahan:
- Tombol Aktifkan/Nonaktifkan Modul dipindahkan ke area aksi utama kartu modul.
- Modul tidak dapat diaktifkan bila belum memiliki soal ACTIVE.
- Dropdown kosong tidak lagi tampil sebagai popup kosong.

Tidak ada perubahan database, FINAL_SETUP.sql, package.json, atau environment variable.
