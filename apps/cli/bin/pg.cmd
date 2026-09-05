@echo off
setlocal

set "CLI_JS="
if exist "%ProgramFiles%\Package Guard\cli\index.js" set "CLI_JS=%ProgramFiles%\Package Guard\cli\index.js"
if not defined CLI_JS if exist "%~dp0..\cli\index.js" set "CLI_JS=%~dp0..\cli\index.js"
if not defined CLI_JS if exist "%~dp0index.js" set "CLI_JS=%~dp0index.js"
if not defined CLI_JS if exist "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\cli\index.js" set "CLI_JS=C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\cli\index.js"
if not defined CLI_JS if exist "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\apps\cli\dist\index.js" set "CLI_JS=C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\apps\cli\dist\index.js"

where node >nul 2>nul
if %ERRORLEVEL% equ 0 if defined CLI_JS (
  node "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles%\Package Guard\PackageGuard.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ProgramFiles%\Package Guard\PackageGuard.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%~dp0..\PackageGuard.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%~dp0..\PackageGuard.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\PackageGuard.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\PackageGuard.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

echo [PackageGuard] Error: PackageGuard CLI runtime not found.
exit /b 1
