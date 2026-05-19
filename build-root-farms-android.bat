@echo off
rem Build Root Farms release APK + AAB into Mobile\builds\root-farms\
call "%~dp0Mobile\root-farms-app\bump-and-build-release.bat"
exit /b %ERRORLEVEL%
