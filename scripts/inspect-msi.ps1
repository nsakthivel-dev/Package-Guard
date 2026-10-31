param(
    [string]$Path = "release\PackageGuardian-Setup.msi"
)

if (-not (Test-Path $Path)) {
    if (Test-Path "release\PackageGuardian-1.0.0-x64.msi") {
        $Path = "release\PackageGuardian-1.0.0-x64.msi"
    } elseif (Test-Path "release\PackageGuard-Setup.msi") {
        $Path = "release\PackageGuard-Setup.msi"
    }
}

$msiPath = (Resolve-Path $Path).Path
$wi = New-Object -ComObject WindowsInstaller.Installer
$db = $wi.OpenDatabase($msiPath, 0)

Write-Host "=== FILE DETAILS ==="
$item = Get-Item $msiPath
Write-Host "File: $($item.FullName)"
Write-Host "Size: $($item.Length) bytes ($([math]::Round($item.Length / 1MB, 2)) MB)"

Write-Host "`n=== SUMMARY INFO ==="
$sum = $wi.SummaryInformation($msiPath, 0)
1..19 | ForEach-Object {
    try {
        $val = $sum.Property($_)
        if ($val) {
            Write-Host "PID $_ = $val"
        }
    } catch {}
}

Write-Host "`n=== PROPERTIES ==="
$view = $db.OpenView("SELECT Property, Value FROM Property")
$view.Execute()
while ($rec = $view.Fetch()) {
    $p = $rec.StringData(1)
    $v = $rec.StringData(2)
    Write-Host "  $p = $v"
}

Write-Host "`n=== SHORTCUTS ==="
$viewS = $db.OpenView("SELECT Shortcut, Directory_, Name, Component_, Target FROM Shortcut")
$viewS.Execute()
while ($recS = $viewS.Fetch()) {
    $sc = $recS.StringData(1)
    $dir = $recS.StringData(2)
    $name = $recS.StringData(3)
    $comp = $recS.StringData(4)
    $tgt = $recS.StringData(5)
    Write-Host "  Shortcut: $sc | Dir: $dir | Name: $name | Comp: $comp | Target: $tgt"
}

Write-Host "`n=== AUTHENTICODE SIGNATURE ==="
Get-AuthenticodeSignature $msiPath | Format-List

