# ─────────────────────────────────────────────────────────────────────────────
# create-share-zip.ps1
# Creates a clean, shareable zip of the project — excludes node_modules,
# build outputs, release binaries, and other generated/platform-specific files
# that would break pnpm install on another machine.
#
# Usage:
#   Right-click -> Run with PowerShell
#   OR from terminal: .\create-share-zip.ps1
# ─────────────────────────────────────────────────────────────────────────────

$projectRoot = $PSScriptRoot
$projectName = "PackageGuard"
$timestamp   = Get-Date -Format "yyyy-MM-dd_HH-mm"

# Use the real Desktop path (works with OneDrive-redirected Desktop too)
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$outputZip   = Join-Path $desktopPath "$projectName-$timestamp.zip"

# ── Folders/patterns to exclude ───────────────────────────────────────────────
$excludePatterns = @(
    "node_modules",
    "release",
    "release-v1",
    "dist_electron",
    "dist",
    "out",
    "tmp",
    ".git",
    "database",
    ".kombai",
    ".cursor",
    ".cache",
    ".local"
)

$excludeWildcards = @(
    "*.tsbuildinfo",
    "*.zip",
    "electron-stdout.txt",
    "electron-stderr.txt",
    "err.txt",
    "out.txt",
    "Thumbs.db",
    ".DS_Store"
)

# Specific sub-paths to exclude (relative to project root)
$excludeSubPaths = @(
    "apps\cli\dist",
    "apps\desktop\renderer\dist",
    "packages\shared\dist",
    "packages\database\dist",
    "packages\core\dist",
    "lib\api-client-react\dist"
)

Write-Host ""
Write-Host "  Package Guard - Share Zip Creator" -ForegroundColor Cyan
Write-Host "  -----------------------------------" -ForegroundColor DarkGray
Write-Host "  Source : $projectRoot" -ForegroundColor Gray
Write-Host "  Output : $outputZip" -ForegroundColor Gray
Write-Host ""

# ── Collect files ─────────────────────────────────────────────────────────────
Write-Host "  Scanning files..." -ForegroundColor Yellow

$allFiles = Get-ChildItem -Path $projectRoot -Recurse -File -Force -ErrorAction SilentlyContinue

$filesToInclude = $allFiles | Where-Object {
    $relativePath = $_.FullName.Substring($projectRoot.Length).TrimStart('\')
    $excluded = $false

    # Check folder name segments
    $segments = $relativePath -split '\\'
    foreach ($seg in $segments) {
        if ($excludePatterns -contains $seg) {
            $excluded = $true
            break
        }
    }

    # Check wildcard filename patterns
    if (-not $excluded) {
        foreach ($wc in $excludeWildcards) {
            if ($_.Name -like $wc) {
                $excluded = $true
                break
            }
        }
    }

    # Check specific sub-paths
    if (-not $excluded) {
        foreach ($sub in $excludeSubPaths) {
            if ($relativePath -like "$sub\*" -or $relativePath -eq $sub) {
                $excluded = $true
                break
            }
        }
    }

    -not $excluded
}

$fileCount = ($filesToInclude | Measure-Object).Count
Write-Host "  Found $fileCount files to include" -ForegroundColor Green
Write-Host ""

# ── Build the zip ─────────────────────────────────────────────────────────────
Write-Host "  Creating zip..." -ForegroundColor Yellow

# Remove existing zip if it exists
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
}

# Ensure output directory exists
$outputDir = Split-Path $outputZip -Parent
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($outputZip, 'Create')

$processed  = 0
$skipped    = 0

foreach ($file in $filesToInclude) {
    $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart('\')
    $entryName    = "$projectName\$relativePath"

    try {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
        $processed++
    } catch {
        Write-Host "  SKIP: $relativePath" -ForegroundColor DarkYellow
        $skipped++
    }

    if (($processed + $skipped) % 50 -eq 0) {
        Write-Host "  ... $processed added, $skipped skipped" -ForegroundColor DarkGray
    }
}

$zip.Dispose()

# ── Summary ───────────────────────────────────────────────────────────────────
$zipItem = Get-Item $outputZip -ErrorAction SilentlyContinue
$zipSize = if ($zipItem) { [math]::Round($zipItem.Length / 1MB, 2) } else { 0 }

Write-Host ""
Write-Host "  Done!" -ForegroundColor Green
Write-Host "  --------------------------------------" -ForegroundColor DarkGray
Write-Host "  Files packed : $processed" -ForegroundColor Gray
if ($skipped -gt 0) {
    Write-Host "  Files skipped: $skipped (in use by another process)" -ForegroundColor DarkYellow
}
Write-Host "  Zip size     : $zipSize MB" -ForegroundColor Gray
Write-Host "  Saved to     : $outputZip" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Your friend needs to:" -ForegroundColor White
Write-Host "    1. Extract the zip" -ForegroundColor Gray
Write-Host "    2. npm install -g pnpm   (if not installed)" -ForegroundColor Gray
Write-Host "    3. pnpm install" -ForegroundColor Gray
Write-Host "    4. pnpm run build" -ForegroundColor Gray
Write-Host ""

if ($Host.Name -eq 'ConsoleHost' -and -not $env:WT_SESSION -and -not $env:TERM_PROGRAM) {
    Write-Host "  Press any key to exit..." -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
