@echo off
REM One-time: play.rootrecord.info A record (grey cloud) -> Shockbyte Minecraft IP.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "Web\scripts\setup-rootmc-play-dns.ps1"
pause
