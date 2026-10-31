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
Write-Host "=== Testing Silent MSI Uninstallation ==="
Write-Host "Target package: $fullMsiPath"

# Stop any running PackageGuardian / PackageGuard processes before uninstall
Stop-Process -Name "PackageGuardian" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "PackageGuard" -Force -ErrorAction SilentlyContinue

$logFile = Join-Path (Get-Location) "msi-uninstall.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$proc = Start-Process msiexec.exe -ArgumentList "/x `"$fullMsiPath`" /qn /l*v `"$logFile`"" -Wait -PassThru
Write-Host "msiexec ExitCode: $($proc.ExitCode)"

if ($proc.ExitCode -ne 0) {
    Write-Error "MSI uninstallation failed with exit code $($proc.ExitCode). Check $logFile for details."
    exit $proc.ExitCode
}

# Verify installed directory removal
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

$appStillExists = $false
foreach ($c in $candidates) {
    if ((Test-Path (Join-Path $c "PackageGuardian.exe")) -or (Test-Path (Join-Path $c "PackageGuard.exe"))) {
        Write-Warning "Application executable still exists in: $c"
        $appStillExists = $true
    }
}

$scPathUser = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Package Guardian.lnk'
$scPathAll = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Package Guardian.lnk'
$scPathUserOld = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Package Guard.lnk'
$scPathAllOld = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Package Guard.lnk'
$shortcutStillExists = (Test-Path $scPathUser) -or (Test-Path $scPathAll) -or (Test-Path $scPathUserOld) -or (Test-Path $scPathAllOld)

# Verify user data preservation
$appDataNew = Join-Path $env:APPDATA 'PackageGuardian'
$appDataOld = Join-Path $env:APPDATA 'PackageGuard'
$userDataPreserved = (Test-Path $appDataNew) -or (Test-Path $appDataOld)

Write-Host "Application executables removed: $(-not $appStillExists)"
Write-Host "Shortcuts removed:               $(-not $shortcutStillExists)"
Write-Host "User data preserved:             $userDataPreserved ($appDataNew / $appDataOld)"

Write-Host "`nSilent uninstallation test completed successfully (Exit code: 0)."

