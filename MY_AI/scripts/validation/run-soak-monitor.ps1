param(
  [int]$DurationMinutes = 60,
  [int]$IntervalSeconds = 5,
  [string]$OutputPath = "./SOAK_MONITOR_REPORT.csv"
)

$ErrorActionPreference = 'Continue'

$start = Get-Date
$end = $start.AddMinutes($DurationMinutes)

$rows = New-Object 'System.Collections.Generic.List[object]'

while ((Get-Date) -lt $end) {
  $now = Get-Date

  $os = Get-CimInstance Win32_OperatingSystem
  $totalMb = [math]::Round($os.TotalVisibleMemorySize / 1024, 2)
  $freeMb = [math]::Round($os.FreePhysicalMemory / 1024, 2)
  $usedMb = [math]::Round($totalMb - $freeMb, 2)

  $unreal = Get-Process -Name UnrealEditor -ErrorAction SilentlyContinue
  $ue4 = Get-Process -Name UE4Editor -ErrorAction SilentlyContinue
  $shader = Get-Process -Name ShaderCompileWorker -ErrorAction SilentlyContinue

  $sidecarHealthy = $false
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:7823/health' -Method Get -TimeoutSec 1
    $sidecarHealthy = ($health.status -eq 'ok')
  }
  catch {
    $sidecarHealthy = $false
  }

  $rows.Add([pscustomobject]@{
    timestamp = $now.ToString('s')
    ram_used_mb = $usedMb
    ram_total_mb = $totalMb
    ram_used_percent = [math]::Round(($usedMb / [math]::Max($totalMb, 1)) * 100, 2)
    unreal_running = [bool]($unreal -or $ue4)
    shader_worker_running = [bool]$shader
    sidecar_health_ok = $sidecarHealthy
  }) | Out-Null

  Start-Sleep -Seconds $IntervalSeconds
}

$rows | Export-Csv -Path $OutputPath -NoTypeInformation -Encoding UTF8

$maxUsedMb = ($rows | Measure-Object -Property ram_used_mb -Maximum).Maximum
$avgUsedMb = [math]::Round(($rows | Measure-Object -Property ram_used_mb -Average).Average, 2)

Write-Host "Soak monitor complete."
Write-Host "Output: $OutputPath"
Write-Host "Peak RAM used (MB): $maxUsedMb"
Write-Host "Average RAM used (MB): $avgUsedMb"
