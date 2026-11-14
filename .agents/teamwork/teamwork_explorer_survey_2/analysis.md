# Hardware Data Extraction Engine & Simulation Architecture Analysis
**Project**: Mobile Phone Sales & Repair Lab Desktop Application  
**Component**: Hardware Data Extraction Engine (Android & iOS) and Simulation/Mock Architecture (Requirement R2)  
**Author**: Explorer 2 (`teamwork_explorer`)  
**Date**: 2026-11-07  

---

## 1. Executive Summary

This report delivers the technical survey, architectural blueprint, command set specifications, parser algorithms, and mock engine design for the **Hardware Data Extraction Engine (Requirement R2)**.

The engine must extract rich device telemetry automatically from connected mobile devices without user intervention, populating 14+ technical fields on thermal labels and intake tickets. The investigation confirmed:
1. **Host Environment Tooling**: Both Google Android Platform Tools (`adb.exe`, `fastboot.exe`, `AdbWinApi.dll`) and a complete 64-bit `libimobiledevice` Windows build (`ideviceinfo.exe`, `idevice_id.exe`, `idevicediagnostics.exe`, and companion DLLs) already exist locally on the host machine.
2. **Background Polling Mechanism**: A dedicated background polling thread running on a 2-second interval with `subprocess.CREATE_NO_WINDOW` flags and timeout safeguards prevents UI freezing and eliminates cmd-window flickering.
3. **Smart Commercial Parsers**: Exact deterministic boundary algorithms have been specified to convert raw Linux `/proc/meminfo` and `/data` partition sizes into standard commercial RAM (e.g., 4GB, 6GB, 8GB, 12GB, 16GB) and Storage (e.g., 64GB, 128GB, 256GB, 512GB, 1TB).
4. **Brand Marketing Resolvers**: Complete translation matrices convert cryptic model numbers (Samsung `SM-S928B`, Xiaomi `2312DRA50G`, Apple `iPhone17,1`) into human-readable commercial names (`Galaxy S24 Ultra`, `Redmi Note 13 Pro 5G`, `iPhone 16 Pro`).
5. **Simulation & Mock Architecture**: An interface-identical mock engine provides pre-configured profiles (iPhone 16 Pro Max, Galaxy S24 Ultra, Fastboot mode) and dynamic Luhn-valid IMEI generation for 100% zero-hardware testing and end-to-end workflow validation.

---

## 2. Existing Tooling & Binary Environment Audit

An audit of the Windows environment was conducted to identify existing binaries and drivers.

### 2.1 Discovered Local Binaries

| Tool Suite | Discovered Path | Version / Files | Status & Compatibility |
|---|---|---|---|
| **Android Platform Tools** | `C:\Users\Eng_Ahmed\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\` | `adb.exe` (v1.0.41 / v37.0.1)<br>`fastboot.exe` (v37.0.1)<br>`AdbWinApi.dll`<br>`AdbWinUsbApi.dll`<br>`libwinpthread-1.dll` | **Operational**. Verified via CLI execution. Matches modern Android 14/15 protocol requirements. |
| **libimobiledevice (x64)** | `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` | `ideviceinfo.exe`<br>`idevice_id.exe`<br>`idevicediagnostics.exe`<br>`imobiledevice.dll`<br>`plist.dll`<br>`usbmuxd.dll`<br>`libxml2.dll`<br>`libcrypto-1_1-x64.dll`<br>`libssl-1_1-x64.dll`<br>`pthreadVC3.dll` | **Operational**. Verified via CLI execution. Runs natively on Windows 10/11 x64 without missing dependency errors. |
| **Apple Mobile Device Service** | Windows Service (`Apple Mobile Device Service`) | Running (`AMDS`) | **Active**. Native iOS usbmux communication channel is already active on the host OS. |

### 2.2 Critical Subprocess & Sibling DLL Findings
- **Companion DLL Requirement**: Testing confirmed that `idevice_id.exe` and `ideviceinfo.exe` cannot run as standalone isolated `.exe` files; they require their companion DLLs (`imobiledevice.dll`, `plist.dll`, `usbmuxd.dll`, `libxml2.dll`, etc.) in the exact same directory.
- **ADB Version Clashes**: If an older ADB daemon (version 40) is running in the background from another software, invoking ADB version 41 causes an automatic daemon restart (`adb server version (40) doesn't match this client (41); killing...`). The parser must handle transient daemon restart messages gracefully.
- **Console Window Prevention**: Calling CLI binaries from Windows GUI apps without `creationflags=subprocess.CREATE_NO_WINDOW` (value `0x08000000`) causes rapid black console window flashing every 2 seconds.

