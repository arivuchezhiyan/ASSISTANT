param(
  [int]$DurationMinutes = 60,
  [int]$IntervalSeconds = 5,
  [double]$RamLimitGb = 14.0
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\..\.."
Push-Location $root

$sidecarProc = $null

function Test-SidecarHealth {
  param([int]$TimeoutSec = 2)
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7823/health' -Method Get -TimeoutSec $TimeoutSec
    return ($health.status -eq 'ok')
  }
  catch {
    return $false
  }
}

function Wait-SidecarHealthy {
  param([int]$MaxWaitSec = 20)
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-SidecarHealth -TimeoutSec 1) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-Sidecar {
  if (Test-SidecarHealth -TimeoutSec 1) {
    return 'already-running'
  }

  $sidecarPath = Join-Path $root 'python-sidecar\main.py'
  if (-not (Test-Path $sidecarPath)) {
    throw "Missing sidecar file: $sidecarPath"
  }

  $sidecarProc = Start-Process -FilePath 'python' -ArgumentList @($sidecarPath) -PassThru -WindowStyle Hidden -WorkingDirectory $root
  if (-not (Wait-SidecarHealthy -MaxWaitSec 20)) {
    if ($sidecarProc -and -not $sidecarProc.HasExited) {
      Stop-Process -Id $sidecarProc.Id -Force -ErrorAction SilentlyContinue
    }
    throw 'Sidecar failed to become healthy.'
  }

  return $sidecarProc
}

function Stop-Sidecar {
  param($Proc)
  if ($Proc -eq 'already-running') {
    return
  }
  if ($null -ne $Proc -and -not $Proc.HasExited) {
    Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
  }
}

try {
  Write-Host 'Starting readiness cycle...' -ForegroundColor Cyan

  # Quick prerequisite check
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-ai.ps1 -CheckOnly | Out-Host

  $sidecarProc = Start-Sidecar
  Write-Host 'Sidecar healthy. Running soak monitor...' -ForegroundColor Green

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $soakCsv = "./SOAK_MONITOR_REPORT-$timestamp.csv"
  $soakMd = "./SOAK_MONITOR_ANALYSIS-$timestamp.md"

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-soak-monitor.ps1 -DurationMinutes $DurationMinutes -IntervalSeconds $IntervalSeconds -OutputPath $soakCsv | Out-Host

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/analyze-soak-report.ps1 -InputCsv $soakCsv -OutputMarkdown $soakMd -RamLimitGb $RamLimitGb -MinDurationMinutes 60 | Out-Host

  Write-Host 'Running hardware gates...' -ForegroundColor Green
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-hardware-gates.ps1 | Out-Host

  $summaryPath = "./READINESS_CYCLE_REPORT-$timestamp.md"
  $summary = @()
  $summary += '# Readiness Cycle Report'
  $summary += ''
  $summary += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  $summary += ''
  $summary += "- Soak CSV: $soakCsv"
  $summary += "- Soak analysis: $soakMd"
  $summary += "- Hardware gates: HARDWARE_GATES_VALIDATION_REPORT.md"
  $summary += ''
  $summary += 'Next step: review soak analysis and hardware gates, then update readiness checklist items that have hard PASS evidence.'

  Set-Content -Path $summaryPath -Value ($summary -join "`n") -Encoding UTF8
  Write-Host "Wrote $summaryPath" -ForegroundColor Green
}
finally {
  Stop-Sidecar -Proc $sidecarProc
  Pop-Location
}
