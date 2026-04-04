param(
  [string]$CapturePath = './MANUAL_GATES_CAPTURE.md',
  [string]$BlueprintPath = './MY_AI_HARDWARE_OPTIMIZED_BLUEPRINT.md'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $CapturePath)) {
  throw "Capture file not found: $CapturePath"
}
if (-not (Test-Path $BlueprintPath)) {
  throw "Blueprint file not found: $BlueprintPath"
}

$capture = Get-Content $CapturePath -Raw
$blueprint = Get-Content $BlueprintPath -Raw

$map = @(
  @{ Gate = 'Voice STT accurately transcribes your accent in a quiet room'; Line = '- [ ] Voice STT accurately transcribes your accent in a quiet room'; Done = '- [x] Voice STT accurately transcribes your accent in a quiet room' },
  @{ Gate = 'Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)'; Line = '- [ ] Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)'; Done = '- [x] Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)' },
  @{ Gate = 'Context pruner caps at 4096 tokens and sessions stay stable over 1 hour'; Line = '- [ ] Context pruner caps at 4096 tokens and sessions stay stable over 1 hour'; Done = '- [x] Context pruner caps at 4096 tokens and sessions stay stable over 1 hour' },
  @{ Gate = 'Emergency mode tested: stress-ng RAM fill -> AI pauses gracefully'; Line = '- [ ] Emergency mode tested: `stress-ng` RAM fill → AI pauses gracefully'; Done = '- [x] Emergency mode tested: `stress-ng` RAM fill → AI pauses gracefully' },
  @{ Gate = 'Validate emergency pause behavior under high RAM pressure'; Line = '- [ ] Validate emergency pause behavior under high RAM pressure'; Done = '- [x] Validate emergency pause behavior under high RAM pressure' },
  @{ Gate = 'Validate stability on 1-hour continuous session'; Line = '- [ ] Validate stability on 1-hour continuous session'; Done = '- [x] Validate stability on 1-hour continuous session' }
)

foreach ($entry in $map) {
  $pattern = [regex]::Escape("| $($entry.Gate) | PASS |")
  if ($capture -match $pattern) {
    $blueprint = $blueprint.Replace($entry.Line, $entry.Done)
  }
}

Set-Content -Path $BlueprintPath -Value $blueprint -Encoding UTF8
Write-Host "Applied PASS manual gates to $BlueprintPath"
