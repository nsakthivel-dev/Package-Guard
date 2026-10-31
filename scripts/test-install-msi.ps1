param(
    [string]$MsiPath = "release\PackageGuardian-1.0.0-x64.msi"
)

if (-not (Test-Path $MsiPath)) {
    if (Test-Path "release\PackageGuardian-Setup.msi") {
        $MsiPath = "release\PackageGuardian-Setup.msi"
    } elseif (Test-Path "release\PackageGuard-1.0.0-x64.msi") {
        $MsiPath = "release\PackageGuard-1.0.0-x64.msi"
    } elseif (Test-Path "release\PackageGuard-Setup.msi") {
        $MsiPath = "release\PackageGuard-Setup.msi"
    } else {
        Write-Error "MSI installer not found at $MsiPath"
        exit 1
    }
}

$fullMsiPath = (Resolve-Path $MsiPath).Path
Write-Host "=== Testing Silent MSI Installation ==="
Write-Host "Target package: $fullMsiPath"

$logFile = Join-Path (Get-Location) "msi-install.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process msiexec.exe -ArgumentList "/i `"$fullMsiPath`" /qn /l*v `"$logFile`"" -Wait -PassThru
Write-Host "msiexec ExitCode: $($proc.ExitCode)"

if ($proc.ExitCode -ne 0) {
    Write-Error "MSI installation failed with exit code $($proc.ExitCode). Check $logFile for details."
    exit $proc.ExitCode
}

# Check install locations (per-user or per-machine)
$candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\PackageGuardian"),
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guardian"),
    (Join-Path $env:LOCALAPPDATA "Programs\package-guardian"),
    (Join-Path $env:LOCALAPPDATA "Programs\PackageGuard"),
    (Join-Path $env:LOCALAPPDATA "Programs\Package Guard"),
    (Join-Path $env:LOCALAPPDATA "Programs\package-guard"),
    "C:\Program Files\PackageGuardian",
    "C:\Program Files\Package Guardian",
    "C:\Program Files\package-guardian",
    "C:\Program Files\PackageGuard",
    "C:\Program Files\Package Guard",
    "C:\Program Files\package-guard"
)

$installedDir = $null
$mainExeName = "PackageGuardian.exe"
foreach ($c in $candidates) {
    if (Test-Path $c) {
        if (Test-Path (Join-Path $c "PackageGuardian.exe")) {
            $installedDir = $c
            $mainExeName = "PackageGuardian.exe"
            break
        } elseif (Test-Path (Join-Path $c "PackageGuard.exe")) {
            $installedDir = $c
            $mainExeName = "PackageGuard.exe"
            break
        }
    }
}

if ($installedDir) {
    Write-Host "Installation confirmed at: $installedDir"
    $mainExe = Join-Path $installedDir $mainExeName
    Write-Host "Main executable exists: $(Test-Path $mainExe)"
    $cliExe = Join-Path $installedDir "cli\pg.exe"
    Write-Host "CLI executable exists:  $(Test-Path $cliExe)"
} else {
    Write-Error "Could not locate installed application directory."
    exit 1
}

# Check Start Menu shortcut
$scPathUser = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Package Guardian.lnk'
$scPathAll = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Package Guardian.lnk'
$scPathUserOld = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Package Guard.lnk'
$scPathAllOld = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Package Guard.lnk'
$shortcutFound = (Test-Path $scPathUser) -or (Test-Path $scPathAll) -or (Test-Path $scPathUserOld) -or (Test-Path $scPathAllOld)
Write-Host "Start Menu shortcut confirmed: $shortcutFound"

Write-Host "`nSilent installation test completed successfully (Exit code: 0)."

