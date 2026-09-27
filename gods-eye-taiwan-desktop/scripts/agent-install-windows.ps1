$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Work = Join-Path $Root ".work\upstream"

function Require-Command($Name, $Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "缺少 $Name。$Hint"
  }
}

Write-Host "=== 上帝之眼・台灣版 Agent 安裝 ===" -ForegroundColor Cyan
Require-Command "git" "請先安裝 Git。"
Require-Command "node" "請安裝符合 God's Eye View 要求的 Node.js 24.14+ 或 26.x。"
Require-Command "npm" "Node.js 安裝後應包含 npm。"
Require-Command "cargo" "請先安裝 Rust stable / Cargo。"

$nodeVersion = (node -p "process.versions.node")
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if (-not (($nodeMajor -eq 24 -and [version]$nodeVersion -ge [version]"24.14.0") -or $nodeMajor -eq 26)) {
  throw "目前 Node.js $nodeVersion 不符合上游要求：>=24.14 <25 或 >=26 <27。"
}

& (Join-Path $PSScriptRoot "prepare-upstream.ps1")

Push-Location $Work
try {
  Write-Host "安裝 JavaScript 相依套件..." -ForegroundColor Cyan
  npm install
  Write-Host "檢查 Tauri / Rust 桌面核心..." -ForegroundColor Cyan
  cargo check --release --manifest-path .\src-tauri\Cargo.toml
} finally {
  Pop-Location
}

$PowerShell = (Get-Command powershell.exe).Source
$Launcher = Join-Path $Root "scripts\start-gods-eye-taiwan.ps1"
$Args = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
& (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1") -TargetPath $PowerShell -Arguments $Args -WorkingDirectory $Root

Write-Host ""
Write-Host "完成。" -ForegroundColor Green
Write-Host "啟動腳本：$Launcher"
Write-Host "桌面捷徑：上帝之眼・台灣版"
Write-Host "啟動時會同時啟動本機 provider service，確保 CCTV/OSM 等 /api 即時功能可用。"
