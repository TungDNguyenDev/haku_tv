<#
.SYNOPSIS
  Step 1 of the video pipeline: transcode one source file into an ABR ladder (H.264 renditions + one AAC track).

.DESCRIPTION
  Output goes to media/work/<Name>/ :
    video_480.mp4, video_720.mp4, video_1080.mp4   (only rungs not taller than the source)
    audio.mp4
  Every rendition gets a keyframe exactly every 2 seconds (-force_key_frames + -sc_threshold 0),
  so segments line up across qualities and the player can switch quality at any segment boundary.

.EXAMPLE
  .\tools\encode.ps1 -Source media\raw\sintel.mp4 -Name sintel
#>
param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Name,
    [ValidateSet('ultrafast', 'veryfast', 'fast', 'medium', 'slow')][string]$Preset = 'veryfast'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$ffmpeg  = Resolve-Tool 'ffmpeg'
$ffprobe = Resolve-Tool 'ffprobe'
$Source  = (Resolve-Path $Source).Path
$workDir = Join-Path $MediaRoot "work\$Name"
New-Item -ItemType Directory -Force $workDir | Out-Null

# Height, max bitrate, buffer size. Rough streaming-style ladder for 24 fps H.264.
$ladder = @(
    @{ Height = 480;  Maxrate = '1400k'; Bufsize = '2800k' },
    @{ Height = 720;  Maxrate = '3000k'; Bufsize = '6000k' },
    @{ Height = 1080; Maxrate = '5800k'; Bufsize = '11600k' }
)

$srcHeight = [int](& $ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 $Source)
$rungs = $ladder | Where-Object { $_.Height -le $srcHeight }
if (-not $rungs) { $rungs = @($ladder[0]) }
Write-Host "Source height: ${srcHeight}p -> renditions: $(($rungs | ForEach-Object { "$($_.Height)p" }) -join ', ')"

foreach ($r in $rungs) {
    $out = Join-Path $workDir "video_$($r.Height).mp4"
    Write-Host "Encoding $($r.Height)p ..." -ForegroundColor Cyan
    Invoke-Native $ffmpeg @(
        '-hide_banner', '-loglevel', 'error', '-stats', '-y', '-i', $Source, '-an',
        '-c:v', 'libx264', '-preset', $Preset, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-vf', "scale=-2:$($r.Height)",
        '-crf', '22', '-maxrate', $r.Maxrate, '-bufsize', $r.Bufsize,
        '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
        $out
    ) "ffmpeg $($r.Height)p"
}

Write-Host "Encoding audio ..." -ForegroundColor Cyan
Invoke-Native $ffmpeg @(
    '-hide_banner', '-loglevel', 'error', '-y', '-i', $Source,
    '-vn', '-c:a', 'aac', '-b:a', '128k', '-ac', '2', (Join-Path $workDir 'audio.mp4')
) 'ffmpeg audio'

Write-Host "Done -> $workDir" -ForegroundColor Green
Write-Host "Next: .\tools\package.ps1 -Name $Name   (add -ClearKey for the encrypted version)"
