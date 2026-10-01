param(
  [Parameter(Mandatory=$true)][string]$TargetPath,
  [string]$Arguments = "",
  [string]$WorkingDirectory = "",
  [switch]$UpdateExisting
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Icon = Join-Path $Root "branding\gods-eye-taiwan-v4.ico"

if (-not (Test-Path $TargetPath)) { throw "找不到啟動程式：$TargetPath" }
if (-not (Test-Path $Icon)) { throw "找不到專案 icon：$Icon" }
if (-not $WorkingDirectory) { $WorkingDirectory = Split-Path (Resolve-Path $TargetPath).Path }

$Desktop = [Environment]::GetFolderPath("Desktop")
if (-not $Desktop -and $env:OneDrive) {
  $OneDriveDesktop = Join-Path $env:OneDrive "桌面"
  if (Test-Path -LiteralPath $OneDriveDesktop -PathType Container) { $Desktop = $OneDriveDesktop }
}
if (-not $Desktop -or -not (Test-Path -LiteralPath $Desktop -PathType Container)) {
  throw "找不到目前使用者的桌面資料夾。"
}
$ShortcutPath = Join-Path $Desktop "上帝之眼-台灣版.lnk"
$TemporaryShortcutPath = Join-Path $Desktop ".gods-eye-taiwan-install.tmp.lnk"
if ((Test-Path -LiteralPath $ShortcutPath) -and -not $UpdateExisting) { throw "桌面已存在同名捷徑，為避免覆寫而停止：$ShortcutPath" }
if (Test-Path -LiteralPath $TemporaryShortcutPath) { throw "暫存捷徑已存在，請先確認後移除：$TemporaryShortcutPath" }

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($TemporaryShortcutPath)
$Shortcut.TargetPath = (Resolve-Path $TargetPath).Path
$Shortcut.Arguments = $Arguments
$Shortcut.WorkingDirectory = $WorkingDirectory
$Shortcut.IconLocation = "$Icon,0"
$Shortcut.Description = "God's Eye Taiwan"
$Shortcut.Save()
Move-Item -LiteralPath $TemporaryShortcutPath -Destination $ShortcutPath -Force

$Verified = $Shell.CreateShortcut($ShortcutPath)
if ($Verified.TargetPath -ne (Resolve-Path $TargetPath).Path -or $Verified.IconLocation -notlike "*$Icon*") {
  throw "捷徑寫入後驗證失敗：$ShortcutPath"
}

# The previous shortcut used a Unicode punctuation character that WScript.Shell
# cannot reliably resolve on this machine. Preserve it outside the desktop.
$Previous = Join-Path $Desktop "上帝之眼・台灣版.lnk"
if ($UpdateExisting -and (Test-Path -LiteralPath $Previous)) {
  $BackupDir = Join-Path $Root 'logs'
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  $Backup = Join-Path $BackupDir ("previous-desktop-shortcut-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.lnk')
  Move-Item -LiteralPath $Previous -Destination $Backup
}

Write-Host "已建立桌面捷徑：$ShortcutPath" -ForegroundColor Green
Write-Host "使用 icon：$Icon"
