param(
  [Parameter(Mandatory=$true)][string]$TargetPath,
  [string]$Arguments = "",
  [string]$WorkingDirectory = ""
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Icon = Join-Path $Root "branding\gods-eye-taiwan.ico"

if (-not (Test-Path $TargetPath)) { throw "找不到啟動程式：$TargetPath" }
if (-not (Test-Path $Icon)) { throw "找不到專案 icon：$Icon" }
if (-not $WorkingDirectory) { $WorkingDirectory = Split-Path (Resolve-Path $TargetPath).Path }

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "上帝之眼・台灣版.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = (Resolve-Path $TargetPath).Path
$Shortcut.Arguments = $Arguments
$Shortcut.WorkingDirectory = $WorkingDirectory
$Shortcut.IconLocation = "$Icon,0"
$Shortcut.Description = "上帝之眼・台灣版｜AI 空間審計工作台"
$Shortcut.Save()

Write-Host "已建立桌面捷徑：$ShortcutPath" -ForegroundColor Green
Write-Host "使用 icon：$Icon"
