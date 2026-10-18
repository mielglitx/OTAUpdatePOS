# Lokalex POS - Over-The-Air (OTA) Asset Packaging Utility
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir = Join-Path $scriptDir "assets\www"
$outputZip = Join-Path $scriptDir "www.zip"

Write-Host "Packaging Lokalex POS web assets for OTA update..." -ForegroundColor Cyan

if (-not (Test-Path $sourceDir)) {
    Write-Error "Source directory not found: $sourceDir"
    exit 1
}

if (Test-Path $outputZip) {
    Remove-Item -Path $outputZip -Force
    Write-Host "Removed previous www.zip" -ForegroundColor DarkGray
}

$filesToZip = Get-ChildItem -Path $sourceDir
Compress-Archive -Path $filesToZip.FullName -DestinationPath $outputZip -CompressionLevel Optimal

$zipInfo = Get-Item $outputZip
$zipSizeMb = [Math]::Round($zipInfo.Length / 1MB, 2)

Write-Host ""
Write-Host "Successfully built: www.zip ($zipSizeMb MB)" -ForegroundColor Green
Write-Host "Path: $outputZip" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next Steps to Publish Release:" -ForegroundColor White
Write-Host " 1. Go to your GitHub repository -> Releases -> Draft a new release"
Write-Host " 2. Create a new tag (e.g. v1.0.1, v1.0.2)"
Write-Host " 3. Enter release title and notes"
Write-Host " 4. Drag and drop www.zip into the Attach binaries section"
Write-Host " 5. Click Publish release"
Write-Host " 6. In your POS App: Admin -> Backup & OTA -> Click Check for OTA Updates -> Install Update"
Write-Host ""
