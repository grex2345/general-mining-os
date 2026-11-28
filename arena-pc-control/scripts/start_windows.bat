@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control — start_windows.bat
:: ============================================================================
:: Compatibility shim. The real launcher is scripts\start.bat (full environment
:: bootstrap + multi-stage verification). Keeping one implementation avoids the
:: drift that previously left this file starting the bridge with no config file
:: and no verification at all.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

call "%SCRIPT_DIR%\start.bat" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo   Bridge startup failed ^(exit code %RC%^).
    pause
    exit /b %RC%
)
endlocal
exit /b 0
