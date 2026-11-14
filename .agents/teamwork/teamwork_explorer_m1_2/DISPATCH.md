## 2026-11-07T14:28:11Z
You are Explorer 2 for Milestone 1 (M1: Core Hardware Extraction Engine).

Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_2
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Project Specification Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md completely.

YOUR FOCUS FOR MILESTONE 1 (iOS Extraction & Apple Model Dictionary):
1. Review findings from Phase 0 (`.agents/teamwork/teamwork_explorer_survey_2/analysis.md`).
2. Design the exact JSON structure for `data/apple_models.json` containing comprehensive Apple ProductType mappings up to iPhone 16 series (e.g. iPhone17,1 -> iPhone 16 Pro, iPhone17,2 -> iPhone 16 Pro Max, iPhone17,3 -> iPhone 16, iPhone17,4 -> iPhone 16 Plus, iPhone16,1 -> iPhone 15 Pro, iPhone 15, iPhone 14, iPhone 13, iPhone 12, iPhone 11, iPhone XS/XR, iPhone X, iPhone 8, 7, 6s, SE 1st/2nd/3rd gen).
3. Design copying of libimobiledevice binaries:
   - Source: `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\`
   - Destination: `c:\Users\Eng_Ahmed\Desktop\label\bin\`
   - Required files: `idevice_id.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`, `imobiledevice.dll`, `usbmuxd.dll`, `plist.dll`, `libcrypto-1_1-x64.dll`, `libssl-1_1-x64.dll`, `libxml2.dll`, `pthreadVC3.dll`, and all companion DLLs in that win-x64 directory.
4. Design `core/ios_reader.py`:
   - 2-second background polling loop querying `idevice_id -l`.
   - `CREATE_NO_WINDOW` flag for all executions.
   - Parsing `ideviceinfo` XML format (`-x`) using Python's `plistlib` for structured type safety.
   - Key extraction:
     * `DeviceName`, `ProductType`, `ProductVersion`, `BuildVersion`
     * `SerialNumber`, `UniqueDeviceID` (UDID)
     * `InternationalMobileEquipmentIdentity` (IMEI) and `InternationalMobileEquipmentIdentity2`
     * `TotalDiskCapacity` (converting decimal bytes to standard commercial sizes: 64GB, 128GB, 256GB, 512GB, 1TB)
     * `DeviceColor` / `DeviceEnclosureColor` (mapping hex or code to English names e.g. Space Gray, Silver, Gold, Natural Titanium, Desert Titanium, Midnight, Starlight)
     * `ModelNumber` and `RegionInfo` (e.g. PartNumber parse or RegionInfo e.g. LL/A, J/A, CH/A, AE/A)
   - Battery diagnostics: `idevicediagnostics ioregentry AppleSmartBattery` / `GasGauge` XML parsing for `CycleCount`, `DesignCapacity`, `NominalChargeCapacity` / `MaximumCapacityPercent`, calculating exact Battery Health %.
   - Handling of lockdown errors (e.g. `PasswordProtected`, `PairingDialogResponsePending`).

OUTPUT:
- Write your detailed implementation recommendation to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_2\analysis.md`.
- Write your structured completion report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_2\handoff.md`.
- Send a completion message to the parent orchestrator with reference to your handoff path.
REMEMBER: You are read-only. Do not write or modify source code files directly. Recommend fix and implementation strategies for the Worker.
