$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Work = Join-Path $Root ".work\upstream"

if (-not (Test-Path (Join-Path $Work "package.json"))) {
  & (Join-Path $PSScriptRoot "prepare-upstream.ps1")
}

Push-Location $Work
try {
  # Keep the local Vite provider service alive: upstream realtime feeds use /api/*.
  # --no-watch disables developer file watching/restarts for normal end users.
  npx tauri dev --release --no-watch
} finally {
  Pop-Location
}
