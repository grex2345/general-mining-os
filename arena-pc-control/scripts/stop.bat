@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control - stop the local bridge and free port 18765.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "ROOT_DIR=%%~fI"
set "PYTHON=%ROOT_DIR%\.venv\Scripts\python.exe"
set "BRIDGE_PORT=18765"

if not exist "%PYTHON%" (
    echo   .venv not found - nothing to stop.
    pause
    exit /b 0
)

echo   Stopping the Arena PC Control bridge ...
"%PYTHON%" "%ROOT_DIR%\scripts\bootstrap.py" stop --port %BRIDGE_PORT%
echo.
pause
endlocal
exit /b 0
