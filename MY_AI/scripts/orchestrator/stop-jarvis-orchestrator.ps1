$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$stateDir = Join-Path $root 'data\orchestrator'
$pidFile = Join-Path $stateDir 'orchestrator.pid'
$stateFile = Join-Path $stateDir 'state.json'

function Stop-IfRunning {
  param([int]$ProcessId, [string]$Name)
  if (-not $ProcessId) { return }
  try {
    $proc = Get-Process -Id $ProcessId -ErrorAction Stop
    Stop-Process -Id $proc.Id -Force -ErrorAction Stop
    Write-Host "Stopped $Name (PID: $ProcessId)"
  }
  catch {
    Write-Host "$Name not running (PID: $ProcessId)"
  }
}

$orchestratorPid = 0
if (Test-Path $pidFile) {
  try {
    $orchestratorPid = [int](Get-Content $pidFile -Raw).Trim()
  }
  catch {
    $orchestratorPid = 0
  }
}

$sidecarPid = 0
$uiPid = 0
if (Test-Path $stateFile) {
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    $sidecarPid = [int]$state.sidecarPid
    $uiPid = [int]$state.uiPid
  }
  catch {
    $sidecarPid = 0
    $uiPid = 0
  }
}

Stop-IfRunning -ProcessId $orchestratorPid -Name 'Jarvis orchestrator'
Stop-IfRunning -ProcessId $sidecarPid -Name 'Python sidecar'
Stop-IfRunning -ProcessId $uiPid -Name 'UI server'

if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
Write-Host 'Jarvis orchestrator stop sequence complete.'
