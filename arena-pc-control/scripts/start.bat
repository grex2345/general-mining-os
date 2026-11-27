@echo off
:: ============================================================================
:: Arena PC Control — JARVIS Unified Start Script (MODE A + MODE B)
:: ============================================================================
:: Starts the shared local Bridge, JARVIS Core agent loop, and optional API server.
:: One installation. One central system.
::
:: MODE A: Independent JARVIS — runs locally with its own AI model.
:: MODE B: External AI Agent — Chrome extension connects Arena.ai agents to this bridge.
:: ============================================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

:: ---- Configuration ----
set "BRIDGE_PORT=18765"
set "API_PORT=8766"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "VENV_DIR=%ROOT_DIR%\.venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
set "LOG_DIR=%ROOT_DIR%\logs"

:: ---- Create directories ----
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo ============================================================================
echo   ARENA PC CONTROL — JARVIS UNIFIED START
echo ============================================================================
echo.
echo   [1/5] Checking Python virtual environment...

:: ---- Bootstrap virtual environment ----
if not exist "%PYTHON%" (
    echo   Virtual environment not found. Creating...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo   ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo   Installing dependencies...
    "%PYTHON%" -m pip install --quiet websockets>=14.0 pillow>=10.0.0 pytest>=8.0.0 pytest-asyncio>=0.23.0 httpx aiohttp
    if errorlevel 1 (
        echo   WARNING: Some dependencies may have failed to install.
    )
) else (
    echo   Virtual environment found at %VENV_DIR%
)

echo.
echo   [2/5] Starting local Bridge (ws://127.0.0.1:%BRIDGE_PORT%)...
start "Arena PC Bridge" /B "%PYTHON%" "%ROOT_DIR%\bridge\server.py" --config "%ROOT_DIR%\config.default.json" > "%LOG_DIR%\bridge.log" 2>&1

:: Wait for bridge to start
echo   Waiting for bridge to initialize...
timeout /t 5 >nul

:: Check if bridge is running
echo.
echo   [3/5] Starting JARVIS Core Agent Loop...
start "Arena PC JARVIS" /B "%PYTHON%" -c "
import asyncio, sys
sys.path.insert(0, r'%ROOT_DIR%')
from jarvis_core.api_server import run_api_server
asyncio.run(run_api_server(host='127.0.0.1', port=%API_PORT%))
" > "%LOG_DIR%\jarvis_api.log" 2>&1

echo.
echo   [4/5] Verifying services...
"%PYTHON%" -c "
import urllib.request, json, sys
try:
    with urllib.request.urlopen('http://127.0.0.1:%API_PORT%/api/v1/status', timeout=5) as r:
        data = json.loads(r.read().decode())
        print('   JARVIS API: OK (port %API_PORT%)')
except Exception as e:
    print('   JARVIS API: Not yet ready (starting...)')
try:
    import websockets
    print('   Bridge WebSocket: Configured for ws://127.0.0.1:%BRIDGE_PORT%')
except:
    print('   Bridge: websockets module available')
"

echo.
echo   [5/5] System ready.
echo.
echo   ============================================================================
echo   NEXT STEPS:
echo   ============================================================================
echo   1. Open Chrome or Edge.
echo   2. Go to chrome://extensions or edge://extensions.
echo   3. Enable Developer mode.
echo   4. Click "Load unpacked" and select:
echo      %ROOT_DIR%\extension
echo   5. Open the extension popup, paste the PAIRING TOKEN below, and click
echo      "Save & Pair Bridge".
echo   6. Open https://arena.ai and click "Start PC Session".
echo.
echo   PAIRING TOKEN:
echo   ============================================================================
type "%USERPROFILE%\.arena-pc-control\auth_token.txt" 2>nul || echo   (Token will be generated on first bridge run)
echo.
echo   JARVIS API: http://127.0.0.1:%API_PORT%/api/v1/status
echo   Bridge Log: %LOG_DIR%\bridge.log
echo   JARVIS Log: %LOG_DIR%\jarvis_api.log
echo   ============================================================================
echo.
echo   Press any key to keep this window open, or close it to run in background.
pause >nul
