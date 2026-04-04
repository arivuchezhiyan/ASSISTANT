param(
  [int]$TotalPhrases = 10,
  [int]$CorrectPhrases = 0,
  [string]$OutputPath = './VOICE_ACCENT_TEST_REPORT.md',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'

if ($TotalPhrases -le 0) { throw 'TotalPhrases must be > 0.' }
if ($CorrectPhrases -lt 0 -or $CorrectPhrases -gt $TotalPhrases) {
  throw 'CorrectPhrases must be between 0 and TotalPhrases.'
}

$accuracy = [math]::Round(($CorrectPhrases * 100.0) / $TotalPhrases, 2)
$verdict = if ($accuracy -ge 90) { 'PASS' } else { 'FAIL' }

$md = @()
$md += '# Voice Accent Test Report'
$md += ''
$md += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$md += ''
$md += "- Total phrases: $TotalPhrases"
$md += "- Correct phrases: $CorrectPhrases"
$md += "- Accuracy: $accuracy%"
$md += "- Verdict: $verdict (target >= 90%)"
$md += ''
if ($Notes.Trim().Length -gt 0) {
  $md += '## Notes'
  $md += $Notes
}

Set-Content -Path $OutputPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Wrote $OutputPath"
