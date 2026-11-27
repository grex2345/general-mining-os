@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================================
:: Arena PC Control — Windows Start Script (alias for start.bat)
:: ============================================================================
:: This is the entry point referenced by the Arena PC Control extension popup.
:: It delegates to start.bat which performs full bridge startup verification.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Delegate to the main start script in the same directory
call "%SCRIPT_DIR%\start.bat" %*

if errorlevel 1 (
    echo.
    echo   Bridge startup failed. Check the error message above and the log files.
    pause
    exit /b 1
)
