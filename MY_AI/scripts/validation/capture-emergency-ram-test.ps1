param(
  [ValidateSet('pass','fail','skip')][string]$EmergencyPause = 'skip',
  [ValidateSet('pass','fail','skip')][string]$HighRamBehavior = 'skip',
  [string]$OutputPath = './EMERGENCY_RAM_TEST_REPORT.md',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'

function VerdictText([string]$v) {
  switch ($v) {
    'pass' { return 'PASS' }
    'fail' { return 'FAIL' }
    default { return 'SKIP' }
  }
}

$pauseVerdict = VerdictText $EmergencyPause
$highRamVerdict = VerdictText $HighRamBehavior

$md = @()
$md += '# Emergency RAM Test Report'
$md += ''
$md += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$md += ''
$md += '| Gate | Verdict |'
$md += '|---|---|'
$md += "| Emergency mode tested: stress-ng RAM fill -> AI pauses gracefully | $pauseVerdict |"
$md += "| Validate emergency pause behavior under high RAM pressure | $highRamVerdict |"
$md += ''
if ($Notes.Trim().Length -gt 0) {
  $md += '## Notes'
  $md += $Notes
}

Set-Content -Path $OutputPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Wrote $OutputPath"
