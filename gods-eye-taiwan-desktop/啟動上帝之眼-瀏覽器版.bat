@echo off
setlocal
rem ASCII only on purpose: cmd reads this file with the system code page.
rem Fall back to common Node.js install folders when PATH is not refreshed yet.
set "NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE=%ProgramFiles%\nodejs\node.exe"
  ) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
  ) else (
    echo Node.js not found. Install Node.js 26.x or 24.14+ : winget install OpenJS.NodeJS
    goto failed
  )
)
"%NODE%" "%~dp0scripts\start-gods-eye-browser.mjs"
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
