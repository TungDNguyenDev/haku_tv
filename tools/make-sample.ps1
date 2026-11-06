<#
.SYNOPSIS
  Creates a short synthetic test video (moving test pattern + tone) in media/raw/, for testing the pipeline
  without waiting for real movies to download.

.EXAMPLE
  .\tools\make-sample.ps1                # 60 s, 1920x1080 -> media/raw/sample.mp4
  .\tools\make-sample.ps1 -Seconds 20
#>
param(
    [int]$Seconds = 60,
    [string]$Name = 'sample'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$ffmpeg = Resolve-Tool 'ffmpeg'
$out = Join-Path $MediaRoot "raw\$Name.mp4"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null

Invoke-Native $ffmpeg @(
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', "testsrc2=size=1920x1080:rate=24:duration=$Seconds",
    '-f', 'lavfi', '-i', "sine=frequency=440:duration=$Seconds",
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', $out
) 'ffmpeg'
Write-Host "Created $out" -ForegroundColor Green
