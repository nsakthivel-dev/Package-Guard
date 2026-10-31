@echo off
if exist "%~dp0release\win-unpacked\PackageGuardian.exe" (
  set "APP_DIR=%~dp0release\win-unpacked"
  set "EXE_NAME=PackageGuardian.exe"
) else if exist "%~dp0release-latest\win-unpacked\PackageGuardian.exe" (
  set "APP_DIR=%~dp0release-latest\win-unpacked"
  set "EXE_NAME=PackageGuardian.exe"
) else if exist "%~dp0release-build\win-unpacked\PackageGuardian.exe" (
  set "APP_DIR=%~dp0release-build\win-unpacked"
  set "EXE_NAME=PackageGuardian.exe"
) else if exist "%~dp0release\win-unpacked\PackageGuard.exe" (
  set "APP_DIR=%~dp0release\win-unpacked"
  set "EXE_NAME=PackageGuard.exe"
) else (
  echo Package Guardian executable not found. Build first: pnpm build
  pause
  exit /b 1
)
start "" "%APP_DIR%\%EXE_NAME%"