---

## 3. Android Hardware Extraction Engine Architecture (ADB & Fastboot)

### 3.1 Polling Architecture & State Machine
The Android worker operates as an independent background daemon thread (or `QThread` in PyQt6):
- **Interval**: 2.0 seconds.
- **Command**: `adb devices -l` followed by `fastboot devices`.
- **States**:
  - `IDLE`: No devices attached.
  - `DETECTED`: New device detected in list.
  - `UNAUTHORIZED`: Device connected but user has not accepted "Allow USB debugging" prompt on screen.
  - `OFFLINE`: Device in recovery/booting state.
  - `EXTRACTING`: Reading properties, partition tables, battery, and IMEI.
  - `READY`: All device attributes extracted and cached; signal emitted to UI.
  - `FASTBOOT`: Device detected in bootloader/fastboot mode.

### 3.2 Android Command Execution Matrix

| Target Field | Command / Strategy | Raw Output Example | Parsing Logic |
|---|---|---|---|
| **Manufacturer** | `adb shell getprop ro.product.manufacturer` | `samsung` | Trim, capitalize: `Samsung`. |
| **Brand** | `adb shell getprop ro.product.brand` | `Redmi` | Trim, capitalize: `Redmi`. |
| **Model Code** | `adb shell getprop ro.product.model` | `SM-S928B` | Used as primary key for marketing name resolver. |
| **Market Name** | `adb shell getprop ro.product.marketname`<br>Fallback: `ro.product.odm.marketname` | `Redmi Note 12 Pro 5G` | Used if populated; otherwise falls back to local resolver. |
| **Android OS** | `adb shell getprop ro.build.version.release` | `14` | Formats as `Android 14`. |
| **Serial Number** | `adb get-serialno`<br>Fallback: `getprop ro.serialno` | `RFCW10Z9XXX` | Strips whitespace. |
| **Bootloader State** | `adb shell getprop ro.boot.flash.locked`<br>Fallback: `ro.boot.verifiedbootstate` | `1` / `0`<br>`green` / `orange` | `1` or `green` = `Locked`<br>`0` or `orange` = `Unlocked`. |
| **Storage Capacity** | `adb shell df -k /data` | `/dev/block/dm-7 114688000 ... /data` | Parse total 1K blocks (col 2), map through boundary thresholds. |
| **RAM Capacity** | `adb shell cat /proc/meminfo` | `MemTotal: 7854320 kB` | Parse `MemTotal` integer, map through memory boundary thresholds. |
| **Battery Health & %** | `adb shell dumpsys battery` | `level: 85`<br>`health: 2`<br>`charge counter: 3450000` | Parse level, map health integer (2 = Good), calculate cycle if available. |
| **IMEI 1 & 2** | Multi-strategy ladder (see Section 3.5) | Hex parcel or dumpsys string | Extract 15 digits, validate with Luhn algorithm. |
| **Fastboot Telemetry** | `fastboot getvar product`<br>`fastboot getvar unlocked`<br>`fastboot getvar serialno` | `product: marble`<br>`unlocked: yes`<br>`serialno: 2312...` | Extracts fastboot state when phone is in bootloader. |

### 3.3 Commercial Storage Parsing Algorithm (Android)
Because the Android operating system reserves system partitions (super, system, vendor, boot, recovery) outside of the `/data` mount, `/data` reflects only the userdata partition. A 128GB device typically shows ~105GB to 118GB in `/data`.

