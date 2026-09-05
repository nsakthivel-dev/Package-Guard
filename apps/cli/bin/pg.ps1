$cliJs = $null

$candidates = @(
    "$env:ProgramFiles\Package Guard\cli\index.js",
    (Join-Path $PSScriptRoot "..\cli\index.js"),
    (Join-Path $PSScriptRoot "index.js"),
    "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\cli\index.js",
    "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\apps\cli\dist\index.js"
)

foreach ($c in $candidates) {
    if (Test-Path $c) {
        $cliJs = $c
        break
    }
}

$hasNode = Get-Command node -ErrorAction SilentlyContinue
if ($hasNode -and $cliJs) {
    & node $cliJs $args
    exit $LASTEXITCODE
}

$exeCandidates = @(
    "$env:ProgramFiles\Package Guard\PackageGuard.exe",
    (Join-Path $PSScriptRoot "..\PackageGuard.exe"),
    "C:\Users\nsakt\Downloads\PackageGuard-New\PackageGuard\release\win-unpacked\PackageGuard.exe"
)

$pkgExe = $null
foreach ($e in $exeCandidates) {
    if (Test-Path $e) {
        $pkgExe = $e
        break
    }
}

if ($pkgExe -and $cliJs) {
    $env:ELECTRON_RUN_AS_NODE = "1"
    & $pkgExe $cliJs $args
    exit $LASTEXITCODE
}

Write-Error "[PackageGuard] Error: PackageGuard CLI runtime not found."
exit 1
