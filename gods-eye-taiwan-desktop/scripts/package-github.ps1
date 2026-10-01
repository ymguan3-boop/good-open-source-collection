param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot ('release/github-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip') }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) { throw '輸出檔已存在，請使用新的檔名。' }
$raw = & git -C $projectRoot -c core.quotepath=false ls-files --cached --others --exclude-standard -z -- .
if ($LASTEXITCODE -ne 0) { throw '無法讀取 Git 檔案清單。' }
$paths = (($raw -join "`n").Split([char]0) | Where-Object { $_ } | Sort-Object -Unique)
Add-Type -AssemblyName System.IO.Compression
New-Item -ItemType Directory -Path (Split-Path $OutputPath) -Force | Out-Null
$stream = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
$manifest = @()
try {
  foreach ($relative in $paths) {
    $relative = $relative.Replace('\', '/')
    if ($relative -match '(^|/)(\.git|\.work|\.gev-cache|node_modules|dist|target|logs|local-app|release)(/|$)' -or $relative -match '(^|/)\.env($|\.)' -or $relative.StartsWith('data/official/dtm-2025/') -or $relative.EndsWith('.log')) { continue }
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $sourcePath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '檔案超出專案路徑。' }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $sourcePath
    if ($item.LinkType) { throw "不打包連結檔案：$relative" }
    if ($item.Length -gt 95MB) { throw "超過 GitHub 一般檔案大小預算：$relative" }
    $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
    $input = [IO.File]::OpenRead($sourcePath)
    $output = $entry.Open()
    try { $input.CopyTo($output) } finally { $input.Dispose(); $output.Dispose() }
    $manifest += @{ path=$relative; bytes=$item.Length; sha256=(Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash }
  }
  $entry = $archive.CreateEntry('PACKAGE-MANIFEST.json')
  $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write(($manifest | ConvertTo-Json -Depth 4)) } finally { $writer.Dispose() }
} finally { $archive.Dispose(); $stream.Dispose() }
[pscustomobject]@{ path=$OutputPath; files=$manifest.Count; bytes=(Get-Item -LiteralPath $OutputPath).Length; sha256=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash } | ConvertTo-Json