The parser calculates total gigabytes:
$$\text{Raw GB} = \frac{\text{Total 1K-Blocks} \times 1024}{10^9}$$

The value is mapped to standard commercial tiers using strict boundary thresholds:

```python
def parse_android_commercial_storage(total_kb: int) -> str:
    raw_gb = (total_kb * 1024) / 1e9
    if raw_gb <= 18.0:
        return "16GB"
    elif raw_gb <= 36.0:
        return "32GB"
    elif raw_gb <= 72.0:
        return "64GB"
    elif raw_gb <= 145.0:
        return "128GB"
    elif raw_gb <= 290.0:
        return "256GB"
    elif raw_gb <= 580.0:
        return "512GB"
    elif raw_gb <= 1150.0:
        return "1TB"
    else:
        return f"{round(raw_gb)}GB"
```

### 3.4 Commercial RAM Parsing Algorithm (Android)
In Linux/Android, `MemTotal` in `/proc/meminfo` excludes kernel allocations, GPU shared memory, and modem baseband carveouts. An 8GB RAM device presents approximately 7,400 to 7,850 MB in `MemTotal`.

```python
def parse_android_commercial_ram(mem_total_kb: int) -> str:
    mem_total_mb = mem_total_kb / 1024.0
    if mem_total_mb <= 2300:
        return "2GB"
    elif mem_total_mb <= 3400:
        return "3GB"
    elif mem_total_mb <= 4600:
        return "4GB"
    elif mem_total_mb <= 6800:
        return "6GB"
    elif mem_total_mb <= 9500:
        return "8GB"
    elif mem_total_mb <= 14000:
        return "12GB"
    elif mem_total_mb <= 19000:
        return "16GB"
    else:
        return "24GB"
```

### 3.5 Multi-Strategy IMEI 1 & IMEI 2 Extraction
On unrooted Android (especially Android 10+), `READ_PRIVILEGED_PHONE_STATE` is restricted. The engine applies an automated multi-strategy fallback ladder:

1. **Strategy 1: `service call iphonesubinfo 1` (and slot 2)**
   - Parses the returned UTF-16 hex parcel:
     ```
     Result: Parcel(
       0x00000000: 00000000 0000000f 00380033 00310035 '........3.8.5.1.'
       0x00000010: 00380036 00330030 00390035 00340032 '.6.8.0.3.5.9.2.4'
       0x00000020: 00370030 00000031                   '.0.7.1..        ')
     ```
   - Extracts ASCII column digits, validating exact 15-digit length and Luhn checksum.
2. **Strategy 2: `dumpsys iphonesubinfo`**
   - Matches regex `r'(?:Device ID|IMEI)\s*=\s*(\d{15})'`.
3. **Strategy 3: Baseband Properties**
   - Checks `gsm.baseband.imei`, `persist.radio.imei1`, `persist.radio.imei2`, `ro.ril.oem.imei1`, `ro.ril.oem.imei2`.
4. **Strategy 4: Android Telecom Command**
   - Checks `cmd phone get-imei 0` and `cmd phone get-imei 1` on modern developer ROMs.
5. **Fallback**: If all strategies return restricted on secured Android 12-15 builds, the field is left open for instant 1D barcode scanner input or manual technician entry with indicator: `Restricted (Scan Barcode)`.

### 3.6 Samsung, Xiaomi, and Oppo Smart Model Resolver
Mobile phones often report internal development codes in `ro.product.model`. The smart resolver decodes these into human-readable marketing names:

