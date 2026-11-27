@echo off
<<<<<<< HEAD
=======
chcp 65001 >nul
setlocal enabledelayedexpansion

>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
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

<<<<<<< HEAD
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ---- Configuration ----
set "BRIDGE_PORT=18765"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "VENV_DIR=%ROOT_DIR%\.venv"
set "LOG_DIR=%ROOT_DIR%\logs"
=======
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
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)

:: ---- Create directories ----
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

<<<<<<< HEAD
echo ============================================================================
echo   ARENA PC CONTROL — LOCAL BRIDGE START
echo ============================================================================
=======
:: ============================================================================
echo   ARENA PC CONTROL — LOCAL BRIDGE START
echo   ============================================================================
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
echo.
echo   The existing Arena AI Agent is the brain.
echo   This system provides execution infrastructure (tools, eyes, hands).
echo   No additional AI API keys required.
echo.

<<<<<<< HEAD
:: ---- Check Python ----
echo   [1/4] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
=======
:: ---- Step 1: Check Python ----
echo   [1/5] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
    echo.
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
    echo   ERROR: Python is not installed or not in PATH.
    echo   Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)
echo   Python found.

<<<<<<< HEAD
:: ---- Bootstrap virtual environment ----
echo.
echo   [2/4] Setting up virtual environment...
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
=======
:: ---- Step 2: Bootstrap virtual environment ----
echo.
echo   [2/5] Setting up virtual environment...
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
if not exist "%PYTHON%" (
    echo   Creating virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
<<<<<<< HEAD
=======
        echo.
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
        echo   ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
)
<<<<<<< HEAD
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

=======
echo   Installing dependencies (websockets, pillow)...
"%PYTHON%" -m pip install --quiet websockets>=14.0 pillow>=10.0.0
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

:: ---- Step 4: Verify Bridge is listening ----
echo.
echo   [4/5] Verifying Bridge is listening on port %BRIDGE_PORT%...
"%PYTHON%" "%VERIFY_SCRIPT%" --port %BRIDGE_PORT% --timeout 8
if errorlevel 1 (
    echo.
    echo   ERROR: Bridge verification failed. Bridge is not accepting connections.
    echo   Check error log: %STDERR_LOG%
    echo   Check output log: %STDOUT_LOG%
    pause
    exit /b 1
)
echo   Bridge is listening on ws://127.0.0.1:%BRIDGE_PORT%

:: ---- Step 5: SYSTEM READY ----
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
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
<<<<<<< HEAD
type "%USERPROFILE%\.arena-pc-control\auth_token.txt" 2>nul || echo   (Token will be generated on first bridge run)
echo.
echo   Bridge Log: %LOG_DIR%\bridge.log
=======
if exist "%USERPROFILE%\.arena-pc-control\auth_token.txt" (
    type "%USERPROFILE%\.arena-pc-control\auth_token.txt"
) else (
    echo   (Token not yet generated — Bridge may still be starting)
)
echo.
echo   Logs:
echo     stdout: %STDOUT_LOG%
echo     stderr: %STDERR_LOG%
>>>>>>> fb82861 (fix(arena-pc-control): repair Windows startup script and Bridge verification)
echo   ============================================================================
echo.
pause >nul
