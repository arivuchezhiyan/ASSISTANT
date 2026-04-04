param(
  [string]$LogPath
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$logDir = Join-Path $root 'validation-logs'

if (-not $LogPath) {
  if (-not (Test-Path $logDir)) {
    Write-Host 'No validation log directory found yet.'
    exit 0
  }
  $latest = Get-ChildItem $logDir -Filter 'final-validation-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $latest) {
    Write-Host 'No validation logs found yet.'
    exit 0
  }
  $LogPath = $latest.FullName
}

if (-not (Test-Path $LogPath)) {
  Write-Host "Log file not found: $LogPath"
  exit 1
}

Write-Host "Log: $LogPath"
Get-Content $LogPath -Tail 40
