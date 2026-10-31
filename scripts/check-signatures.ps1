$unpacked = "release\win-unpacked"
$msi = if (Test-Path "release\PackageGuardian-1.0.0-x64.msi") { "release\PackageGuardian-1.0.0-x64.msi" } else { "release\PackageGuard-1.0.0-x64.msi" }

Write-Host "=== MSI FILE SIGNATURE ==="
if (Test-Path $msi) {
    $sig = Get-AuthenticodeSignature $msi
    Write-Host "MSI: $msi -> Status: $($sig.Status)"
    if ($sig.SignerCertificate) {
        Write-Host "  Signer: $($sig.SignerCertificate.Subject)"
    }
}

Write-Host "`n=== EXECUTABLES AND LIBRARIES IN PACKAGE ==="
$files = Get-ChildItem -Path $unpacked -Recurse -Include *.exe, *.dll, *.node
$signed = @()
$unsigned = @()

foreach ($f in $files) {
    $sig = Get-AuthenticodeSignature $f.FullName
    $rel = $f.FullName.Substring((Resolve-Path $unpacked).Path.Length + 1)
    if ($sig.Status -eq "Valid") {
        $signed += [PSCustomObject]@{
            RelativePath = $rel
            Status = $sig.Status
            Subject = $sig.SignerCertificate.Subject
        }
    } else {
        $unsigned += [PSCustomObject]@{
            RelativePath = $rel
            Status = $sig.Status
            Subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "None" }
        }
    }
}

Write-Host "`nSigned Binaries Count: $($signed.Count)"
$signed | Format-Table -AutoSize

Write-Host "`nUnsigned Binaries Count: $($unsigned.Count)"
$unsigned | Format-Table -AutoSize

