@echo off
setlocal
set "APP=%~dp0dist\index.html"
if not exist "%APP%" (
  echo dist\index.html was not found.
  echo Run build-standalone.bat first.
  pause
  exit /b 1
)
start "" "%APP%"
