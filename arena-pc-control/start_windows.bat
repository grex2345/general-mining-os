@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control — Windows entry point
:: ============================================================================
:: This is the file referenced by the extension popup and the README.
:: It performs the same security check as scripts\start.bat (never run elevated)
:: and then delegates to it, so every launch path goes through one verified flow.
:: ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

title Arena PC Control — Local Secure Bridge

net session >nul 2>&1
if not errorlevel 1 (
    echo.
    echo   [SECURITY BLOCK] Do NOT run start_windows.bat as Administrator.
    echo   Double-click it normally as a standard Windows user.
    echo.
    pause
    exit /b 1
)

call "%SCRIPT_DIR%\scripts\start.bat" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
    echo.
    echo   Bridge startup failed ^(exit code %RC%^).
    echo   Review the messages above, then check:
    echo     %SCRIPT_DIR%logs\bridge.stderr.log
    pause
    exit /b %RC%
)
endlocal
exit /b 0
