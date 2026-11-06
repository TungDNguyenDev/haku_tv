# Shared helpers for the media scripts. Dot-source it: . "$PSScriptRoot\_common.ps1"

$RepoRoot  = Split-Path $PSScriptRoot -Parent
$MediaRoot = Join-Path $RepoRoot 'media'

# Finds a tool on PATH, then in tools/bin (where Shaka Packager is kept), then in the winget ffmpeg folder
# (winget updates PATH only for terminals opened after the install).
function Resolve-Tool([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $local = Join-Path $PSScriptRoot "bin\$Name.exe"
    if (Test-Path $local) { return $local }

    $winget = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $winget) {
        $found = Get-ChildItem $winget -Recurse -Filter "$Name.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    throw "Cannot find '$Name'. Install it or put $Name.exe in tools\bin."
}

# Runs an external program and throws if its exit code is not 0.
# ffmpeg/packager write progress and logs to stderr. In Windows PowerShell 5.1, with $ErrorActionPreference = 'Stop',
# that stderr turns into a terminating error as soon as anyone redirects it (2>&1, 2>$null), so the
# preference is relaxed while the program runs and success is decided by the exit code only.
function Invoke-Native([string]$Exe, [object[]]$Arguments, [string]$What) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Exe @Arguments } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

# 16 random bytes as 32 lowercase hex chars (a key or key id for CENC).
function New-HexKey {
    $bytes = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
