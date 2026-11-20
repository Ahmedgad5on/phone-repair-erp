; Inno Setup Script for Thermal Lab Pro
; Creates a complete standalone Windows Setup Installer (.exe) with desktop shortcuts and driver registration.

#define MyAppName "Thermal Lab Pro"
#define MyAppVersion "4.7.4"
#define MyAppPublisher "Thermal Lab Systems"
#define MyAppExeName "ThermalLabPro.exe"
#define MySourceDir "dist\ThermalLabPro"

[Setup]
AppId={{E68F9A12-B4D3-47C1-8F02-99B72F41A123}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=dist_installer
OutputBaseFilename=ThermalLabPro_Setup_v4.7.4
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "installdrivers"; Description: "تثبيت وتفعيل خدمات تعريفات هواتف Android و iOS (ADB & usbmuxd)"; GroupDescription: "إعدادات التشغيل والتعريفات:"

[Files]
Source: "dist_installer\ThermalLabPro.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist_installer\تثبيت_واختصار_سطح_المكتب.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist_installer\تعليمات_التشغيل_والتثبيت.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "install_drivers.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\install_drivers.bat"; Parameters: "/silent"; Flags: runhidden; Tasks: installdrivers
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall
