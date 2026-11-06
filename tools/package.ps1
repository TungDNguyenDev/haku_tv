<#
.SYNOPSIS
  Step 2 of the video pipeline: package the encoded renditions into CMAF (fMP4) segments with
  a DASH manifest (manifest.mpd) and an HLS master playlist (master.m3u8), optionally encrypted.

.DESCRIPTION
  Reads media/work/<Name>/ (output of encode.ps1) and writes:
    -ClearKey not set : media/packaged/<Name>/
    -ClearKey set     : media/packaged/<Name>-clearkey/   and the key into SQL Server (drm.ContentKey, MediaName = <Name>)

  With -ClearKey the content is encrypted with CENC (AES-CTR), the same encryption Widevine and PlayReady use.
  Only the way the player obtains the key differs: ClearKey gets it in plain JSON from a license server,
  here POST /api/drm/clearkey/license, which reads drm.ContentKey.
  The key is never written to disk; run the DbMigrator first so the table and procs exist.

.EXAMPLE
  .\tools\package.ps1 -Name sintel
  .\tools\package.ps1 -Name sintel -ClearKey
  .\tools\package.ps1 -Name sintel -ClearKey -SqlServer '.\SERVER'
#>
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z0-9-]+$')][string]$Name,
    [switch]$ClearKey,
    [int]$SegmentSeconds = 4,
    [string]$SqlServer = '.\SQLEXPRESS',
    [string]$Database = 'HakuTV'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_common.ps1"

$packager = Resolve-Tool 'packager'
$workDir  = Join-Path $MediaRoot "work\$Name"
if (-not (Test-Path $workDir)) { throw "Missing $workDir. Run encode.ps1 first." }

$outName = if ($ClearKey) { "$Name-clearkey" } else { $Name }
$outDir  = Join-Path $MediaRoot "packaged\$outName"
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force $outDir | Out-Null

# Packager stream descriptors use ',' and '=' as separators, so work with paths relative to media/
# (the repo path contains spaces and that keeps the descriptors simple).
Push-Location $MediaRoot
try {
    $src = "work/$Name"
    $dst = "packaged/$outName"
    $streams = @()

    Get-ChildItem $workDir -Filter 'video_*.mp4' | Sort-Object { [int]($_.BaseName -replace '\D') } | ForEach-Object {
        $h = $_.BaseName -replace '\D'
        $streams += "in=$src/$($_.Name),stream=video,init_segment=$dst/video/$h/init.mp4,segment_template=$dst/video/$h/`$Number`$.m4s,playlist_name=video_$h.m3u8"
    }
    $streams += "in=$src/audio.mp4,stream=audio,init_segment=$dst/audio/init.mp4,segment_template=$dst/audio/`$Number`$.m4s,playlist_name=audio.m3u8,hls_group_id=audio,hls_name=Audio"

    $pkgArgs = $streams + @(
        '--segment_duration', $SegmentSeconds,
        '--generate_static_live_mpd',
        '--mpd_output', "$dst/manifest.mpd",
        '--hls_master_playlist_output', "$dst/master.m3u8"
    )

    if ($ClearKey) {
        $keyId = New-HexKey
        $key   = New-HexKey
        $pkgArgs += @(
            '--enable_raw_key_encryption',
            '--keys', "label=:key_id=${keyId}:key=$key",
            '--protection_scheme', 'cenc',
            '--protection_systems', 'CommonSystem',
            '--clear_lead', '0'
        )
    }

    Invoke-Native $packager $pkgArgs 'packager'

    if ($ClearKey) {
        # Save the key only after packaging succeeded, so the DB never holds a key for content that does not exist.
        # Values are generated hex (ValidatePattern on $Name), so building the query string is safe here.
        $sqlcmd = Resolve-Tool 'sqlcmd'
        $query = "EXEC drm.usp_ContentKey_Upsert @MediaName = '$Name', @KeyId = 0x$keyId, @KeyValue = 0x$key;"
        Invoke-Native $sqlcmd @('-S', $SqlServer, '-d', $Database, '-E', '-C', '-b', '-Q', $query) `
            'Saving the key to SQL Server (did you run the DbMigrator?)'
        Write-Host "Key id $keyId saved to [$Database].drm.ContentKey (MediaName = '$Name')" -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

Write-Host "Done -> $outDir" -ForegroundColor Green
Write-Host "Test: run the API, then open http://localhost:5080/dev/player-test/?name=$outName"
