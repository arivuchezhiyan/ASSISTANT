param(
  [switch]$EnableWebUi
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\.."
Push-Location $root

$orchestratorStart = Join-Path $root 'scripts\orchestrator\start-jarvis-orchestrator.ps1'
if (-not (Test-Path $orchestratorStart)) {
  throw "Missing orchestrator start script: $orchestratorStart"
}

# Start Jarvis via orchestrator in integrated mode by default (no browser UI).
# Pass -EnableWebUi to this script if you explicitly want web UI mode.
if ($EnableWebUi) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $orchestratorStart -EnableWebUi -OpenBrowser | Out-Host
}
else {
  powershell -NoProfile -ExecutionPolicy Bypass -File $orchestratorStart | Out-Host
}

Pop-Location
