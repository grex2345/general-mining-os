@echo off
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

chcp 65001 >nul
setlocal enabledelayedexpansion

:: ---- Configuration ----
set "BRIDGE_PORT=18765"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "VENV_DIR=%ROOT_DIR%\.venv"
set "LOG_DIR=%ROOT_DIR%\logs"

:: ---- Create directories ----
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo ============================================================================
echo   ARENA PC CONTROL — LOCAL BRIDGE START
echo ============================================================================
echo.
echo   The existing Arena AI Agent is the brain.
echo   This system provides execution infrastructure (tools, eyes, hands).
echo   No additional AI API keys required.
echo.

:: ---- Check Python ----
echo   [1/4] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Python is not installed or not in PATH.
    echo   Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)
echo   Python found.

:: ---- Bootstrap virtual environment ----
echo.
echo   [2/4] Setting up virtual environment...
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
if not exist "%PYTHON%" (
    echo   Creating virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo   ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
)
echo   Installing dependencies...
"%PYTHON%" -m pip install --quiet websockets>=14.0 pillow>=10.0.0 >nul 2>&1
if errorlevel 1 (
    echo   WARNING: Some dependencies may have failed to install.
)

:: ---- Start the Bridge ----
echo.
echo   [3/4] Starting local Bridge (ws://127.0.0.1:%BRIDGE_PORT%)...
start "Arena PC Bridge" /B "%PYTHON%" "%ROOT_DIR%\bridge\server.py" --config "%ROOT_DIR%\config.default.json" > "%LOG_DIR%\bridge.log" 2>&1

:: Wait for bridge to start
echo   Waiting for bridge to initialize...
timeout /t 5 >nul

:: ---- Verify ----
echo.
echo   [4/4] Verifying Bridge startup...
"%PYTHON%" -c "
import sys, json, urllib.request
sys.path.insert(0, r'%ROOT_DIR%')
try:
    from bridge.server import BridgeServer
    print('   Bridge module: OK')
except Exception as e:
    print('   Bridge module: ERROR -', e)
try:
    with urllib.request.urlopen('http://127.0.0.1:%BRIDGE_PORT%/api/v1/status', timeout=3) as r:
        print('   Bridge HTTP: OK (port %BRIDGE_PORT%)')
except Exception:
    print('   Bridge HTTP: Not yet ready (starting, check bridge.log)')
"

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
type "%USERPROFILE%\.arena-pc-control\auth_token.txt" 2>nul || echo   (Token will be generated on first bridge run)
echo.
echo   Bridge Log: %LOG_DIR%\bridge.log
echo   ============================================================================
echo.
pause >nul
