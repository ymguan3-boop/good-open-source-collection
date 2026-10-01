@echo off
setlocal
node.exe "%~dp0scripts\start-gods-eye-browser.mjs"
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
