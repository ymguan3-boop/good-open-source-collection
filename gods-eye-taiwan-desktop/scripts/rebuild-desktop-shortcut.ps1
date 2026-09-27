$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Launcher = Join-Path $Root "scripts\start-gods-eye-taiwan.ps1"
$PowerShell = (Get-Command powershell.exe).Source
$Args = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
& (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1") -TargetPath $PowerShell -Arguments $Args -WorkingDirectory $Root
