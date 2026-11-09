$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$folder = Join-Path $root 'data\official\dtm-2025'
$archive = Join-Path $folder 'taiwan-20m-dem-2025.zip'
$raster = Join-Path $folder 'DEM_tawiwan_V2025.tif'
$url = 'https://www.tgos.tw:443/MDE/VirtualDir_TC/Product/528530be-0710-431e-954e-2f2f5e98b0c5/不分幅_全台20MDEM(2025).zip'
$expectedZip = '2E1CD738B3C3ABBCFDBCE79AC18A5818A6EC80AA32C2813F0E21CFD909BE295C'
$expectedRaster = '59E5E980000D6E3F5A7734C6AF197934A1A5432482B6CAA789A1EC90B624015D'
function Get-DtmSha256([string]$LiteralPath) {
  $stream = [System.IO.File]::OpenRead($LiteralPath)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $hash.Dispose() }
}
New-Item -ItemType Directory -Path $folder -Force | Out-Null

if ((Test-Path -LiteralPath $raster) -and (Get-Item -LiteralPath $raster).Length -eq 756870860 -and (Get-DtmSha256 $raster) -eq $expectedRaster) {
  Write-Host '2025 全台 20 公尺 DTM 已通過 SHA-256；沿用既有原始檔，不重複下載。' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath $archive) -or (Get-Item -LiteralPath $archive).Length -lt 268985841) {
  & curl.exe -L -C - --retry 3 --max-time 600 -o $archive $url
  if ($LASTEXITCODE -ne 0) { throw "官方 DTM 下載中斷；可重新執行此腳本續傳：$archive" }
}
if ((Get-Item -LiteralPath $archive).Length -ne 268985841 -or (Get-DtmSha256 $archive) -ne $expectedZip) {
  throw "官方 DTM 壓縮檔大小或 SHA-256 不符，保留原檔供檢查：$archive"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
  foreach ($entry in $zip.Entries) {
    if ($entry.Name -notin @('DEM_tawiwan_V2025.tif','DEM_tawiwan_V2025.tfw','manifest.csv','Metadata.xml')) { continue }
    $target = Join-Path $folder $entry.Name
    if (-not (Test-Path -LiteralPath $target)) {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
    }
  }
} finally { $zip.Dispose() }

if ((Get-Item -LiteralPath $raster).Length -ne 756870860 -or (Get-DtmSha256 $raster) -ne $expectedRaster) {
  throw "官方 DTM GeoTIFF 大小或 SHA-256 不符，保留原檔供檢查：$raster"
}
Write-Host "2025 全台 20 公尺 DTM 已就緒：$raster" -ForegroundColor Green
