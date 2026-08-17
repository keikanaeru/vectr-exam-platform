# R6.3 Start Session Fix

Fix utama:
- Candidate start/resume tidak lagi gagal total jika RPC legacy V2 `start_or_resume_exam_session`
  tidak kompatibel dengan engine multi-section R6.
- RPC lama tetap dicoba untuk backward compatibility.
- Jika RPC error, server R6 melakukan fallback session creation/resume dengan validasi yang
  sudah dilakukan aplikasi: ACTIVE/CLOSED resume, starts_at, hard_close_at, max attempts,
  allowResume, duration total, extra time, dan hard-close cap.
- Multi-section provisioning tetap dilakukan oleh `ensureExamSectionsForSession`.
- Jika fallback DB masih gagal, pesan error berikutnya akan menampilkan code + message DB,
  tidak lagi disamarkan menjadi "periksa jadwal".

Tidak perlu:
- SQL ulang
- npm install ulang
- ubah .env.local

Setelah overwrite:
1. npm.cmd run verify
2. npm.cmd run dev
3. Buka ulang halaman persiapan peserta dan klik Mulai / Lanjutkan Ujian.
