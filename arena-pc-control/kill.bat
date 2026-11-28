@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control - EMERGENCY STOP
:: Halts every tool execution immediately, even while the bridge keeps running.
:: Double-click this if the agent starts doing something you did not intend.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%") do set "ROOT_DIR=%%~fI"
set "PYTHON=%ROOT_DIR%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"

echo.
echo   ============================================================
echo    EMERGENCY STOP - halting all tool execution now
echo   ============================================================
echo.
"%PYTHON%" "%ROOT_DIR%\scripts\emergency_stop.py" --activate
echo.
echo   To resume later: "%PYTHON%" "%ROOT_DIR%\scripts\emergency_stop.py" --reset
echo.
pause
endlocal
exit /b 0
