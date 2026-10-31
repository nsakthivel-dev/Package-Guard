<#
─────────────────────────────────────────────────────────────────────────────
create-share-zip.ps1
Package Guardian — Clean Project Share Zip Generator

Creates a clean, lightweight, shareable zip of the Package Guard codebase.
Excludes:
  - Heavy dependencies (node_modules)
  - Generated build outputs (dist, dist-cli, prod-modules, release, out, etc.)
  - Platform/compiler caches (*.tsbuildinfo, .cache, tmp)
  - Local databases (*.db, *.sqlite*, root database/, .packageguard/)
  - Log files and OS metadata (.DS_Store, Thumbs.db, *.log, *.txt logs)
  - Secrets and environment files (.env*)

Preserves:
  - All workspace packages (packages/core, packages/database, packages/shared, lib/api-client-react)
  - Desktop app and CLI source (apps/desktop, apps/cli)
  - Electron installer configuration (build/electron-builder.config.js, build/installer*)
  - Build and utility scripts (scripts/)
  - Lockfiles and configs (package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig*.json)

Usage:
  Right-click -> Run with PowerShell
  OR from terminal:
    .\create-share-zip.ps1
    .\create-share-zip.ps1 -OutputPath "C:\path\to\PackageGuard-Custom.zip"
─────────────────────────────────────────────────────────────────────────────
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false)]
    [switch]$NoPause
)

$projectRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$projectName = "PackageGuardian"
$timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"

# Determine target zip file path
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $outputZip = [System.IO.Path]::GetFullPath($OutputPath)
} else {
    $desktopPath = [System.Environment]::GetFolderPath('Desktop')
    $outputZip   = Join-Path $desktopPath "$projectName-$timestamp.zip"
}

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Cyan
Write-Host "         Package Guardian - Share Zip Creator      " -ForegroundColor Cyan
Write-Host "  =================================================" -ForegroundColor DarkGray
Write-Host "  Source   : $projectRoot" -ForegroundColor Gray
Write-Host "  Target   : $outputZip" -ForegroundColor Gray
Write-Host ""

# ── 1. Exclusion Rules ────────────────────────────────────────────────────────

# Directories to prune anywhere in the repository tree
$universalExcludeDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
    "node_modules",
    "dist",
    "out",
    "out-tsc",
    "tmp",
    "temp",
    ".git",
    ".cache",
    ".local",
    ".cursor",
    ".kombai",
    ".idea",
    ".expo",
    ".expo-shared",
    ".sass-cache",
    "coverage"
) | ForEach-Object { [void]$universalExcludeDirs.Add($_) }

# Directories to exclude ONLY when directly under the project root
# (Ensures 'database/' at root is excluded without touching 'packages\database')
$rootOnlyExcludeDirs = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
    "dist-cli",
    "prod-modules",
    "release",
    "release-v1",
    "release-build",
    "release-latest",
    "dist_electron",
    "database",
    ".packageguardian",
    ".packageguard"
) | ForEach-Object { [void]$rootOnlyExcludeDirs.Add($_) }

# File patterns to exclude by filename
$fileExcludeWildcards = @(
    "*.tsbuildinfo",
    "*.zip",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.log",
    "npm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
    "pnpm-debug.log*",
    "electron-stdout.txt",
    "electron-stderr.txt",
    "err.txt",
    "out.txt",
    "Thumbs.db",
    ".DS_Store",
    "*.docx",
    ".env",
    ".env.local",
    ".env.*.local",
    "*.env",
    "*.suo",
    "*.sublime-workspace",
    "*.launch",
    "connect.lock",
    "*.asar",
    "*.db",
    "*.db-wal",
    "*.db-shm",
    "*.sqlite",
    "*.sqlite3"
)

# ── 2. High-Performance File Enumeration ──────────────────────────────────────
Write-Host "  Scanning source files..." -ForegroundColor Yellow
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$filesToInclude = [System.Collections.Generic.List[string]]::new()
$dirQueue       = [System.Collections.Generic.Queue[string]]::new()
$dirQueue.Enqueue($projectRoot)

while ($dirQueue.Count -gt 0) {
    $curDir = $dirQueue.Dequeue()
    $isRoot = ($curDir -eq $projectRoot)

    try {
        $entries = [System.IO.Directory]::EnumerateFileSystemEntries($curDir)
    } catch {
        Write-Host "  WARN: Unable to read directory: $curDir" -ForegroundColor DarkYellow
        continue
    }

    foreach ($entry in $entries) {
        $name = [System.IO.Path]::GetFileName($entry)

        if ([System.IO.Directory]::Exists($entry)) {
            # Skip universal excluded directories
            if ($universalExcludeDirs.Contains($name)) {
                continue
            }
            # Skip root-only excluded directories
            if ($isRoot -and $rootOnlyExcludeDirs.Contains($name)) {
                continue
            }
            # Directory is valid for traversal
            $dirQueue.Enqueue($entry)
        } else {
            # File check against wildcards
            $skip = $false
            foreach ($pat in $fileExcludeWildcards) {
                if ($name -like $pat) {
                    $skip = $true
                    break
                }
            }
            if (-not $skip) {
                $filesToInclude.Add($entry)
            }
        }
    }
}

