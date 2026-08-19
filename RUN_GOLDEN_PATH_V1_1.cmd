@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo VECTR Golden Path V1.1 repair + test
echo ==========================================

if not exist tests\golden-path.spec.js (
  echo [FAIL] tests\golden-path.spec.js tidak ditemukan setelah extract.
  exit /b 1
)

npm.cmd pkg set "scripts.test:golden=playwright test tests/golden-path.spec.js --headed --workers=1"
if errorlevel 1 exit /b 1

echo.
echo [RUN] npm.cmd run test:golden
echo.
npm.cmd run test:golden
exit /b %errorlevel%
