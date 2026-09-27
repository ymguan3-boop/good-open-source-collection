$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Work = Join-Path $Root ".work\upstream"
$LocalApp = Join-Path $Root "local-app"
$ExeSource = Join-Path $Work "src-tauri\target\release\gods-eye-taiwan.exe"
$ExeTarget = Join-Path $LocalApp "GodsEyeTaiwan.exe"

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

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
$nodeVersion = (node -p "process.versions.node")
if (-not (($nodeMajor -eq 24 -and [version]$nodeVersion -ge [version]"24.14.0") -or $nodeMajor -eq 26)) {
  throw "目前 Node.js $nodeVersion 不符合上游要求：>=24.14 <25 或 >=26 <27。"
}

& (Join-Path $PSScriptRoot "prepare-upstream.ps1")

Push-Location $Work
try {
  Write-Host "安裝 JavaScript 相依套件..." -ForegroundColor Cyan
  npm install
  Write-Host "本機編譯桌面程式（不產生安裝器）..." -ForegroundColor Cyan
  npx tauri build --no-bundle
} finally {
  Pop-Location
}

if (-not (Test-Path $ExeSource)) {
  throw "找不到編譯後執行檔：$ExeSource"
}

New-Item -ItemType Directory -Force -Path $LocalApp | Out-Null
Copy-Item $ExeSource $ExeTarget -Force
Copy-Item (Join-Path $Root "branding\gods-eye-taiwan.ico") (Join-Path $LocalApp "gods-eye-taiwan.ico") -Force

& (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1") -TargetPath $ExeTarget

Write-Host ""
Write-Host "完成。" -ForegroundColor Green
Write-Host "程式：$ExeTarget"
Write-Host "桌面捷徑：上帝之眼・台灣版"
