@echo off
title HMS - Registrar Protocolo do Sidecar
echo Registrando protocolo hms-sidecar:// no Windows...
reg add "HKCU\Software\Classes\hms-sidecar" /ve /t REG_SZ /d "URL:HMS Sidecar Protocol" /f
reg add "HKCU\Software\Classes\hms-sidecar" /v "URL Protocol" /t REG_SZ /d "" /f
reg add "HKCU\Software\Classes\hms-sidecar\shell\open\command" /ve /t REG_SZ /d "wscript.exe \"%~dp0run_sidecar.vbs\"" /f
echo.
echo Pronto! O protocolo hms-sidecar:// foi configurado com sucesso.
echo O botao "Bat on" podera iniciar o sidecar automaticamente no notebook.
echo.
pause
