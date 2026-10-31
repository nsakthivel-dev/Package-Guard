@echo off
setlocal

set "CLI_JS="
if exist "%ProgramFiles%\Package Guardian\cli\cli.js" set "CLI_JS=%ProgramFiles%\Package Guardian\cli\cli.js"
if not defined CLI_JS if exist "%ProgramFiles%\Package Guardian\cli\index.js" set "CLI_JS=%ProgramFiles%\Package Guardian\cli\index.js"
if not defined CLI_JS if exist "%LOCALAPPDATA%\Programs\Package Guardian\cli\cli.js" set "CLI_JS=%LOCALAPPDATA%\Programs\Package Guardian\cli\cli.js"
if not defined CLI_JS if exist "%LOCALAPPDATA%\Programs\Package Guardian\cli\index.js" set "CLI_JS=%LOCALAPPDATA%\Programs\Package Guardian\cli\index.js"
if not defined CLI_JS if exist "%ProgramFiles%\Package Guard\cli\index.js" set "CLI_JS=%ProgramFiles%\Package Guard\cli\index.js"
if not defined CLI_JS if exist "%LOCALAPPDATA%\Programs\Package Guard\cli\index.js" set "CLI_JS=%LOCALAPPDATA%\Programs\Package Guard\cli\index.js"
if not defined CLI_JS if exist "%~dp0..\cli\cli.js" set "CLI_JS=%~dp0..\cli\cli.js"
if not defined CLI_JS if exist "%~dp0..\cli\index.js" set "CLI_JS=%~dp0..\cli\index.js"
if not defined CLI_JS if exist "%~dp0cli.js" set "CLI_JS=%~dp0cli.js"
if not defined CLI_JS if exist "%~dp0index.js" set "CLI_JS=%~dp0index.js"
if not defined CLI_JS if exist "%~dp0..\dist\cli.js" set "CLI_JS=%~dp0..\dist\cli.js"
if not defined CLI_JS if exist "%~dp0..\..\..\release\win-unpacked\cli\cli.js" set "CLI_JS=%~dp0..\..\..\release\win-unpacked\cli\cli.js"

where node >nul 2>nul
if %ERRORLEVEL% equ 0 if defined CLI_JS (
  node "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%ProgramFiles%\Package Guardian\PackageGuardian.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%ProgramFiles%\Package Guardian\PackageGuardian.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%LOCALAPPDATA%\Programs\Package Guardian\PackageGuardian.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%LOCALAPPDATA%\Programs\Package Guardian\PackageGuardian.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%~dp0..\PackageGuardian.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%~dp0..\PackageGuardian.exe" "%CLI_JS%" %*
  exit /b %ERRORLEVEL%
)

if exist "%~dp0..\..\..\release\win-unpacked\PackageGuardian.exe" if defined CLI_JS (
  set "ELECTRON_RUN_AS_NODE=1"
  "%~dp0..\..\..\release\win-unpacked\PackageGuardian.exe" "%CLI_JS%" %*
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

echo [Package Guardian] Error: Package Guardian CLI runtime not found.
exit /b 1
