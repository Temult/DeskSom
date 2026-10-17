@echo off
setlocal
rem This is a process-local execution policy override for a downloaded, user-launched installer.
rem It does not change Windows policy or bypass organization Group Policy.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-DeskSom.ps1"
set "DeskSomExit=%ERRORLEVEL%"
echo Exit code: %DeskSomExit%
echo.
echo You may close this window. Do not share secrets or raw installation logs.
pause
exit /b %DeskSomExit%
