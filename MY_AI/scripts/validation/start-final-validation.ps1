$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$logDir = Join-Path $root 'validation-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir "final-validation-$stamp.log"

$cmd = "Set-Location '$root'; powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-readiness-cycle.ps1 -DurationMinutes 60 -IntervalSeconds 5 -RamLimitGb 14 *> '$logPath'"

$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-Command', $cmd) -PassThru -WindowStyle Hidden

Write-Host "Started final validation process."
Write-Host "PID: $($proc.Id)"
Write-Host "Log: $logPath"
