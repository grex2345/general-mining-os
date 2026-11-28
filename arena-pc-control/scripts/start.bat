@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion

:: ============================================================================
:: Arena PC Control - Local Bridge Launcher (Windows 10/11)
:: ============================================================================
:: THE ARENA AI AGENT IS THE BRAIN. This launcher only starts the local
:: execution infrastructure (Bridge + MCP PC tools). No AI API key is needed.
::
:: Flow:
::   1. Double-click start_windows.bat (or this file) as a NORMAL user.
::   2. Load extension\ in chrome://extensions (Developer mode -> Load unpacked).
::   3. Paste the PAIRING TOKEN printed at the end into the extension popup.
::   4. Open https://arena.ai and click "Start PC Session".
::
:: Every fragile step (token creation, port wait, verification) is delegated to
:: Python so this file contains no inline multi-line code and no redirection
:: inside quoted arguments - the two things that silently break CMD launchers.
:: ============================================================================

title Arena PC Control - Local Secure Bridge

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "ROOT_DIR=%%~fI"

set "BRIDGE_PORT=18765"
set "VENV_DIR=%ROOT_DIR%\.venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
set "LOG_DIR=%ROOT_DIR%\logs"
set "STDOUT_LOG=%LOG_DIR%\bridge.stdout.log"
set "STDERR_LOG=%LOG_DIR%\bridge.stderr.log"
set "CONFIG_FILE=%ROOT_DIR%\config.default.json"
if exist "%ROOT_DIR%\config.local.json" set "CONFIG_FILE=%ROOT_DIR%\config.local.json"

echo   ============================================================================
echo    ARENA PC CONTROL - LOCAL SECURE MCP BRIDGE
echo   ============================================================================
echo.

:: ---- 0) Refuse to run elevated -------------------------------------------
echo   [1/6] Checking privileges...
net session >nul 2>&1
if not errorlevel 1 (
    echo.
    echo   [SECURITY BLOCK] Do NOT run this as Administrator.
    echo   The bridge must run as your normal user account.
    echo   Close this window and double-click start_windows.bat normally.
    echo.
    pause
    exit /b 1
)
echo   Running as a standard user - OK.

:: ---- 1) Locate Python ----------------------------------------------------
echo.
echo   [2/6] Looking for Python 3.10+ ...
set "SYSTEM_PY="
where py >nul 2>&1 && set "SYSTEM_PY=py -3"
if not defined SYSTEM_PY (
    where python >nul 2>&1 && set "SYSTEM_PY=python"
)
if not defined SYSTEM_PY (
    echo.
    echo   ERROR: Python was not found on PATH.
    echo   Install Python 3.10+ from https://www.python.org/downloads/
    echo   and tick "Add python.exe to PATH" during setup.
    echo.
    pause
    exit /b 1
)
%SYSTEM_PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
    echo.
    echo   ERROR: Python 3.10 or newer is required.
    %SYSTEM_PY% --version
    pause
    exit /b 1
)
for /f "delims=" %%v in ('%SYSTEM_PY% -c "import sys;print(sys.version.split()[0])"') do set "PY_VERSION=%%v"
echo   Python %PY_VERSION% found.

:: ---- 2) Virtual environment + dependencies --------------------------------
echo.
echo   [3/6] Preparing the isolated virtual environment ...
if not exist "%PYTHON%" (
    echo   Creating .venv ...
    %SYSTEM_PY% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo   ERROR: Could not create the virtual environment.
        pause
        exit /b 1
    )
)
echo   Installing/updating dependencies from requirements.txt ...
"%PYTHON%" -m pip install --disable-pip-version-check --quiet --upgrade pip >nul 2>&1
"%PYTHON%" -m pip install --disable-pip-version-check --quiet -r "%ROOT_DIR%\requirements.txt"
if errorlevel 1 (
    echo.
    echo   ERROR: Dependency installation failed.
    echo   Check your internet connection, then run:
    echo     "%PYTHON%" -m pip install -r "%ROOT_DIR%\requirements.txt"
    pause
    exit /b 1
)
echo   Dependencies ready.

