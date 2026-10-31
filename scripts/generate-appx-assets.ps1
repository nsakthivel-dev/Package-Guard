# Generate AppX / MSIX Visual Assets for Microsoft Store
param(
    [string]$SourcePng = "build/icon.png",
    [string]$OutputDir = "build/appx"
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $SourcePng)) {
    Write-Error "Source image '$SourcePng' not found."
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

function Resize-AndSave([System.Drawing.Image]$img, [int]$width, [int]$height, [string]$destPath, [bool]$contain = $false) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($contain) {
        # Fit image maintaining aspect ratio centered
        $scale = [Math]::Min([double]$width / $img.Width, [double]$height / $img.Height) * 0.8
        $destW = [int]($img.Width * $scale)
        $destH = [int]($img.Height * $scale)
        $destX = [int](($width - $destW) / 2)
        $destY = [int](($height - $destH) / 2)
        $g.DrawImage($img, $destX, $destY, $destW, $destH)
    } else {
        $g.DrawImage($img, 0, 0, $width, $height)
    }

    $g.Dispose()
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $destPath ($($width)x$($height))"
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path $SourcePng).Path)

try {
    Resize-AndSave $src 50 50 (Join-Path $OutputDir "StoreLogo.png")
    Resize-AndSave $src 150 150 (Join-Path $OutputDir "Square150x150Logo.png")
    Resize-AndSave $src 44 44 (Join-Path $OutputDir "Square44x44Logo.png")
    Resize-AndSave $src 310 150 (Join-Path $OutputDir "Wide310x150Logo.png") $true
    Resize-AndSave $src 71 71 (Join-Path $OutputDir "Square71x71Logo.png")
    Resize-AndSave $src 310 310 (Join-Path $OutputDir "Square310x310Logo.png")
    Resize-AndSave $src 620 300 (Join-Path $OutputDir "SplashScreen.png") $true
} finally {
    $src.Dispose()
}

Write-Host "All MSIX visual assets generated successfully in $OutputDir"

