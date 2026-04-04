param(
  [string]$InputCsv = './SOAK_MONITOR_REPORT.csv',
  [string]$OutputMarkdown = './SOAK_MONITOR_ANALYSIS.md',
  [double]$RamLimitGb = 14.0,
  [double]$MinDurationMinutes = 60
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputCsv)) {
  throw "Input CSV not found: $InputCsv"
}

$rows = Import-Csv -Path $InputCsv
if ($rows.Count -eq 0) {
  throw 'Input CSV has no rows.'
}

$firstTs = [datetime]::Parse($rows[0].timestamp)
$lastTs = [datetime]::Parse($rows[$rows.Count - 1].timestamp)
$durationMinutes = [math]::Round(($lastTs - $firstTs).TotalMinutes, 2)

$ramUsedGb = @()
$sidecarUpCount = 0
$unrealSeenCount = 0

foreach ($row in $rows) {
  $ramUsedGb += ([double]$row.ram_used_mb / 1024.0)
  if ($row.sidecar_health_ok -eq 'True') { $sidecarUpCount += 1 }
  if ($row.unreal_running -eq 'True') { $unrealSeenCount += 1 }
}

$peakRamGb = [math]::Round(($ramUsedGb | Measure-Object -Maximum).Maximum, 2)
$avgRamGb = [math]::Round(($ramUsedGb | Measure-Object -Average).Average, 2)
$sidecarUpPct = [math]::Round(($sidecarUpCount * 100.0) / [math]::Max($rows.Count, 1), 2)
$unrealSeenPct = [math]::Round(($unrealSeenCount * 100.0) / [math]::Max($rows.Count, 1), 2)

$ramGate = if ($peakRamGb -le $RamLimitGb) { 'PASS' } else { 'FAIL' }
$durationGate = if ($durationMinutes -ge $MinDurationMinutes) { 'PASS' } else { 'SKIP' }
$stabilityGate = if ($durationGate -eq 'PASS') { 'PASS' } else { 'SKIP' }

$notes = @()
if ($durationGate -ne 'PASS') {
  $notes += "Run longer soak: $durationMinutes min observed, $MinDurationMinutes min required."
}
if ($sidecarUpPct -lt 95) {
  $notes += "Sidecar health was below 95% of samples ($sidecarUpPct%)."
}
if ($notes.Count -eq 0) {
  $notes += 'All analyzed criteria met for captured duration.'
}

$md = @()
$md += '# Soak Monitor Analysis'
$md += ''
$md += "Input CSV: $InputCsv"
$md += "Rows: $($rows.Count)"
$md += "Duration (minutes): $durationMinutes"
$md += ''
$md += '| Metric | Value |'
$md += '|---|---|'
$md += "| Peak RAM (GB) | $peakRamGb |"
$md += "| Average RAM (GB) | $avgRamGb |"
$md += "| Sidecar health up (%) | $sidecarUpPct |"
$md += "| Unreal detected (%) | $unrealSeenPct |"
$md += ''
$md += '| Gate | Verdict | Rule |'
$md += '|---|---|---|'
$md += "| RAM never exceeds ${RamLimitGb}GB during normal use | $ramGate | peak RAM <= ${RamLimitGb}GB |"
$md += "| Validate stability on 1-hour continuous session | $stabilityGate | soak duration >= ${MinDurationMinutes} minutes |"
$md += ''
$md += '## Notes'
foreach ($n in $notes) {
  $md += "- $n"
}

Set-Content -Path $OutputMarkdown -Value ($md -join "`n") -Encoding UTF8
Write-Host "Wrote $OutputMarkdown"
