$ErrorActionPreference = 'Stop'

$root = (Resolve-Path "$PSScriptRoot\..").Path
$bootScript = Join-Path $root 'scripts\boot-jarvis.ps1'
if (-not (Test-Path $bootScript)) {
  throw "Missing boot script: $bootScript"
}

$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$shortcutPath = Join-Path $startupDir 'MY_AI_Jarvis.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$bootScript`""
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = 'powershell.exe,0'
$shortcut.Save()

Write-Host "Installed startup shortcut: $shortcutPath"
Write-Host 'Jarvis orchestrator will auto-start after Windows sign-in (sidecar + UI self-healing enabled).'