#### Samsung Galaxy Resolver Rules
Samsung model numbers follow `SM-[A-Z]\d{3}[A-Z0-9]*`. The base 4-character prefix deterministically identifies the model:
- `SM-S928*` $\rightarrow$ **Galaxy S24 Ultra**
- `SM-S926*` $\rightarrow$ **Galaxy S24+**
- `SM-S921*` $\rightarrow$ **Galaxy S24**
- `SM-S918*` $\rightarrow$ **Galaxy S23 Ultra**
- `SM-S916*` $\rightarrow$ **Galaxy S23+**
- `SM-S911*` $\rightarrow$ **Galaxy S23**
- `SM-S908*` $\rightarrow$ **Galaxy S22 Ultra**
- `SM-S906*` $\rightarrow$ **Galaxy S22+**
- `SM-S901*` $\rightarrow$ **Galaxy S22**
- `SM-G998*` $\rightarrow$ **Galaxy S21 Ultra 5G**
- `SM-G996*` $\rightarrow$ **Galaxy S21+ 5G**
- `SM-G991*` $\rightarrow$ **Galaxy S21 5G**
- `SM-N986*` $\rightarrow$ **Galaxy Note 20 Ultra 5G**
- `SM-N981*` $\rightarrow$ **Galaxy Note 20 5G**
- `SM-F946*` $\rightarrow$ **Galaxy Z Fold 5**
- `SM-F936*` $\rightarrow$ **Galaxy Z Fold 4**
- `SM-F731*` $\rightarrow$ **Galaxy Z Flip 5**
- `SM-F721*` $\rightarrow$ **Galaxy Z Flip 4**
- `SM-A556*` $\rightarrow$ **Galaxy A55 5G**
- `SM-A546*` $\rightarrow$ **Galaxy A54 5G**
- `SM-A536*` $\rightarrow$ **Galaxy A53 5G**
- `SM-A356*` $\rightarrow$ **Galaxy A35 5G**
- `SM-A346*` $\rightarrow$ **Galaxy A34 5G**
- `SM-A256*` $\rightarrow$ **Galaxy A25 5G**
- `SM-A155*` $\rightarrow$ **Galaxy A15**
- `SM-A156*` $\rightarrow$ **Galaxy A15 5G**

#### Xiaomi / Redmi / POCO Resolver
- Reads `ro.product.marketname` first.
- If empty, translates codes:
  - `2312DRA50G` $\rightarrow$ **Redmi Note 13 Pro 5G**
  - `23049PCD8G` $\rightarrow$ **POCO F5**
  - `2210132G` $\rightarrow$ **Xiaomi 13 Pro**
  - `23116PN5BC` $\rightarrow$ **Xiaomi 14 Pro**

#### Oppo / OnePlus / Realme Resolver
- `CPH2581` $\rightarrow$ **OnePlus 12**
- `CPH2451` $\rightarrow$ **OnePlus 11**
- `CPH2551` $\rightarrow$ **OnePlus Open**
- `RMX3820` $\rightarrow$ **Realme GT Neo 5**

---

## 4. iOS Hardware Extraction Engine Architecture (libimobiledevice)

### 4.1 Polling Architecture (`idevice_id -l`)
- **Interval**: 2.0 seconds.
- **Execution**: `idevice_id -l`
- **Output**: Returns connected device UDID(s).
  - 40-character hex UDID (iPhone X and earlier): `a1b2c3d4...`
  - 25-character hyphenated UDID (iPhone XS through iPhone 16 series): `00008140-001234567890ABCD`
- **Lockdown State Handling**:
  - If output of `ideviceinfo` reports `PasswordProtected`, device is locked with passcode. UI prompts: `Device Locked - Enter Passcode`.
  - If output reports `PairingDialogResponsePending`, UI prompts: `Tap "Trust This Computer" on iPhone Screen`.

### 4.2 Property Extraction via `ideviceinfo`
When UDID is detected, execute:
`ideviceinfo -u <UDID> -x` (or standard key-value output)
Using `plistlib.loads(xml_bytes)` from the Python standard library allows direct deserialization of device telemetry into a clean native dictionary without string-splitting errors.