$stopwatch.Stop()
$fileCount = $filesToInclude.Count
Write-Host "  Scan completed in $($stopwatch.ElapsedMilliseconds) ms" -ForegroundColor DarkGray
Write-Host "  Found $fileCount clean source files to package" -ForegroundColor Green
Write-Host ""

if ($fileCount -eq 0) {
    Write-Host "  ERROR: No files found to zip! Please check the project directory." -ForegroundColor Red
    exit 1
}

# ── 3. Build the Zip Archive ──────────────────────────────────────────────────
Write-Host "  Compressing into archive..." -ForegroundColor Yellow

# Ensure parent directory exists
$outputDir = [System.IO.Path]::GetDirectoryName($outputZip)
if (-not [string]::IsNullOrEmpty($outputDir) -and -not (Test-Path $outputDir)) {
    [void][System.IO.Directory]::CreateDirectory($outputDir)
}

# Remove existing zip if present
if (Test-Path $outputZip) {
    try {
        Remove-Item $outputZip -Force -ErrorAction Stop
    } catch {
        Write-Host "  ERROR: Cannot overwrite existing file '$outputZip'. It may be open in another program." -ForegroundColor Red
        exit 1
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$processed = 0
$skipped   = 0

$zip = $null
try {
    $zip = [System.IO.Compression.ZipFile]::Open($outputZip, 'Create')

    foreach ($filePath in $filesToInclude) {
        $relativeLocal = $filePath.Substring($projectRoot.Length).TrimStart('\', '/')
        # Use standard forward slashes inside the ZIP specification for cross-platform compatibility
        $entryName = ($projectName + '/' + $relativeLocal).Replace('\', '/')

        try {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $filePath,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
            $processed++
        } catch {
            Write-Host "  SKIP (in use): $relativeLocal" -ForegroundColor DarkYellow
            $skipped++
        }

        if (($processed + $skipped) % 50 -eq 0) {
            Write-Host "  ... $processed packed, $skipped skipped" -ForegroundColor DarkGray
        }
    }
} finally {
    if ($null -ne $zip) {
        $zip.Dispose()
    }
}

# ── 4. Summary & Verification ─────────────────────────────────────────────────
$zipItem = Get-Item $outputZip -ErrorAction SilentlyContinue
$zipSizeMB = if ($zipItem) { [math]::Round($zipItem.Length / 1MB, 2) } else { 0 }

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Green
Write-Host "  Archive Created Successfully!" -ForegroundColor Green
Write-Host "  =================================================" -ForegroundColor Green
Write-Host "  Files packed : $processed" -ForegroundColor White
if ($skipped -gt 0) {
    Write-Host "  Files skipped: $skipped (locked by running processes)" -ForegroundColor DarkYellow
}
Write-Host "  Archive size : $zipSizeMB MB" -ForegroundColor White
Write-Host "  Location     : $outputZip" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Instructions for recipient:" -ForegroundColor Cyan
Write-Host "    1. Extract '$projectName' folder from the zip" -ForegroundColor Gray
Write-Host "    2. Ensure Node.js (>= 18) and pnpm are installed:" -ForegroundColor Gray
Write-Host "         npm install -g pnpm" -ForegroundColor DarkGray
Write-Host "    3. Install dependencies:" -ForegroundColor Gray
Write-Host "         pnpm install" -ForegroundColor DarkGray
Write-Host "    4. Run development desktop app:" -ForegroundColor Gray
Write-Host "         pnpm dev" -ForegroundColor DarkGray
Write-Host "       OR build production binaries:" -ForegroundColor Gray
Write-Host "         pnpm run build" -ForegroundColor DarkGray
Write-Host "    5. Launch the built app:" -ForegroundColor Gray
Write-Host "         .\run-packageguard.bat" -ForegroundColor DarkGray
Write-Host ""

# Only pause if launched by double-clicking from Windows Explorer
$isExplorer = $false
try {
    $parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId
    $parentProc = Get-Process -Id $parentPid -ErrorAction SilentlyContinue
    if ($parentProc -and $parentProc.ProcessName -eq 'explorer') {
        $isExplorer = $true
    }
} catch {}

if ($isExplorer -and -not $NoPause) {
    Write-Host "  Press any key to exit..." -ForegroundColor DarkGray
    try {
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } catch {}
}
