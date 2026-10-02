# Invoke the multi-resolution 32-bit ICO generator
$makeIco = Join-Path $PSScriptRoot "make-ico.ps1"
& powershell -ExecutionPolicy Bypass -File $makeIco