#### Extracted Keys Mapping
| Target Label Field | `ideviceinfo` Key | Example Value | Format / Resolution |
|---|---|---|---|
| **Marketing Name** | `ProductType` | `iPhone17,1` | Mapped via `APPLE_PRODUCT_TYPE_MAP` $\rightarrow$ `iPhone 16 Pro`. |
| **Storage Capacity** | `TotalDiskCapacity` | `128035676160` | Decimal GB rounding $\rightarrow$ `128GB`. |
| **Color** | `DeviceColor` / `DeviceEnclosureColor` | `#505e6b` or `Natural Titanium` | Mapped via color lookup $\rightarrow$ `Natural Titanium`. |
| **iOS Version** | `ProductVersion` | `18.1` | Formatted as `iOS 18.1`. |
| **Serial Number** | `SerialNumber` | `F2LWX0XXXXXX` | Upper-case alphanumeric string. |
| **IMEI 1** | `InternationalMobileEquipmentIdentity` | `358901234567890` | Primary cellular IMEI. |
| **IMEI 2** | `InternationalMobileEquipmentIdentity2` | `358901234567891` | Secondary cellular IMEI (eSIM or physical SIM 2). |
| **Sales Region** | `RegionInfo` | `LL/A` | Decoded: `LL/A (USA eSIM)`. |
| **Model Number** | `ModelNumber` | `MLKN3` | Combined: `MLKN3LL/A`. |

### 4.3 Apple ProductType Mapping Dictionary (Up to iPhone 16 Series)
The dictionary is stored in `/data/apple_models.json` and mirrored in `ios_reader.py`:

```json
{
  "iPhone17,1": "iPhone 16 Pro",
  "iPhone17,2": "iPhone 16 Pro Max",
  "iPhone17,3": "iPhone 16",
  "iPhone17,4": "iPhone 16 Plus",
  "iPhone16,1": "iPhone 15 Pro",
  "iPhone16,2": "iPhone 15 Pro Max",
  "iPhone15,4": "iPhone 15",
  "iPhone15,5": "iPhone 15 Plus",
  "iPhone15,2": "iPhone 14 Pro",
  "iPhone15,3": "iPhone 14 Pro Max",
  "iPhone14,7": "iPhone 14",
  "iPhone14,8": "iPhone 14 Plus",
  "iPhone14,2": "iPhone 13 Pro",
  "iPhone14,3": "iPhone 13 Pro Max",
  "iPhone14,4": "iPhone 13 mini",
  "iPhone14,5": "iPhone 13",
  "iPhone14,6": "iPhone SE (3rd Gen)",
  "iPhone13,1": "iPhone 12 mini",
  "iPhone13,2": "iPhone 12",
  "iPhone13,3": "iPhone 12 Pro",
  "iPhone13,4": "iPhone 12 Pro Max",
  "iPhone12,8": "iPhone SE (2nd Gen)",
  "iPhone12,1": "iPhone 11",
  "iPhone12,3": "iPhone 11 Pro",
  "iPhone12,5": "iPhone 11 Pro Max",
  "iPhone11,2": "iPhone XS",
  "iPhone11,4": "iPhone XS Max",
  "iPhone11,6": "iPhone XS Max",
  "iPhone11,8": "iPhone XR",
  "iPhone10,1": "iPhone 8",
  "iPhone10,4": "iPhone 8",
  "iPhone10,2": "iPhone 8 Plus",
  "iPhone10,5": "iPhone 8 Plus",
  "iPhone10,3": "iPhone X",
  "iPhone10,6": "iPhone X",
  "iPhone9,1": "iPhone 7",
  "iPhone9,3": "iPhone 7",
  "iPhone9,2": "iPhone 7 Plus",
  "iPhone9,4": "iPhone 7 Plus",
  "iPhone8,4": "iPhone SE (1st Gen)",
  "iPhone8,1": "iPhone 6s",
  "iPhone8,2": "iPhone 6s Plus",
  "iPhone7,2": "iPhone 6",
  "iPhone7,1": "iPhone 6 Plus"
}
```

### 4.4 iOS TotalDiskCapacity Decimal Rounding
Apple devices calculate storage using decimal capacity ($1\text{ GB} = 10^9\text{ bytes}$).
```python
def parse_ios_commercial_storage(total_bytes: int) -> str:
    gb = total_bytes / 1e9
    if gb <= 18:
        return "16GB"
    elif gb <= 36:
        return "32GB"
    elif gb <= 72:
        return "64GB"
    elif gb <= 145:
        return "128GB"
    elif gb <= 290:
        return "256GB"
    elif gb <= 580:
        return "512GB"
    elif gb <= 1150:
        return "1TB"
    else:
        return f"{round(gb)}GB"
```