:: ---- 3) Free the port and prepare the log folder --------------------------
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo.
echo   [4/6] Freeing port %BRIDGE_PORT% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127.0.0.1:%BRIDGE_PORT% .*LISTENING"') do (
    echo   Stopping stale bridge process %%p ...
    taskkill /F /PID %%p >nul 2>&1
)
if exist "%STDOUT_LOG%" del "%STDOUT_LOG%" >nul 2>&1
if exist "%STDERR_LOG%" del "%STDERR_LOG%" >nul 2>&1

:: ---- 4) Pairing token exists before the bridge starts --------------------
:: The bridge reuses %USERPROFILE%\.arena-pc-control\auth_token.txt, so creating
:: it here guarantees the token below matches the running bridge.
echo.
echo   [5/6] Preparing the pairing token ...
"%PYTHON%" "%ROOT_DIR%\scripts\bootstrap.py" token > "%TEMP%\apc_token.txt"
if errorlevel 1 (
    echo   ERROR: Could not create the pairing token.
    pause
    exit /b 1
)
set /p PAIRING_TOKEN=<"%TEMP%\apc_token.txt"
echo   Token ready.

:: ---- 5) Start the bridge with captured logs ------------------------------
:: `start "" /min` opens a separate minimized console; the bridge writes its own
:: logs, so this launcher stays readable and can keep verifying.
echo.
echo   [6/6] Starting the bridge on ws://127.0.0.1:%BRIDGE_PORT% ...
if exist "%STDOUT_LOG%" del "%STDOUT_LOG%" >nul 2>&1
if exist "%STDERR_LOG%" del "%STDERR_LOG%" >nul 2>&1
"%PYTHON%" "%ROOT_DIR%\scripts\bootstrap.py" launch --config "%CONFIG_FILE%" --port %BRIDGE_PORT% >nul
if errorlevel 1 (
    echo   ERROR: Could not start the bridge process.
    if exist "%STDERR_LOG%" type "%STDERR_LOG%"
    pause
    exit /b 1
)

echo   Waiting for the bridge to accept connections ...
"%PYTHON%" "%ROOT_DIR%\scripts\bootstrap.py" wait %BRIDGE_PORT% --timeout 30
if errorlevel 1 (
    echo.
    echo   ERROR: The bridge did not open port %BRIDGE_PORT% within 30 seconds.
    echo   --- stderr ---------------------------------------------------------
    if exist "%STDERR_LOG%" type "%STDERR_LOG%"
    echo   --- stdout ---------------------------------------------------------
    if exist "%STDOUT_LOG%" type "%STDOUT_LOG%"
    echo   -------------------------------------------------------------------
    pause
    exit /b 1
)

:: ---- 6) Full verification: TCP + WebSocket + auth + MCP tools ------------
echo.
echo   Verifying Bridge (TCP, WebSocket, auth, MCP tools) ...
"%PYTHON%" "%ROOT_DIR%\scripts\verify_bridge.py" --host 127.0.0.1 --port %BRIDGE_PORT% --timeout 12
if errorlevel 1 (
    echo.
    echo   ERROR: Verification failed - the bridge is not fully operational.
    echo   --- stderr ---------------------------------------------------------
    if exist "%STDERR_LOG%" type "%STDERR_LOG%"
    pause
    exit /b 1
)

echo.
echo   ============================================================================
echo    SYSTEM READY
echo   ============================================================================
echo.
echo    NEXT STEPS
echo    1. Open Chrome or Edge.
echo    2. Go to chrome://extensions (or edge://extensions).
echo    3. Enable "Developer mode".
echo    4. Click "Load unpacked" and select:
echo         %ROOT_DIR%\extension
echo    5. Open the extension popup, paste the PAIRING TOKEN below and click
echo       "Save and Pair Bridge".
echo    6. Open https://arena.ai and click "Start PC Session" in the dock.
echo.
echo    PAIRING TOKEN
echo    --------------------------------------------------------------------------
echo    %PAIRING_TOKEN%
echo    --------------------------------------------------------------------------
echo    (stored in %USERPROFILE%\.arena-pc-control\auth_token.txt)
echo.
echo    Logs:  %STDOUT_LOG%
echo           %STDERR_LOG%
echo    Audit: %USERPROFILE%\.arena-pc-control\audit.jsonl
echo.
echo    The bridge is running in a minimized window. Close that window
echo    (or run scripts\stop.bat) to stop it.
echo   ============================================================================
echo.
pause
endlocal
exit /b 0
