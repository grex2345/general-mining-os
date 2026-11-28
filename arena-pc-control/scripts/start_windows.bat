@echo off
rem Compatibility shim: the real launcher is launcher.py in the project root.
call "%~dp0..\start_windows.bat" %*
exit /b %ERRORLEVEL%
