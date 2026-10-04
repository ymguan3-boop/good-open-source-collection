
$ErrorActionPreference = "Stop"
& node (Join-Path $PSScriptRoot 'prepare-upstream.mjs')
if ($LASTEXITCODE -ne 0) { throw '瀏覽器版上游準備失敗。既有工作區與設定不會自動清除。' }
