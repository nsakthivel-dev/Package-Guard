@echo off
setlocal
set ROOT=%~dp0..
set ASAR=%ROOT%\release\win-unpacked\resources\app.asar
set ASAR_NEW=%ROOT%\release\win-unpacked\resources\app.asar.new
set ASAR_JS=%ROOT%\node_modules\.pnpm\@electron+asar@3.4.1\node_modules\@electron\asar\bin\asar.js

echo Closing PackageGuard if running...
taskkill /IM PackageGuard.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo Patching app bundle...
if not exist "%ASAR_JS%" (
  echo Run "pnpm install" from the project root first.
  exit /b 1
)

set TMP=%TEMP%\pg-asar-patch
rmdir /s /q "%TMP%" 2>nul
mkdir "%TMP%\extracted"

node "%ASAR_JS%" extract "%ASAR%" "%TMP%\extracted"
copy /Y "%ROOT%\electron\main.js" "%TMP%\extracted\electron\main.js"
copy /Y "%ROOT%\electron\paths.js" "%TMP%\extracted\electron\paths.js"

del /f "%ASAR%" 2>nul
node "%ASAR_JS%" pack "%TMP%\extracted" "%ASAR%"

echo Done. Run: release\win-unpacked\PackageGuard.exe
