$cliJs = $null

$candidates = @(
    "$env:ProgramFiles\Package Guardian\cli\cli.js",
    "$env:ProgramFiles\Package Guardian\cli\index.js",
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guardian\cli\cli.js"),
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guardian\cli\index.js"),
    "$env:ProgramFiles\Package Guard\cli\index.js",
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guard\cli\index.js"),
    (Join-Path $PSScriptRoot "..\cli\cli.js"),
    (Join-Path $PSScriptRoot "..\cli\index.js"),
    (Join-Path $PSScriptRoot "cli.js"),
    (Join-Path $PSScriptRoot "index.js"),
    (Join-Path $PSScriptRoot "..\dist\cli.js"),
    (Join-Path $PSScriptRoot "..\..\..\release\win-unpacked\cli\cli.js")
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
    "$env:ProgramFiles\Package Guardian\PackageGuardian.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guardian\PackageGuardian.exe"),
    (Join-Path $PSScriptRoot "..\PackageGuardian.exe"),
    (Join-Path $PSScriptRoot "..\..\..\release\win-unpacked\PackageGuardian.exe"),
    "$env:ProgramFiles\Package Guard\PackageGuard.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guard\PackageGuard.exe"),
    (Join-Path $PSScriptRoot "..\PackageGuard.exe")
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

Write-Error "[Package Guardian] Error: Package Guardian CLI runtime not found."
exit 1
