param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("install", "uninstall")]
    [string]$Action,

    [Parameter(Mandatory=$true)]
    [string]$Dir
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$target = if ($isAdmin) { [EnvironmentVariableTarget]::Machine } else { [EnvironmentVariableTarget]::User }

$currentPath = [Environment]::GetEnvironmentVariable("Path", $target)
if (-not $currentPath) {
    $currentPath = ""
}

$dirNormalized = $Dir.TrimEnd('\')

if ($Action -eq "install") {
    $parts = $currentPath.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    $filtered = $parts | Where-Object { -not $_.TrimEnd('\').Equals($dirNormalized, [System.StringComparison]::OrdinalIgnoreCase) }
    # Prepend to ensure Package Guard CLI has top priority over legacy shims
    $newPath = (@($dirNormalized) + $filtered) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, $target)
    Write-Output "Configured $dirNormalized at front of PATH"

    # Also generate a pg.cmd shim alongside pg.exe for shells prioritizing .cmd
    $cmdShim = Join-Path $Dir "pg.cmd"
    Set-Content -Path $cmdShim -Value "@echo off`r`n`"%~dp0pg.exe`" %*" -Encoding Ascii
} elseif ($Action -eq "uninstall") {
    $parts = $currentPath.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    $filtered = $parts | Where-Object { -not $_.TrimEnd('\').Equals($dirNormalized, [System.StringComparison]::OrdinalIgnoreCase) }
    $newPath = $filtered -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, $target)
    Write-Output "Removed $dirNormalized from Machine PATH"
}
