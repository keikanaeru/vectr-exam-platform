$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "========================================="
Write-Host "VECTR STATEFUL K6 V1.1 - RESUME 200"
Write-Host "========================================="

$envFile = Join-Path (Get-Location) ".env.stateful.local"
if (!(Test-Path $envFile)) { throw ".env.stateful.local tidak ditemukan." }

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (!$line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $key = $line.Substring(0, $i).Trim()
  $value = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  [Environment]::SetEnvironmentVariable($key, $value, "Process")
}

if (!$env:NEXT_PUBLIC_SUPABASE_URL -or !$env:SUPABASE_SECRET_KEY) {
  throw "Supabase env belum lengkap."
}

# VECTR STATEFUL SAFETY GUARD
try {
  $targetUri = [Uri]$env:NEXT_PUBLIC_SUPABASE_URL
  $targetRef = $targetUri.Host.Split(".")[0]
} catch {
  throw "NEXT_PUBLIC_SUPABASE_URL tidak valid."
}

if (
  $targetRef -eq "ihuxmsugczgbkoscnwkg" -or
  $env:NEXT_PUBLIC_SUPABASE_URL -match "ihuxmsugczgbkoscnwkg"
) {
  throw "STATEFUL LOAD BLOCKED: target adalah VECTR PRODUCTION Supabase."
}

$env:VECTR_STATEFUL_ENV_FILE = ".env.stateful.local"

Write-Host "[SAFETY] Dedicated stateful target: $targetRef"
Write-Host "[SAFETY] VECTR production target: BLOCKED"
$env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL

if (!(Test-Path "load-tests\.stateful-fixture.json")) {
  Write-Host "[PREP] fixture lama tidak ada; seed 200 baru..."
  node scripts\stateful-load-seed.mjs 200
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host "[PREP] memakai fixture 200 yang sudah ada dari test sebelumnya."
}

New-Item -ItemType Directory -Force -Path "load-tests\results" | Out-Null

Write-Host ""
Write-Host "========== STATEFUL 200 VU / 60s =========="
k6 run `
  -e USERS=200 `
  -e DURATION=60s `
  -e SUPABASE_URL=$env:SUPABASE_URL `
  -e SUPABASE_SECRET_KEY=$env:SUPABASE_SECRET_KEY `
  --summary-export "load-tests\results\stateful-200.json" `
  load-tests\stateful-exam.js

if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] 200 VU. Fixture dipertahankan untuk diagnosis."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "========== FINALIZE 200 CANDIDATES =========="
k6 run `
  -e USERS=200 `
  -e SUPABASE_URL=$env:SUPABASE_URL `
  -e SUPABASE_SECRET_KEY=$env:SUPABASE_SECRET_KEY `
  --summary-export "load-tests\results\stateful-submit-200.json" `
  load-tests\stateful-submit.js

if ($LASTEXITCODE -ne 0) {
  Write-Host "[FAIL] finalize 200. Fixture dipertahankan untuk diagnosis."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[PASS] 200 VU + finalize 200 passed."
Write-Host "[CLEANUP] removing load-test rows..."
node scripts\stateful-load-cleanup.mjs

Write-Host ""
Write-Host "========================================="
Write-Host "VECTR STATEFUL K6 V1.1 COMPLETE"
Write-Host "200 VU PASS | 200 FINALIZE PASS"
Write-Host "========================================="
