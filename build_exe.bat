@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo [BUILD] Thermal Lab Pro — Standalone Single-File Windows Executable Builder
echo ==============================================================================

cd /d "%~dp0"

echo [1/6] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    exit /b 1
)

echo [2/6] Validating required dependencies...
python -m pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Failed to verify requirements!
    exit /b 1
)

echo [3/6] Generating high-resolution brand icons and emblems...
python assets\generate_icon.py
if %errorlevel% neq 0 (
    echo [WARNING] Icon generation returned an issue, checking existing icons...
)

echo [4/6] Cleaning previous build artifacts...
if exist "build" rmdir /s /q "build"
if exist "dist\ThermalLabPro" rmdir /s /q "dist\ThermalLabPro"
if exist "dist\ThermalLabPro.exe" del /f /q "dist\ThermalLabPro.exe"

echo [5/6] Executing PyInstaller compilation (Single-File Standalone)...
pyinstaller --noconfirm app.spec
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller compilation failed!
    exit /b 1
)

echo [6/6] Verifying output executable and synchronizing with Desktop...
set "EXE_SRC="
if exist "dist\ThermalLabPro.exe" (
    set "EXE_SRC=dist\ThermalLabPro.exe"
) else if exist "dist\ThermalLabPro\ThermalLabPro.exe" (
    set "EXE_SRC=dist\ThermalLabPro\ThermalLabPro.exe"
)

if "%EXE_SRC%"=="" (
    echo [ERROR] ThermalLabPro.exe was not found in dist!
    exit /b 1
)

:: Synchronize into dist_installer folder
if not exist "dist_installer" mkdir "dist_installer"
copy /Y "%EXE_SRC%" "dist_installer\ThermalLabPro.exe" >nul
copy /Y "assets\app_icon.ico" "dist_installer\app_icon.ico" >nul

:: Update Desktop standalone executable and shortcut directly!
if exist "%USERPROFILE%\Desktop" (
    copy /Y "%EXE_SRC%" "%USERPROFILE%\Desktop\ThermalLabPro.exe" >nul
)
powershell -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1" >nul 2>&1

echo ==============================================================================
echo [SUCCESS] Single-File Standalone Executable created successfully!
echo Executable location: %~dp0%EXE_SRC%
echo Standalone Installer: %~dp0dist_installer\ThermalLabPro.exe
echo Desktop Executable:  %USERPROFILE%\Desktop\ThermalLabPro.exe
echo ==============================================================================
exit /b 0
