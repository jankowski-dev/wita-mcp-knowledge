# install.ps1 - copy WITA skills into the global OpenCode skills folder
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "skills"
$dst = Join-Path $env:USERPROFILE ".config\opencode\skills"

if (-not (Test-Path $src)) { Write-Error "skills folder not found: $src"; exit 1 }
New-Item -ItemType Directory -Force -Path $dst | Out-Null

Get-ChildItem $src -Directory | ForEach-Object {
    $target = Join-Path $dst $_.Name
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Copy-Item $_.FullName $target -Recurse -Force
    Write-Output "installed: $($_.Name)"
}

Write-Output "Done -> $dst"
