Add-Type -AssemblyName System.Drawing

$source = Join-Path $PSScriptRoot "..\93ab66ce-5cc7-4bd3-8286-325a5a5e8ddc.png"
$buildDir = Join-Path $PSScriptRoot "..\build"
$destPng = Join-Path $buildDir "icon.png"
$destIco = Join-Path $buildDir "icon.ico"
$publicLogo = Join-Path $PSScriptRoot "..\apps\desktop\renderer\public\logo.png"

# Copy PNG to build/icon.png and public/logo.png
Copy-Item -Path $source -Destination $destPng -Force
Copy-Item -Path $source -Destination $publicLogo -Force

# Create 256x256 ICO for Windows
$bmp = [System.Drawing.Bitmap]::FromFile($source)
$thumb = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($thumb)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($bmp, 0, 0, 256, 256)
$g.Dispose()
$bmp.Dispose()

$iconHandle = $thumb.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fs = New-Object System.IO.FileStream($destIco, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$thumb.Dispose()

Write-Output "Successfully generated icon.png, icon.ico, and public/logo.png"