### 4.5 Battery Health & Cycle Count Diagnostics
To extract battery health %, execute:
`idevicediagnostics ioregentry AppleSmartBattery`
Or:
`idevicediagnostics diagnostics GasGauge`

The output contains:
- `CycleCount`: Integer count of full charge/discharge cycles.
- `MaximumCapacityPercent`: Direct battery health percentage (iOS 11+).
- In the absence of `MaximumCapacityPercent`, the engine uses the canonical formula:
$$\text{Battery Health \%} = \min\left(100, \text{round}\left(\frac{\text{NominalChargeCapacity}}{\text{DesignCapacity}} \times 100\right)\right)$$

If the diagnostics interface is unavailable (e.g. unactivated device), fallback to:
`ideviceinfo -q com.apple.mobile.battery`
to obtain current charge level (`BatteryCurrentCapacity`).

---

## 5. Simulation / Mock Device Architecture

To fulfill Requirement R2 and ensure that all UI auto-fill, WYSIWYG preview rendering, and thermal printing operations can be thoroughly validated without physical phones, a complete Simulation and Mock Device Engine is designed.

### 5.1 Architecture & Signal Parity
The `MockDeviceManager` emits the exact same data payloads and signals as the physical background hardware workers. The UI and auto-print listeners cannot distinguish between mock data and real hardware data:

```
[ MockDeviceManager ] ──┐
                         ├──> [ HardwareEventSignal ] ──> [ UI Controller & Auto-Print ]
[ Live ADB Worker   ] ──┤
[ Live iOS Worker   ] ──┘
```

### 5.2 Pre-Configured Realistic Mock Profiles

| Profile Name | Mode | Model & Specs | Color | Battery & Cycles | Region & Baseband |
|---|---|---|---|---|---|
| **iPhone 16 Pro Max** | `iOS Normal` | iPhone 16 Pro Max, 512GB, iOS 18.1 | Natural Titanium | 100% Health, 12 Cycles | `LL/A` (USA eSIM), IMEI Dual |
| **iPhone 13 Pro** | `iOS Normal` | iPhone 13 Pro, 256GB, iOS 17.5.1 | Graphite | 87% Health, 438 Cycles | `ZP/A` (HK Dual SIM), IMEI Dual |
| **iPhone 11** | `iOS Normal` | iPhone 11, 128GB, iOS 16.6 | Black | 78% Health, 892 Cycles | `B/A` (UK), IMEI Single |
| **Galaxy S24 Ultra** | `ADB` | Galaxy S24 Ultra (SM-S928B), 512GB, 12GB RAM, Android 14 | Titanium Gray | Good (96%), 65 Cycles | Global, Bootloader Locked |
| **Redmi Note 13 Pro 5G** | `ADB` | Redmi Note 13 Pro 5G, 256GB, 8GB RAM, Android 13 | Midnight Black | Good (94%), 140 Cycles | Global, Bootloader Unlocked |
| **Pixel 7 Fastboot** | `Fastboot` | Google Pixel 7 (panther), 128GB, 8GB RAM, Bootloader Mode | Obsidian | N/A (Fastboot Mode) | Unlocked |

### 5.3 Dynamic Random Profile Generator & Luhn Algorithm
The mock manager includes a random generator producing realistic, diverse device telemetry for load testing and demonstration. IMEIs are generated using the standard Luhn algorithm check digit:

```python
import random

def generate_luhn_imei(tac: str = "358901") -> str:
    body = tac + "".join([str(random.randint(0, 9)) for _ in range(14 - len(tac))])
    total = 0
    for i, char in enumerate(body):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    check_digit = (10 - (total % 10)) % 10
    return body + str(check_digit)
```

---

## 6. Binary Tooling, Directory Layout & PyInstaller Bundling Specification

### 6.1 Proposed `/bin` Folder Contents
The project requires a `/bin` directory containing portable, standalone Windows binaries:

```
c:\Users\Eng_Ahmed\Desktop\label\bin\
├── adb.exe                      (From Winget Platform Tools)
├── AdbWinApi.dll
├── AdbWinUsbApi.dll
├── fastboot.exe
├── libwinpthread-1.dll
├── idevice_id.exe               (From iServicePro-Legacy win-x64)
├── ideviceinfo.exe
├── idevicediagnostics.exe
├── usbmuxd.exe
├── imobiledevice.dll
├── plist.dll
├── usbmuxd.dll
├── libxml2.dll
├── libcrypto-1_1-x64.dll
├── libssl-1_1-x64.dll
├── pthreadVC3.dll
└── companion support DLLs
```

### 6.2 Binary Path Resolution Helper (`core/bin_resolver.py`)
To ensure reliable binary execution across both development (Python script) and production (PyInstaller `.exe`), the path resolver follows this hierarchy:

```python
import os
import sys
import shutil

def get_binary_path(binary_name: str) -> str:
    """
    Resolves the absolute path to a bundled binary.
    Prioritizes PyInstaller _MEIPASS, then local ./bin folder, then system PATH.
    """
    if not binary_name.endswith(".exe"):
        binary_name += ".exe"
        
    # 1. PyInstaller frozen environment
    if getattr(sys, "frozen", False):
        base_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        bundle_path = os.path.join(base_dir, "bin", binary_name)
        if os.path.exists(bundle_path):
            return bundle_path
            
    # 2. Local development ./bin folder
    app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local_bin_path = os.path.join(app_root, "bin", binary_name)
    if os.path.exists(local_bin_path):
        return local_bin_path
        
    # 3. System PATH fallback
    system_path = shutil.which(binary_name)
    if system_path:
        return system_path
        
    return local_bin_path
```

### 6.3 PyInstaller Standalone Packaging Specification
In `build_exe.bat` and `main.spec`:
- `--noconsole`: Suppresses background console window.
- `--add-data "bin;bin"`: Embeds the entire `/bin` directory.
- `--add-data "data;data"`: Embeds `/data/apple_models.json`.
- Windows creation flags:
  All subprocess executions in `core/adb_reader.py` and `core/ios_reader.py` specify:
  ```python
  import subprocess

  CREATE_NO_WINDOW = 0x08000000
  result = subprocess.run(
      cmd,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      creationflags=CREATE_NO_WINDOW,
      timeout=3.0,
      encoding="utf-8",
      errors="replace"
  )
  ```

---

## 7. Verification & Automated Test Strategy

To ensure zero regression and reliable parsing before hardware connection, unit tests must cover:
1. **Commercial Storage Boundary Tests**: Validate test vectors: 10GB $\rightarrow$ 16GB, 24GB $\rightarrow$ 32GB, 52GB $\rightarrow$ 64GB, 110GB $\rightarrow$ 128GB, 225GB $\rightarrow$ 256GB, 460GB $\rightarrow$ 512GB, 930GB $\rightarrow$ 1TB.
2. **Commercial RAM Boundary Tests**: Validate test vectors: 3600MB $\rightarrow$ 4GB, 5600MB $\rightarrow$ 6GB, 7600MB $\rightarrow$ 8GB, 11200MB $\rightarrow$ 12GB, 15100MB $\rightarrow$ 16GB.
3. **Apple ProductType Mapping Tests**: Validate all strings from `iPhone7,1` up to `iPhone17,4` against expected marketing names.
4. **Samsung Model Resolver Tests**: Validate regex model decoding (`SM-S928B` $\rightarrow$ `Galaxy S24 Ultra`, `SM-A546U` $\rightarrow$ `Galaxy A54 5G`).
5. **IMEI Parser Tests**: Validate sample hex dump from `service call iphonesubinfo 1` and verify Luhn check digit validation function.
6. **Battery Health Calculator Tests**: Validate `(NominalChargeCapacity / DesignCapacity) * 100` rounding and clamping.
7. **Mock Device Engine Test**: Verify that activating simulation mode produces fully populated device payloads without physical devices.
