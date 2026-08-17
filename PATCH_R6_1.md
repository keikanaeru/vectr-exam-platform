# R6.1 Build Fix

Fix:
1. Next.js 16 Response body compatibility untuk PDF hasil ujian.
2. ResultExportRow contextual typing agar field score tetap number | "".

Tidak perlu:
- SQL ulang
- npm install ulang
- ubah .env.local

Setelah overwrite:
npm.cmd run verify
