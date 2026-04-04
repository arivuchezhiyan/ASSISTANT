param(
  [ValidateSet('pass','fail')][string]$CompileVerdict = 'fail',
  [string]$ActorName = 'GeneratedActor',
  [string]$OutputPath = './UNREAL_COMPILE_TEST_REPORT.md',
  [string]$BuildLogPath = '',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'

$verdict = if ($CompileVerdict -eq 'pass') { 'PASS' } else { 'FAIL' }

$md = @()
$md += '# Unreal Actor Compile Test Report'
$md += ''
$md += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$md += ''
$md += "- Actor/Class: $ActorName"
$md += "- Compile verdict: $verdict"
if ($BuildLogPath.Trim().Length -gt 0) {
  $md += "- Build log: $BuildLogPath"
}
$md += ''
if ($Notes.Trim().Length -gt 0) {
  $md += '## Notes'
  $md += $Notes
}

Set-Content -Path $OutputPath -Value ($md -join "`n") -Encoding UTF8
Write-Host "Wrote $OutputPath"
