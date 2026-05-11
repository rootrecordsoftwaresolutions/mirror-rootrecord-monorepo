@echo off
setlocal EnableExtensions

rem Convenience wrapper: runs Workers then Pages deploys in sequence.
rem Implementation lives in cloudflare-update-workers.bat and cloudflare-update-pages.bat.

cd /d "%~dp0"

set "LOGFILE=%~dp0cloudflare-update-all.log"
echo Starting %DATE% %TIME% > "%LOGFILE%"
echo Log: %LOGFILE%

echo.
echo ================================
echo RootRecord Cloudflare - Update All
echo ================================
echo Repo: %CD%
echo.

set "STEP=cloudflare-update-workers.bat"
echo %STEP%
call "%~dp0cloudflare-update-workers.bat" %*
if errorlevel 1 goto FAIL

set "STEP=cloudflare-update-pages.bat"
echo %STEP%
call "%~dp0cloudflare-update-pages.bat" %*
if errorlevel 1 goto FAIL

echo.
echo Done.
echo Finished %DATE% %TIME% >> "%LOGFILE%"
pause
endlocal
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
echo.
echo ============================================================
echo ERROR: cloudflare-update-all.bat failed.
echo Step:       %STEP%
echo Exit code:  %ERR%
echo See the sub-script log for details.
echo ============================================================
echo FAILED at %STEP% exit %ERR% >> "%LOGFILE%"
pause
endlocal
exit /b %ERR%
