param(
  [switch]$RunLoop,
  [int]$PollIntervalSec = 5,
  [switch]$EnableWebUi = $false,
  [switch]$OpenBrowser = $false
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$stateDir = Join-Path $root 'data\orchestrator'
$logDir = Join-Path $root 'orchestrator-logs'
$pidFile = Join-Path $stateDir 'orchestrator.pid'
$stateFile = Join-Path $stateDir 'state.json'

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-OrchestratorLog {
  param([string]$Message)
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "[$stamp] $Message"
  $logPath = Join-Path $logDir ("orchestrator-" + (Get-Date -Format 'yyyyMMdd') + ".log")
  Add-Content -Path $logPath -Value $line
}

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

function Test-SidecarHealthy {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7823/health' -Method Get -TimeoutSec 2
    return ($health.status -eq 'ok')
  }
  catch {
    return $false
  }
}

function Test-UiHealthy {
  try {
    $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8091/index.html' -Method Get -TimeoutSec 2 -UseBasicParsing
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  }
  catch {
    return $false
  }
}

function Read-State {
  if (-not (Test-Path $stateFile)) {
    return [ordered]@{
      orchestratorPid = $PID
      sidecarPid = 0
      uiPid = 0
      startedAt = (Get-Date).ToString('s')
      lastSidecarHealthy = $false
      lastUiHealthy = $false
      lastUpdatedAt = (Get-Date).ToString('s')
    }
  }

  try {
    return Get-Content $stateFile -Raw | ConvertFrom-Json -AsHashtable
  }
  catch {
    return [ordered]@{
      orchestratorPid = $PID
      sidecarPid = 0
      uiPid = 0
      startedAt = (Get-Date).ToString('s')
      lastSidecarHealthy = $false
      lastUiHealthy = $false
      lastUpdatedAt = (Get-Date).ToString('s')
    }
  }
}

function Save-State {
  param([hashtable]$State)
  $State.orchestratorPid = $PID
  $State.lastUpdatedAt = (Get-Date).ToString('s')
  $State | ConvertTo-Json -Depth 8 | Set-Content -Path $stateFile -Encoding UTF8
}

function Start-Sidecar {
  if ($null -eq (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python is not installed or not on PATH.'
  }

  $sidecarPath = Join-Path $root 'python-sidecar\main.py'
  if (-not (Test-Path $sidecarPath)) {
    throw "Missing sidecar entrypoint: $sidecarPath"
  }

  $proc = Start-Process -FilePath 'python' -ArgumentList @($sidecarPath) -PassThru -WindowStyle Hidden -WorkingDirectory $root
  Write-OrchestratorLog "Started sidecar. pid=$($proc.Id)"
  return $proc.Id
}

function Start-UiServer {
  if ($null -eq (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python is not installed or not on PATH.'
  }

  $uiRoot = Join-Path $root 'web-ui'
  if (-not (Test-Path $uiRoot)) {
    throw "Missing UI directory: $uiRoot"
  }

  $proc = Start-Process -FilePath 'python' -ArgumentList @('-m', 'http.server', '8091', '-d', $uiRoot) -PassThru -WindowStyle Hidden -WorkingDirectory $root
  Write-OrchestratorLog "Started UI server. pid=$($proc.Id)"
  return $proc.Id
}

if (-not $RunLoop) {
  if (Test-Path $pidFile) {
    try {
      $existingPid = [int](Get-Content $pidFile -Raw).Trim()
      if (Test-ProcessAlive -ProcessId $existingPid) {
        Write-Host "Jarvis orchestrator already running. PID: $existingPid"
        exit 0
      }
    }
    catch {
      # stale pid file
    }
  }

  $self = $MyInvocation.MyCommand.Path
  $args = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $self,
    '-RunLoop',
    '-PollIntervalSec', $PollIntervalSec
  )

  if ($EnableWebUi) {
    $args += '-EnableWebUi'
  }

  if ($OpenBrowser) {
    $args += '-OpenBrowser'
  }

  $daemon = Start-Process -FilePath 'powershell.exe' -ArgumentList $args -PassThru -WindowStyle Hidden -WorkingDirectory $root
  Set-Content -Path $pidFile -Value $daemon.Id -Encoding UTF8
  Write-Host "Started Jarvis orchestrator. PID: $($daemon.Id)"
  Write-Host "State file: $stateFile"
  exit 0
}

Write-OrchestratorLog "Orchestrator loop starting. pid=$PID"
Set-Content -Path $pidFile -Value $PID -Encoding UTF8

$state = Read-State
$browserOpened = $false

while ($true) {
  try {
    $sidecarHealthy = Test-SidecarHealthy
    $uiHealthy = if ($EnableWebUi) { Test-UiHealthy } else { $true }

    $trackedSidecarAlive = Test-ProcessAlive -ProcessId ([int]$state.sidecarPid)
    if ($trackedSidecarAlive) {
      if (-not $sidecarHealthy) {
        $state.sidecarPid = Start-Sidecar
        $sidecarHealthy = Test-SidecarHealthy
      }
    }
    elseif (-not $sidecarHealthy) {
      $state.sidecarPid = Start-Sidecar
      $sidecarHealthy = Test-SidecarHealthy
    }
    else {
      $state.sidecarPid = 0
    }

    if ($EnableWebUi) {
      $trackedUiAlive = Test-ProcessAlive -ProcessId ([int]$state.uiPid)
      if ($trackedUiAlive) {
        if (-not $uiHealthy) {
          $state.uiPid = Start-UiServer
          $uiHealthy = Test-UiHealthy
        }
      }
      elseif (-not $uiHealthy) {
        $state.uiPid = Start-UiServer
        $uiHealthy = Test-UiHealthy
      }
      else {
        $state.uiPid = 0
      }
    }
    else {
      $state.uiPid = 0
    }

    $state.lastSidecarHealthy = $sidecarHealthy
    $state.lastUiHealthy = $uiHealthy

    if ($EnableWebUi -and $OpenBrowser -and -not $browserOpened -and $state.lastUiHealthy) {
      Start-Process 'http://127.0.0.1:8091/index.html' | Out-Null
      $browserOpened = $true
      Write-OrchestratorLog 'Opened Jarvis UI in default browser.'
    }

    Save-State -State $state

    if ($state.lastSidecarHealthy -and $state.lastUiHealthy) {
      Write-OrchestratorLog "Health OK. sidecar=$($state.sidecarPid) ui=$($state.uiPid)"
    }
    else {
      Write-OrchestratorLog "Health degraded. sidecarHealthy=$($state.lastSidecarHealthy) uiHealthy=$($state.lastUiHealthy)"
    }
  }
  catch {
    Write-OrchestratorLog ("Loop error: " + $_.Exception.Message)
  }

  Start-Sleep -Seconds $PollIntervalSec
}
