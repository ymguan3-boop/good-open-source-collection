$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Exe = Join-Path $Root "local-app\GodsEyeTaiwan.exe"
& (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1") -TargetPath $Exe
