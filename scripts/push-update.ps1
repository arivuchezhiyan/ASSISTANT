param(
  [Parameter(Mandatory = $true)]
  [string]$Message,

  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path "$PSScriptRoot\.."
Push-Location $root

try {
  if (-not (Test-Path '.git')) {
    throw 'No git repository found at project root.'
  }

  git add .

  $status = git status --porcelain=v1
  if (-not $status) {
    Write-Host 'No changes to commit.' -ForegroundColor Yellow
    exit 0
  }

  git commit -m $Message
  git push origin $Branch

  Write-Host "Pushed to origin/$Branch" -ForegroundColor Green
}
finally {
  Pop-Location
}
