@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Arena PC Control — Local Secure Bridge

REM Security Check: Do NOT run with Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [SECURITY BLOCK] Do NOT run start_windows.bat as Administrator!
    echo Please launch it normally by double-clicking as a standard Windows user.
    pause
    exit /b 1
)

where python >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Python 3.10+ was not found on PATH.
    echo Install Python from https://www.python.org/downloads/ ^(check "Add Python to PATH"^).
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/2] Creating isolated virtual environment ^(.venv^)...
    python -m venv .venv
    if %errorLevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

echo [2/2] Checking Python dependencies...
".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt

echo.
".venv\Scripts\python.exe" bridge\server.py
pause
