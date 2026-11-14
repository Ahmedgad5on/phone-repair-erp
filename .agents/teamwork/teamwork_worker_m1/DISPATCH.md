## 2026-11-07T14:44:49Z
You are the Worker for Milestone 1 (M1: Core Hardware Extraction Engine).

Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m1
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Project Specification Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md completely.

EXPLORER BLUEPRINTS TO READ AND IMPLEMENT:
- Explorer 1 Report & Analysis: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_1\analysis.md` and `handoff.md`
- Explorer 2 Report & Analysis: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_2\analysis.md` and `handoff.md`
- Explorer 3 Report & Analysis: `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_3\analysis.md` and `handoff.md`

FILES OWNED BY YOU (EXCLUSIVE WRITE OWNERSHIP):
- `bin/*`
- `core/__init__.py`
- `core/paths.py`
- `core/models.py`
- `core/adb_reader.py`
- `core/ios_reader.py`
- `core/mock_device.py`
- `data/apple_models.json`
- `tests/__init__.py`
- `tests/test_adb_reader.py`
- `tests/test_ios_reader.py`
- `tests/test_mock_device.py`
Do NOT modify files in `tests/e2e/`.

YOUR TASKS:
1. Provision the `bin/` directory by copying required local tools:
   - Copy `adb.exe`, `fastboot.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`, `libwinpthread-1.dll` from:
     `C:\Users\Eng_Ahmed\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\`
     into `c:\Users\Eng_Ahmed\Desktop\label\bin\`.
   - Copy `idevice_id.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`, `idevicepair.exe`, `usbmuxd.exe`, and all companion `*.dll` files (including `imobiledevice.dll`, `plist.dll`, `usbmuxd.dll`, `libcrypto*.dll`, `libssl*.dll`, `libxml2.dll`, `pthreadVC3.dll`, etc.) from:
     `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\`
     into `c:\Users\Eng_Ahmed\Desktop\label\bin\`. (Exclude large unrelated bloat like `pymobiledevice3.exe`, `ios.exe`).
2. Implement `core/paths.py` with dynamic resolution supporting frozen PyInstaller bundles (`sys._MEIPASS`) and standard script mode.
3. Implement `core/models.py` with typed `DeviceSpecs` and `RepairTicket` dataclasses and dictionary serialization methods.
4. Create `data/apple_models.json` mapping Apple ProductType identifiers up to iPhone 16 series (`iPhone17,1` through `iPhone17,4`, iPhone 15 series, down to earlier models), along with color and region mappings.
5. Implement `core/adb_reader.py` with:
   - Polling thread (2-second interval, graceful stop).
   - `subprocess` with `CREATE_NO_WINDOW` (0x08000000).
   - Sanitization of daemon startup messages.
   - Deterministic storage boundary parser for `df /data`.
   - Deterministic RAM boundary parser for `/proc/meminfo`.
   - Samsung regex prefix resolver (`SM-S928*` -> `Galaxy S24 Ultra`), Xiaomi/Oppo model resolver.
   - Multi-strategy IMEI extraction with Luhn check.
   - Battery level, health, and cycle count parser.
   - Bootloader status and Fastboot mode parser.
6. Implement `core/ios_reader.py` with:
   - Polling thread (2-second interval, graceful stop).
   - `subprocess` with `CREATE_NO_WINDOW`.
   - `idevice_id -l` and `ideviceinfo -x` XML parsing using standard library `plistlib`.
   - Decimal commercial storage parser.
   - Battery diagnostics ladder (`AppleSmartBattery`, `GasGauge`, `com.apple.mobile.battery`) calculating exact Battery Health % and cycles.
   - Handling of lockdown errors (password protected, trust prompt pending).
7. Implement `core/mock_device.py` with:
   - Luhn validation and calculation utilities.
   - Pre-configured profiles (`mock_s24_ultra`, `mock_iphone16_promax`, `mock_iphone15_pro`, `mock_fastboot_device`).
   - Dynamic mock generator producing valid Luhn IMEIs.
   - `MockDeviceProvider` polling engine mirroring `AdbReader` and `IosReader`.
8. Implement unit tests:
   - `tests/test_adb_reader.py`
   - `tests/test_ios_reader.py`
   - `tests/test_mock_device.py`
9. Run all unit tests using `python -m unittest discover tests -v` (or pytest). Ensure 100% of tests pass.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

OUTPUT:
- Write your completion handoff report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m1\handoff.md`.
- Send a completion message to the parent orchestrator with reference to your handoff path.
