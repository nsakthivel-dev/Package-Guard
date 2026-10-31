Add-Type -AssemblyName System.IO.Compression.FileSystem

$msixPath = Resolve-Path "release\PackageGuardian-1.0.0-x64.msix"
$zip = [System.IO.Compression.ZipFile]::OpenRead($msixPath)
$entry = $zip.GetEntry("AppxManifest.xml")
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xml = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()

[xml]$doc = $xml
Write-Host "=== PACKAGE IDENTITY ==="
Write-Host "Name:            " $doc.Package.Identity.Name
Write-Host "Publisher:       " $doc.Package.Identity.Publisher
Write-Host "Version:         " $doc.Package.Identity.Version
Write-Host "ProcessorArch:   " $doc.Package.Identity.ProcessorArchitecture

Write-Host "`n=== PROPERTIES ==="
Write-Host "DisplayName:     " $doc.Package.Properties.DisplayName
Write-Host "PublisherDisplay:" $doc.Package.Properties.PublisherDisplayName

