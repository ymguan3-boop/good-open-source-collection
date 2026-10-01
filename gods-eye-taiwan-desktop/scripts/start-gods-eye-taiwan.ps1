param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Work = Join-Path $Root '.work\upstream'
$Native = Join-Path $Work 'src-tauri\target\debug\gods-eye-taiwan.exe'
$Dist = Join-Path $Work 'dist\index.html'
$Url = 'http://127.0.0.1:4173/'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LaunchLog = Join-Path $LogDir 'desktop-launch.log'

function Write-LaunchLog([string]$Message) {
  try {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" + [Environment]::NewLine
    [System.IO.File]::AppendAllText($LaunchLog, $line, [System.Text.Encoding]::UTF8)
  } catch { }
}

function Test-Ready {
  try {
    $response = Invoke-WebRequest -Uri ($Url + 'branding/quick-menu-logo-user.png') -Method Head -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Headers['Content-Type'] -match 'image/png'
  } catch { return $false }
}

try {
  if (-not (Test-Path -LiteralPath $Native -PathType Leaf)) {
    $previousBuild = Test-Path -LiteralPath (Join-Path $Work 'src-tauri\target\debug\gods-eye-taiwan.d') -PathType Leaf
    if ($previousBuild) {
      throw '桌面 EXE 曾經編譯但目前已消失。請檢查 Trend Micro Apex One 的隔離／偵測紀錄與處置原因，再由管理員確認是否為誤判；不要直接停用防護。'
    }
    throw '尚未建立桌面程式，請先執行安裝或編譯步驟。'
  }
  if (-not (Test-Path -LiteralPath $Dist -PathType Leaf)) {
    throw '尚未建立正式介面檔案（dist），請先執行 npm run build。'
  }
  $vite = Join-Path $Work 'node_modules\vite\bin\vite.js'
  if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
    throw '找不到本機服務相依套件，請先執行安裝步驟。'
  }
  if (-not (Test-Ready)) {
    if (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue) {
      throw '本機 4173 連接埠被其他程式使用，無法啟動地圖資料服務。'
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $outLog = Join-Path $LogDir "preview-$stamp.stdout.log"
    $errLog = Join-Path $LogDir "preview-$stamp.stderr.log"
    Write-LaunchLog '啟動正式版介面與本機資料服務（隱藏背景程序）。'
    $service = Start-Process -FilePath $node -ArgumentList @('--use-system-ca',$vite,'preview','--host','127.0.0.1','--port','4173','--strictPort') -WorkingDirectory $Work -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $wait = [Diagnostics.Stopwatch]::StartNew()
    while ($wait.Elapsed.TotalSeconds -lt 12 -and -not (Test-Ready)) {
      if ($service.HasExited) { break }
      Start-Sleep -Milliseconds 200
    }
    if (-not (Test-Ready)) {
      $tail = if (Test-Path -LiteralPath $errLog) { (Get-Content -LiteralPath $errLog -Tail 8) -join ' ' } else { '' }
      throw "本機服務啟動失敗。$tail"
    }
    Write-LaunchLog "本機服務已就緒，PID=$($service.Id)。"
  }
  if ($NoBrowser) { Write-LaunchLog '診斷模式：本機服務可用。'; Write-Output $Url; return }

  $existing = Get-Process gods-eye-taiwan -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $Native -and $_.MainWindowHandle -ne 0 -and $_.Responding } |
    Select-Object -First 1
  if ($existing) {
    $shell = New-Object -ComObject WScript.Shell
    $activated = $shell.AppActivate($existing.Id)
    Write-LaunchLog "喚回既有桌面視窗，PID=$($existing.Id)，成功=$activated。"
  } else {
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $LogDir 'webview2-profile'
    $nativeProcess = Start-Process -FilePath $Native -WorkingDirectory (Split-Path $Native) -PassThru
    if ($nativeProcess.WaitForExit(2500)) {
      throw "桌面程式啟動後立即結束，代碼 $($nativeProcess.ExitCode)。"
    }
    Write-LaunchLog "已啟動單一桌面視窗，PID=$($nativeProcess.Id)。"
  }
  Write-Output $Url
} catch {
  $message = $_.Exception.Message
  Write-LaunchLog "啟動失敗：$message"
  if (-not $NoBrowser) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("上帝之眼・台灣版無法開啟。`n$message`n`n詳見：$LaunchLog", '啟動失敗', 'OK', 'Error') | Out-Null
  }
  throw
}
