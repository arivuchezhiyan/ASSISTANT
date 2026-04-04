$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\..\.."
Push-Location $root
try {
  $commands = @(
    'bun test src/voice/sttAdapter.test.ts src/voice/ttsAdapter.test.ts src/voice/voiceRouting.test.ts',
    'bun test src/services/systemControl/sidecarControl.test.ts src/services/systemControl/sidecarControl.load.test.ts src/commands/open-app/open-app.test.ts',
    'bun test src/services/unreal/projectDetector.test.ts src/services/unreal/buildRunner.test.ts src/services/unreal/logParser.test.ts src/services/unreal/fixSuggester.test.ts src/services/unreal/moduleScaffold.test.ts src/services/unreal/buildFixLoop.test.ts',
    'bun test src/security/policyAbuse.test.ts src/services/runtime/crashCheckpoint.test.ts src/benchmarks/commandKpiHarness.test.ts src/resourceGovernor/modelSwapperCore.test.ts src/resourceGovernor/modes.test.ts'
  )

  foreach ($cmd in $commands) {
    Write-Host "Running: $cmd" -ForegroundColor Cyan
    Invoke-Expression $cmd
  }

  Write-Host 'Automated readiness gates: PASS' -ForegroundColor Green
}
finally {
  Pop-Location
}
