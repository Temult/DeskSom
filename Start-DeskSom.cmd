@echo off
setlocal
rem DeskSom graphical setup. This does not change machine execution-policy settings.
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Start-DeskSom-GUI.ps1" %*
set "Code=%ERRORLEVEL%"
if not "%Code%"=="0" (
  echo DeskSom setup needs attention. Code: %Code%
  pause
)
exit /b %Code%
