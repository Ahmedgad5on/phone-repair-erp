@echo off
setlocal enabledelayedexpansion

echo ==============================================================================
echo [DRIVERS] Thermal Lab Pro — Mobile Phone USB Drivers Setup
echo ==============================================================================
echo.

cd /d "%~dp0"

echo [1/3] Restarting and configuring Android ADB USB Service...
if exist "bin\adb.exe" (
    bin\adb.exe kill-server >nul 2>&1
    bin\adb.exe start-server
    echo [OK] Android ADB Service is active and listening on port 5037.
) else (
    echo [WARNING] bin\adb.exe not found.
)
echo.

echo [2/3] Checking Apple iOS Device Service (usbmuxd)...
sc query "Apple Mobile Device Service" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Apple Mobile Device Service is installed and running.
) else (
    echo [INFO] Registering portable usbmuxd daemon for Apple iOS devices...
    if exist "bin\usbmuxd.exe" (
        start /b bin\usbmuxd.exe >nul 2>&1
        echo [OK] Portable usbmuxd service started in background.
    )
)
echo.

echo [3/3] Scanning connected USB devices...
if exist "bin\adb.exe" (
    echo Connected Android Devices:
    bin\adb.exe devices -l
)
if exist "bin\idevice_id.exe" (
    echo.
    echo Connected Apple iOS Devices:
    bin\idevice_id.exe -l
)
echo.

echo ==============================================================================
echo [SUCCESS] Drivers and communication services are configured successfully!
echo You can now plug in any Android or iOS device to Thermal Lab Pro.
echo ==============================================================================
if not "%1"=="/silent" (
    pause
)
exit /b 0
