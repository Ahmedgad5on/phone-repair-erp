# Create installer folder if missing
$installerPath = 'C:\Users\Eng_Ahmed\Desktop\label\dist_installer'
if (-Not (Test-Path $installerPath)) {
    New-Item -ItemType Directory -Path $installerPath | Out-Null
}

$sourceExe = $null
if (Test-Path 'C:\Users\Eng_Ahmed\Desktop\label\dist\ThermalLabPro.exe') {
    $sourceExe = 'C:\Users\Eng_Ahmed\Desktop\label\dist\ThermalLabPro.exe'
} elseif (Test-Path 'C:\Users\Eng_Ahmed\Desktop\label\dist\ThermalLabPro\ThermalLabPro.exe') {
    $sourceExe = 'C:\Users\Eng_Ahmed\Desktop\label\dist\ThermalLabPro\ThermalLabPro.exe'
}

if ($sourceExe) {
    Copy-Item -Path $sourceExe -Destination "$installerPath\ThermalLabPro.exe" -Force
}

if (Test-Path 'C:\Users\Eng_Ahmed\Desktop\label\assets\app_icon.ico') {
    Copy-Item -Path 'C:\Users\Eng_Ahmed\Desktop\label\assets\app_icon.ico' -Destination "$installerPath\app_icon.ico" -Force
}

# Create shortcut inside dist_installer
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut("$installerPath\ThermalLabPro.lnk")
$shortcut.TargetPath = "$installerPath\ThermalLabPro.exe"
$shortcut.IconLocation = "$installerPath\app_icon.ico"
$shortcut.WorkingDirectory = $installerPath
$shortcut.Save()

# Also create / update shortcut on Windows Desktop
$desktopPath = [Environment]::GetFolderPath('Desktop')
if (Test-Path $desktopPath) {
    # Copy standalone exe directly to Desktop
    if ($sourceExe) {
        Copy-Item -Path $sourceExe -Destination "$desktopPath\ThermalLabPro.exe" -Force
    }
    
    $desktopShortcut = $ws.CreateShortcut("$desktopPath\ThermalLabPro.lnk")
    $desktopShortcut.TargetPath = "$desktopPath\ThermalLabPro.exe"
    $desktopShortcut.IconLocation = "$installerPath\app_icon.ico"
    $desktopShortcut.WorkingDirectory = $desktopPath
    $desktopShortcut.Save()
}
