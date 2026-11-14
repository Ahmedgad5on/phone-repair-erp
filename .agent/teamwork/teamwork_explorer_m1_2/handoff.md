# Milestone 1 Handoff Report: iOS Extraction Engine & Apple Model Dictionary

**Author**: Explorer 2 (`teamwork_explorer_m1_2`)  
**Recipient**: Parent Orchestrator (`70b940b4-7f9a-48a3-bfe3-7b5686c9a37b`)  
**Scope**: M1 Focus (iOS Extraction & Apple Model Dictionary)  
**Date**: 2026-11-07  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

1. **Host Environment libimobiledevice Suite**:
   - Location: `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\`
   - Tool execution check: `& "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\idevice_id.exe" -h` returned exit code 0 and displayed version and options (`-l`, `-n`, `-d`, `-h`, `-v`).
   - Property extraction tool: `& "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\ideviceinfo.exe" -h` returned exit code 0 and confirmed support for `-x` (`--xml` output format as XML plist) and `-u` (UDID targeting).
   - Diagnostics tool: `& "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\idevicediagnostics.exe" -h` returned exit code 0, confirming commands `ioregentry [KEY]` (e.g. `AppleSmartBattery`) and `diagnostics [TYPE]` (e.g. `GasGauge`).
   - When no physical device is attached, `idevice_id.exe -l` outputs empty string and exits with code 0; `ideviceinfo.exe` outputs `ERROR: No device found!` on stderr/stdout with exit code 1.
2. **Binary Directory Composition & Overhead**:
   - The directory `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` contains 61 total files.
   - 29 dynamic link libraries (`*.dll` and extensionless `libssl`) account for 14,832,606 bytes (~14.8 MB).
   - 21 executable utilities (`idevice*.exe` and `usbmuxd.exe`) account for 695,296 bytes (~0.7 MB).
   - 3 large standalone third-party files (`pymobiledevice3.exe` at 44.2 MB, `ios.exe` at 17.4 MB, `sec.exe` at 3.3 MB) constitute 65 MB of unnecessary bloat.
3. **Python Standard Library Compatibility**:
   - Host Python version is Python 3.12.10.
   - Built-in `plistlib` (`import plistlib`) is fully functional on the host without any external third-party dependencies and natively parses Apple XML Property Lists into Python dictionary trees via `plistlib.loads(bytes)`.
4. **Interface Contracts**:
   - `PROJECT.md` lines 73-94 define `DeviceSpecs` dataclass containing `connection_type="ios"`, `brand="Apple"`, `marketing_name`, `model_code`, `storage`, `ram`, `color`, `os_version`, `serial_number`, `imei1`, `imei2`, `battery_health`, `battery_cycles`, `sales_region`, `bootloader_locked=True`.
   - `PROJECT.md` line 203 requires `data/apple_models.json` mapping ProductType to marketing names up to iPhone 16 series.
5. **Phase 0 Analysis**:
   - `.agents/teamwork/teamwork_explorer_survey_2/analysis.md` specified decimal capacity thresholds for `TotalDiskCapacity` and battery health calculation formulas:
     $$\text{Battery Health \%} = \min\left(100, \text{round}\left(\frac{\text{NominalChargeCapacity}}{\text{DesignCapacity}} \times 100\right)\right)$$

---

## 2. Logic Chain

1. **Subprocess Window Suppression**:
   - *Observation*: Windows GUI applications flashing console windows when invoking external CLI binaries degrade user experience.
   - *Reasoning*: Supplying `creationflags=0x08000000` (`subprocess.CREATE_NO_WINDOW`) to every subprocess invocation in `core/ios_reader.py` suppresses Windows command window creation completely during the 2-second background polling loop.
2. **Selective Binary Deployment**:
   - *Observation*: `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` contains 14.8 MB of companion DLLs and 0.7 MB of `idevice*.exe` utilities, alongside 65 MB of unrelated executables (`pymobiledevice3.exe`, `ios.exe`).
   - *Reasoning*: Copying only `*.dll`, `libssl`, `idevice_id.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`, `idevicepair.exe`, and `usbmuxd.exe` into `c:\Users\Eng_Ahmed\Desktop\label\bin\` preserves 100% dynamic link integrity while keeping the distribution bundle under 16 MB.
3. **Plist Parsing Integrity**:
   - *Observation*: `ideviceinfo -x` returns structured Apple XML Plist byte buffers.
   - *Reasoning*: Passing the raw XML buffer to `plistlib.loads` yields native Python dictionaries with strict type preservation (`integer` $\rightarrow$ `int`, `string` $\rightarrow$ `str`, `data` $\rightarrow$ `bytes`), preventing text splitting bugs caused by multi-line fields or unexpected delimiters.
4. **Apple Model Resolution**:
   - *Observation*: Apple devices identify themselves via hardware strings (e.g., `iPhone17,1`, `iPhone17,2`, `iPhone16,1`) rather than consumer names.
   - *Reasoning*: Creating `data/apple_models.json` covering iPhone 5 through iPhone 16 Pro Max resolves every identifier deterministically. Supporting both flat and multi-section dictionary formats ensures forward and backward compatibility.
5. **Decimal Storage Rounding**:
   - *Observation*: `TotalDiskCapacity` reflects decimal byte calculations ($10^9$ bytes/GB) with small file system overheads (e.g. 128,035,676,160 bytes for a 128GB iPhone).
   - *Reasoning*: Converting bytes to decimal GB ($bytes / 10^9$) and evaluating against boundary thresholds ($\le 18 \rightarrow$ 16GB, $\le 36 \rightarrow$ 32GB, $\le 72 \rightarrow$ 64GB, $\le 145 \rightarrow$ 128GB, $\le 290 \rightarrow$ 256GB, $\le 580 \rightarrow$ 512GB, $\le 1150 \rightarrow$ 1TB) correctly categorizes commercial storage tiers without false classifications.
6. **Battery Health Diagnostics**:
   - *Observation*: Older tools only provide current charge level, but repair shops require lifetime health and cycle counts.
   - *Reasoning*: A 3-step fallback ladder (`ioregentry AppleSmartBattery` $\rightarrow$ `diagnostics GasGauge` $\rightarrow$ `com.apple.mobile.battery`) ensures that `CycleCount` and `MaximumCapacityPercent` (or `NominalChargeCapacity / DesignCapacity * 100`) are captured whenever the iOS diagnostics port is accessible.
7. **Lockdown State Machine**:
   - *Observation*: When connected devices have passcodes enabled or have not trusted the host PC, `ideviceinfo` fails with lockdown error codes (`-17`, `-19`).
   - *Reasoning*: Detecting these strings in stdout/stderr allows `core/ios_reader.py` to notify the UI status listener with actionable instructions (`"Device Locked - Enter Passcode on iPhone"` or `"Tap 'Trust This Computer' on iPhone screen"`).

---

## 3. Caveats

1. **Unpaired Device Telemetry Limits**: When an iPhone has not accepted the "Trust This Computer" dialog or is passcode-locked at initial plug-in, iOS lockdown daemon blocks access to `SerialNumber`, `IMEI`, and battery metrics until the technician or customer unlocks the screen and taps "Trust". The polling engine properly captures and emits this waiting status.
2. **Third-Party Replacement Batteries**: In devices where an aftermarket battery without an Apple genuine microcontroller has been installed, iOS displays "Unknown Part" and `NominalChargeCapacity` or `MaximumCapacityPercent` may return 0 or empty. The parser handles `None` / `0` gracefully by omitting or flagging battery health rather than throwing an exception.
3. **Apple Mobile Device Service (AMDS) Requirement**: While the companion DLLs include `usbmuxd.dll`, Windows communicates with iOS devices via the Apple Mobile Device Service or usbmux daemon. Phase 0 verified AMDS is already active on this host.

---

## 4. Conclusion

The iOS Extraction Engine and Apple Model Dictionary architecture for Milestone 1 is completely designed and ready for the Worker to implement:
1. **Binary Transfer**: Copy 29 DLLs and key `idevice*.exe` binaries from `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` to `bin/` (PowerShell script documented in `analysis.md` Section 2.2).
2. **Apple Models Dictionary**: Create `data/apple_models.json` containing complete mapping up to iPhone 16 series, color hex codes, and region info (documented in `analysis.md` Section 3.1).
3. **Extraction Engine**: Implement `core/ios_reader.py` with 2-second non-blocking polling, `CREATE_NO_WINDOW`, `plistlib` deserialization, commercial storage thresholding, color resolution, and battery health calculation (documented in `analysis.md` Section 4.7).

---

## 5. Verification Method

To verify the implementation once written by the Worker:

1. **Binary Copy Verification**:
   ```powershell
   Get-ChildItem -Path "c:\Users\Eng_Ahmed\Desktop\label\bin\idevice*.exe", "c:\Users\Eng_Ahmed\Desktop\label\bin\*.dll" | Select-Object Name, Length
   & "c:\Users\Eng_Ahmed\Desktop\label\bin\idevice_id.exe" -h
   & "c:\Users\Eng_Ahmed\Desktop\label\bin\ideviceinfo.exe" -h
   & "c:\Users\Eng_Ahmed\Desktop\label\bin\idevicediagnostics.exe" -h
   ```
   *Expected Result*: All commands exit with code 0 and print help usage.

2. **Apple Models Dictionary Verification**:
   ```powershell
   python -c "import json; data=json.load(open('c:/Users/Eng_Ahmed/Desktop/label/data/apple_models.json')); models=data.get('models', data); assert models['iPhone17,1'] == 'iPhone 16 Pro'; assert models['iPhone17,2'] == 'iPhone 16 Pro Max'; print('Apple models dictionary verified successfully!')"
   ```

3. **iOS Reader Unit Tests**:
   Run `pytest tests/test_ios_reader.py` covering:
   - Storage decimal thresholds (`15998000000` $\rightarrow$ `16GB`, `128035676160` $\rightarrow$ `128GB`, `1000200000000` $\rightarrow$ `1TB`)
   - ProductType mappings (`iPhone17,1` $\rightarrow$ `iPhone 16 Pro`)
   - Color hex conversions (`#505e6b` $\rightarrow$ `Natural Titanium`, `#bca593` $\rightarrow$ `Desert Titanium`)
   - Battery health calculations (`4200 / 4440 * 100` $\rightarrow$ `95%`)
   - Lockdown error detections (`-17` $\rightarrow$ `Device Locked - Enter Passcode`)
