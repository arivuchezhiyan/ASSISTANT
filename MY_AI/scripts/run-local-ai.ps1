param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\.."
Push-Location $root

$sidecarProc = $null

function Test-CommandExists {
  param([string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-SidecarHealthy {
  param([int]$MaxWaitSec = 15)
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7823/health' -Method Get -TimeoutSec 1
      if ($health.status -eq 'ok') {
        return $true
      }
    }
    catch {
      # keep retrying until deadline
    }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

try {
  if (-not (Test-CommandExists -Name 'bun')) {
    throw 'bun is not installed or not on PATH.'
  }

  if (-not (Test-CommandExists -Name 'python')) {
    throw 'python is not installed or not on PATH.'
  }

  python -c "import fastapi,uvicorn,pyperclip,psutil" | Out-Null

  $sidecarPath = Join-Path $root 'python-sidecar\main.py'
  if (-not (Test-Path $sidecarPath)) {
    throw "Missing sidecar entrypoint: $sidecarPath"
  }

  $sidecarProc = Start-Process -FilePath 'python' -ArgumentList @($sidecarPath) -PassThru -WindowStyle Hidden -WorkingDirectory $root
  if (-not (Wait-SidecarHealthy -MaxWaitSec 15)) {
    throw 'Python sidecar failed to become healthy on http://127.0.0.1:7823/health'
  }

  Write-Host 'Python sidecar is healthy.' -ForegroundColor Green

  if ($CheckOnly) {
    Write-Host 'Check-only mode complete.' -ForegroundColor Green
    exit 0
  }

  Write-Host 'Starting MY_AI CLI...' -ForegroundColor Cyan
  bun run src/main.tsx
}
finally {
  if ($null -ne $sidecarProc -and -not $sidecarProc.HasExited) {
    Stop-Process -Id $sidecarProc.Id -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}
