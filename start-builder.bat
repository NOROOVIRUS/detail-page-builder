@echo off
chcp 65001 >nul
title Detail Page Builder - runner
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. https://nodejs.org & pause & exit /b 1)
node scripts\server.mjs --open
pause
