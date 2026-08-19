$ErrorActionPreference = "Stop"

Write-Host "========================================="
Write-Host "VECTR Golden Full V2 - ONE SHOT"
Write-Host "========================================="

foreach ($port in 3000,3001) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Set-Location (Split-Path -Parent $PSScriptRoot)

& npm.cmd pkg set "scripts.test:golden:full=playwright test tests/golden-full.spec.js --headed --workers=1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run test:golden:full
exit $LASTEXITCODE
