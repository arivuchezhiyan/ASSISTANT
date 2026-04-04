$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$stateFile = Join-Path $root 'data\orchestrator\state.json'
$pidFile = Join-Path $root 'data\orchestrator\orchestrator.pid'

function Test-ProcessAlive {
  param([int]$ProcessId)
  if (-not $ProcessId) { return $false }
  try {
    $null = Get-Process -Id $ProcessId -ErrorAction Stop
    return $true
  }
  catch {
    return $false
  }
}

$orchestratorPid = 0
if (Test-Path $pidFile) {
  try { $orchestratorPid = [int](Get-Content $pidFile -Raw).Trim() } catch { $orchestratorPid = 0 }
}

$orchAlive = Test-ProcessAlive -ProcessId $orchestratorPid
Write-Host "Orchestrator PID: $orchestratorPid (alive=$orchAlive)"

if (-not (Test-Path $stateFile)) {
  Write-Host 'State file not found yet. The orchestrator may still be booting or failed early.'
  exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$sidecarAlive = Test-ProcessAlive -ProcessId ([int]$state.sidecarPid)
$uiAlive = Test-ProcessAlive -ProcessId ([int]$state.uiPid)

Write-Host "Sidecar PID: $($state.sidecarPid) (alive=$sidecarAlive)"
Write-Host "UI PID: $($state.uiPid) (alive=$uiAlive)"
Write-Host "Last sidecar health: $($state.lastSidecarHealthy)"
Write-Host "Last UI health: $($state.lastUiHealthy)"
Write-Host "Last updated: $($state.lastUpdatedAt)"

if ([int]$state.sidecarPid -eq 0 -and $state.lastSidecarHealthy) {
  Write-Host 'Sidecar is healthy and currently owned by an external process.'
}

if ([int]$state.uiPid -eq 0 -and $state.lastUiHealthy) {
  Write-Host 'UI server is healthy and currently owned by an external process.'
}
