@echo off
setlocal EnableExtensions

rem Correctly-spelled alias for the 5/22 mobile release build wrapper.
rem Keeps the original 522-buid-all.bat working while making manual runs easier.

cd /d "%~dp0"
call "%~dp0522-buid-all.bat" %*
set "ERR=%ERRORLEVEL%"
endlocal
exit /b %ERR%
