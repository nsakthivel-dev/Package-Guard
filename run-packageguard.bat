@echo off
if exist "%~dp0release-latest\win-unpacked\PackageGuard.exe" (
  set "APP_DIR=%~dp0release-latest\win-unpacked"
) else if exist "%~dp0release-build\win-unpacked\PackageGuard.exe" (
  set "APP_DIR=%~dp0release-build\win-unpacked"
) else if exist "%~dp0release\win-unpacked\PackageGuard.exe" (
  set "APP_DIR=%~dp0release\win-unpacked"
) else (
  echo PackageGuard.exe not found. Build first: pnpm build
  pause
  exit /b 1
)
start "" "%APP_DIR%\PackageGuard.exe"
