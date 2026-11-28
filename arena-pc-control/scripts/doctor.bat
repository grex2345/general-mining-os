@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control - full diagnostics. Run this FIRST when nothing connects.
:: It checks config, Python, dependencies, the extension files, the pairing
:: token, the bridge process, the port, the WebSocket handshake and the MCP
:: tools - then prints the exact fix for every problem it finds.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "ROOT_DIR=%%~fI"
set "PYTHON=%ROOT_DIR%\.venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"

echo   Running Arena PC Control diagnostics ...
echo.
"%PYTHON%" "%ROOT_DIR%\scripts\doctor.py" --deep %*
echo.
pause
endlocal
exit /b 0
