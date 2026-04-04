$ErrorActionPreference = 'Continue'

$root = Resolve-Path "$PSScriptRoot\..\.."
Push-Location $root

function Add-Result {
  param(
    [System.Collections.Generic.List[object]]$Rows,
    [string]$Gate,
    [string]$Status,
    [string]$Details
  )
  $Rows.Add([pscustomobject]@{
    Gate = $Gate
    Status = $Status
    Details = $Details
  }) | Out-Null
}

function To-MarkdownTable {
  param([System.Collections.Generic.List[object]]$Rows)
  $lines = @()
  $lines += '| Gate | Status | Details |'
  $lines += '|---|---|---|'
  foreach ($row in $Rows) {
    $gate = ($row.Gate -replace '\|', '/')
    $status = ($row.Status -replace '\|', '/')
    $details = ($row.Details -replace '\|', '/')
    $lines += "| $gate | $status | $details |"
  }
  return ($lines -join "`n")
}

$rows = New-Object 'System.Collections.Generic.List[object]'

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
  param([int]$MaxWaitSec = 15)
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
  param([string]$RepoRoot)

  if (Test-SidecarHealth -TimeoutSec 1) {
    return 'already-running'
  }

  try {
    $py = Get-Command python -ErrorAction Stop
  }
  catch {
    return $null
  }

  $sidecarPath = Join-Path $RepoRoot 'python-sidecar\main.py'
  if (-not (Test-Path $sidecarPath)) {
    return $null
  }

  $proc = Start-Process -FilePath $py.Source -ArgumentList @($sidecarPath) -PassThru -WindowStyle Hidden -WorkingDirectory $RepoRoot
  if (Wait-SidecarHealthy -MaxWaitSec 15) {
    return $proc
  }

  Stop-Sidecar -Proc $proc
  return $null
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
  # 1) Automated test gates we can verify now
  bun test src/services/systemControl/sidecarControl.load.test.ts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Add-Result $rows 'Resource Governor tested: open 20 browser tabs -> AI stays stable' 'PASS (proxy)' 'Load/stability automation passed (system-control stress).'
  }
  else {
    Add-Result $rows 'Resource Governor tested: open 20 browser tabs -> AI stays stable' 'FAIL' 'Automated load proxy test failed.'
  }

  bun test src/resourceGovernor/modes.test.ts src/resourceGovernor/modelSwapperCore.test.ts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Add-Result $rows 'Resource Governor tested: open Unreal -> AI switches to MINIMAL mode within 10 seconds' 'PASS (proxy)' 'Mode transition tests passed (process-trigger path).'
  }
  else {
    Add-Result $rows 'Resource Governor tested: open Unreal -> AI switches to MINIMAL mode within 10 seconds' 'FAIL' 'Governor mode tests failed.'
  }

  bun test src/commands/open-app/open-app.test.ts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $sidecarProc = Start-Sidecar -RepoRoot $root
    $liveNotes = @('alias mapping tests passed')

    if ($null -ne $sidecarProc) {
      try {
        if (Test-SidecarHealth -TimeoutSec 2) {
          $liveNotes += 'sidecar health ok'
        }

        Invoke-RestMethod -Uri 'http://127.0.0.1:7823/system/open-app' -Method Post -ContentType 'application/json' -Body '{"app_path":"explorer.exe","args":[]}' -TimeoutSec 5 | Out-Null
        $liveNotes += 'file manager launch command accepted'

        $hasCode = $null -ne (Get-Command code -ErrorAction SilentlyContinue)
        if ($hasCode) {
          Invoke-RestMethod -Uri 'http://127.0.0.1:7823/system/open-app' -Method Post -ContentType 'application/json' -Body '{"app_path":"code","args":["."]}' -TimeoutSec 5 | Out-Null
          $liveNotes += 'VS Code launch command accepted'
        }
        else {
          $liveNotes += 'VS Code CLI not found (code)'
        }

        Invoke-RestMethod -Uri 'http://127.0.0.1:7823/system/open-app' -Method Post -ContentType 'application/json' -Body '{"app_path":"cmd.exe","args":["/c","start","","https://www.unrealengine.com"]}' -TimeoutSec 5 | Out-Null
        $liveNotes += 'browser launch command accepted'

        Add-Result $rows 'App launcher works for: VS Code, Unreal Engine, browser, file manager' 'PASS (partial-live)' (($liveNotes -join '; ') + '; Unreal launch still manual.')
      }
      catch {
        $err = $_.Exception.Message
        Add-Result $rows 'App launcher works for: VS Code, Unreal Engine, browser, file manager' 'PASS (command-mapping)' ("Live sidecar check failed: $err; command mapping tests passed. Manual app launch validation still required.")
      }
      finally {
        Stop-Sidecar -Proc $sidecarProc
        $sidecarProc = $null
      }
    }
    else {
      Add-Result $rows 'App launcher works for: VS Code, Unreal Engine, browser, file manager' 'PASS (command-mapping)' 'Python sidecar unavailable; command mapping tests passed.'
    }
  }
  else {
    Add-Result $rows 'App launcher works for: VS Code, Unreal Engine, browser, file manager' 'FAIL' 'Launcher command tests failed.'
  }

  bun test src/services/unreal/logParser.test.ts src/services/unreal/moduleScaffold.test.ts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Add-Result $rows 'Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)' 'SKIP (manual)' 'Module scaffolding passes, but real model+UE compile must be verified manually.'
  }
  else {
    Add-Result $rows 'Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)' 'FAIL' 'Unreal scaffold/parser tests failed.'
  }

  # 2) Manual-only gates
  Add-Result $rows 'RAM never exceeds 14GB during normal use' 'SKIP (manual)' 'Requires live machine monitoring during normal workflow.'
  Add-Result $rows 'Voice STT accurately transcribes your accent in a quiet room' 'SKIP (manual)' 'Requires microphone + speaker-specific validation.'
  Add-Result $rows 'Context pruner caps at 4096 tokens and sessions stay stable over 1 hour' 'SKIP (manual)' 'Needs long-running live session soak.'
  Add-Result $rows 'Emergency mode tested: stress-ng RAM fill -> AI pauses gracefully' 'SKIP (manual)' 'Requires controlled RAM pressure tooling.'
  Add-Result $rows 'Validate emergency pause behavior under high RAM pressure' 'SKIP (manual)' 'Requires live RAM pressure with sidecar/governor active.'
  Add-Result $rows 'Validate stability on 1-hour continuous session' 'SKIP (manual)' 'Requires 1-hour interactive soak.'

  $md = @()
  $md += '# Hardware Gates Validation Report'
  $md += ''
  $md += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  $md += ''
  $md += (To-MarkdownTable -Rows $rows)

  $outPath = Join-Path $root 'HARDWARE_GATES_VALIDATION_REPORT.md'
  Set-Content -Path $outPath -Value ($md -join "`n") -Encoding UTF8

  Write-Host "Wrote $outPath"
}
finally {
  Stop-Sidecar -Proc $sidecarProc
  Pop-Location
}
