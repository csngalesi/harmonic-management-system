@echo off
title HMS - YouTube Sidecar
echo.
echo ===================================================
echo   HMS YouTube Sidecar - Ativo e Pronto!
echo   Mantenha esta janela aberta enquanto usar o HMS.
echo ===================================================
echo.
cd /d "%~dp0"
node yt_sidecar.js
pause
