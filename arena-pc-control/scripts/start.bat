@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================================
:: Arena PC Control — Local Bridge Start Script
:: ============================================================================
:: Starts the shared local Bridge and PC-control services.
::
:: WORKFLOW:
::   1. Run this script (start.bat)
::   2. Install the Chrome/Edge extension from arena-pc-control/extension
::   3. Pair with the Bridge using the pairing token
::   4. Open Arena.ai and use a supported AI Agent to control your PC
::
:: ARCHITECTURE:
::   Arena AI Agent (brain) -> Extension -> Local Bridge -> PC Control -> Windows
::
:: No additional AI API keys required. The Arena Agent is the brain.
:: ============================================================================

:: ---- Configuration ----
set "BRIDGE_PORT=18765"
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "ROOT_DIR=%SCRIPT_DIR%\.."
set "VENV_DIR=%ROOT_DIR%\.venv"
set "LOG_DIR=%ROOT_DIR%\logs"
set "BRIDGE_SCRIPT=%ROOT_DIR%\bridge\server.py"
set "CONFIG_FILE=%ROOT_DIR%\config.default.json"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VERIFY_SCRIPT=%ROOT_DIR%\scripts\verify_bridge.py"
set "STDOUT_LOG=%LOG_DIR%\bridge.stdout.log"
set "STDERR_LOG=%LOG_DIR%\bridge.stderr.log"

:: ---- Create directories ----
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: ============================================================================
echo   ARENA PC CONTROL — LOCAL BRIDGE START
echo   ============================================================================
echo.
echo   The existing Arena AI Agent is the brain.
echo   This system provides execution infrastructure (tools, eyes, hands).
echo   No additional AI API keys required.
echo.

:: ---- Step 1: Check Python ----
echo   [1/5] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Python is not installed or not in PATH.
    echo   Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)
echo   Python found.

:: ---- Step 2: Bootstrap virtual environment ----
echo.
echo   [2/5] Setting up virtual environment...
if not exist "%PYTHON%" (
    echo   Creating virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo.
        echo   ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
)
echo   Installing dependencies from requirements.txt...
"%PYTHON%" -m pip install --quiet -r "%ROOT_DIR%\requirements.txt"
if errorlevel 1 (
    echo.
    echo   WARNING: Dependency installation may have failed. Continuing anyway...
)

:: ---- Step 3: Start the Bridge ----
echo.
echo   [3/5] Starting local Bridge (ws://127.0.0.1:%BRIDGE_PORT%)...

:: Clean old logs
if exist "%STDOUT_LOG%" del "%STDOUT_LOG%" 2>nul
if exist "%STDERR_LOG%" del "%STDERR_LOG%" 2>nul

:: Start Bridge in background (same window, no new window created)
:: /D sets the working directory to ROOT_DIR so relative imports work
start "Arena PC Bridge" /B /D "%ROOT_DIR%" "%PYTHON%" "%BRIDGE_SCRIPT%" --config "%CONFIG_FILE%"

:: Wait for bridge to initialize
echo   Waiting for bridge to initialize...
timeout /t 5 >nul

:: Check if python.exe process exists (bridge should be running)
tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2>nul | findstr /i /c:"python.exe" >nul
if errorlevel 1 (
    echo.
    echo   WARNING: Could not confirm Bridge process is running.
    echo   Check error log: %STDERR_LOG%
)

:: ---- Step 4: Verify Bridge is operational (multi-stage) ----
echo.
echo   [4/5] Verifying Bridge is operational...
echo   Stage 1/4: TCP port listening...
echo   Stage 2/4: WebSocket handshake...
echo   Stage 3/4: Authentication...
echo   Stage 4/4: MCP tools operational...
"%PYTHON%" "%VERIFY_SCRIPT%" --port %BRIDGE_PORT% --timeout 8
if errorlevel 1 (
    echo.
    echo   ERROR: Bridge verification failed. Bridge is not fully operational.
    echo   Check error log: %STDERR_LOG%
    echo   Check output log: %STDOUT_LOG%
    pause
    exit /b 1
)
echo   Bridge is fully operational on ws://127.0.0.1:%BRIDGE_PORT%

:: ---- Step 5: SYSTEM READY ----
echo.
echo   ============================================================================
echo   SYSTEM READY
echo   ============================================================================
echo.
echo   NEXT STEPS:
echo   1. Open Chrome or Edge.
echo   2. Go to chrome://extensions or edge://extensions.
echo   3. Enable Developer mode.
echo   4. Click "Load unpacked" and select:
echo      %ROOT_DIR%\extension
echo   5. Open the extension popup, paste the PAIRING TOKEN below, and click
echo      "Save & Pair Bridge".
echo   6. Open https://arena.ai and use a supported AI Agent.
echo.
echo   PAIRING TOKEN:
echo   ============================================================================
if exist "%USERPROFILE%\.arena-pc-control\auth_token.txt" (
    type "%USERPROFILE%\.arena-pc-control\auth_token.txt"
) else (
    echo   (Token not yet generated — Bridge may still be starting)
)
echo.
echo   Logs:
echo     stdout: %STDOUT_LOG%
echo     stderr: %STDERR_LOG%
echo   ============================================================================
echo.
pause >nul
