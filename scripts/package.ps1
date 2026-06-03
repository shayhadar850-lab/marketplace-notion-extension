$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$outputDir = Join-Path $workspaceRoot "outputs"
$zipPath = Join-Path $outputDir "marketplace-notion-extension.zip"

if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath
}

Compress-Archive -Path (Join-Path $projectRoot "dist\*") -DestinationPath $zipPath
Write-Host "Packaged $zipPath"
