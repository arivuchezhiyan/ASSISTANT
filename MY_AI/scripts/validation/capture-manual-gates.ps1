param(
  [string]$OutputPath = './MANUAL_GATES_CAPTURE.md',
  [ValidateSet('pass','fail','skip')][string]$VoiceSttAccent = 'skip',
  [ValidateSet('pass','fail','skip')][string]$QwenActorCompile = 'skip',
  [ValidateSet('pass','fail','skip')][string]$ContextPruner1Hour = 'skip',
  [ValidateSet('pass','fail','skip')][string]$EmergencyStress = 'skip',
  [ValidateSet('pass','fail','skip')][string]$EmergencyHighRam = 'skip',
  [ValidateSet('pass','fail','skip')][string]$Stability1Hour = 'skip',
  [string]$Notes = ''
)

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function VerdictText([string]$v) {
  switch ($v) {
    'pass' { return 'PASS' }
    'fail' { return 'FAIL' }
    default { return 'SKIP' }
  }
}

$rows = @(
  [pscustomobject]@{ Gate='Voice STT accurately transcribes your accent in a quiet room'; Verdict=(VerdictText $VoiceSttAccent) },
  [pscustomobject]@{ Gate='Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE)'; Verdict=(VerdictText $QwenActorCompile) },
  [pscustomobject]@{ Gate='Context pruner caps at 4096 tokens and sessions stay stable over 1 hour'; Verdict=(VerdictText $ContextPruner1Hour) },
  [pscustomobject]@{ Gate='Emergency mode tested: stress-ng RAM fill -> AI pauses gracefully'; Verdict=(VerdictText $EmergencyStress) },
  [pscustomobject]@{ Gate='Validate emergency pause behavior under high RAM pressure'; Verdict=(VerdictText $EmergencyHighRam) },
  [pscustomobject]@{ Gate='Validate stability on 1-hour continuous session'; Verdict=(VerdictText $Stability1Hour) }
)

$md = @()
$md += '# Manual Gates Capture'
$md += ''
$md += "Date: $timestamp"
$md += ''
$md += '| Gate | Verdict |'
$md += '|---|---|'
foreach ($r in $rows) {
  $md += "| $($r.Gate) | $($r.Verdict) |"
}
$md += ''
if ($Notes.Trim().Length -gt 0) {
  $md += '## Notes'
  $md += $Notes
  $md += ''
}

Set-Content -Path $OutputPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Wrote $OutputPath"
