@echo off
rem Arena PC Control - live self-test of the PC tools
rem All logic lives in launcher.py. This file only locates Python.
setlocal
cd /d "%~dp0"
set "APC_PY="
if exist "%~dp0.venv\Scripts\python.exe" set "APC_PY=%~dp0.venv\Scripts\python.exe"
if defined APC_PY goto run
where py >nul 2>nul
if not errorlevel 1 set "APC_PY=py -3"
if defined APC_PY goto run
where python >nul 2>nul
if not errorlevel 1 set "APC_PY=python"
if defined APC_PY goto run
echo.
echo   Python 3.10+ was not found on PATH.
echo   Install it from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" during setup.
echo.
pause
exit /b 1
:run
%APC_PY% "%~dp0launcher.py" selftest %*
set "APC_RC=%ERRORLEVEL%"
if not "%APC_RC%"=="0" echo.
if not "%APC_RC%"=="0" echo   Failed with exit code %APC_RC%.
echo.
pause
exit /b %APC_RC%
