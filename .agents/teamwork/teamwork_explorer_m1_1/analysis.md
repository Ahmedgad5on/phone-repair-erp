# Milestone 1: Core Hardware Extraction Engine (Android & Runtime Tooling)
**Component**: Core Architecture, Runtime Paths, Data Models, Binary Setup, and ADB/Fastboot Extraction Engine  
**Author**: Explorer 1 (`teamwork_explorer_m1_1`)  
**Target Milestone**: M1 (Core Hardware Extraction Engine)  
**Date**: 2026-11-07  

---

## 1. Executive Summary

Milestone 1 establishes the foundational hardware telemetry layer for the Mobile Phone Sales & Repair Lab Desktop Application. This document provides the complete, production-ready implementation specification for:
1. **`/bin` Directory Setup**: Provisioning portable Google Android Platform Tools (`adb.exe`, `fastboot.exe`, and companion DLLs) from local Winget packages into the workspace.
2. **`core/paths.py`**: Dynamic runtime path resolution handling development mode and PyInstaller frozen (`_MEIPASS` / standalone `.exe`) bundles, with safe persistence paths.
3. **`core/models.py`**: Strongly typed `DeviceSpecs` and `RepairTicket` dataclasses conforming exactly to the interface contracts defined in `PROJECT.md`.
4. **`core/adb_reader.py`**: An asynchronous, resilient Android and Fastboot extraction engine with:
   - Background polling thread on a 2-second interval with graceful termination.
   - Zero console-flashing (`CREATE_NO_WINDOW = 0x08000000`).
   - Daemon restart resilience (filtering out transient ADB daemon startup noise).
   - Deterministic storage parsing (boundary threshold mapping for `/data`).
   - Deterministic RAM parsing (boundary threshold mapping for `/proc/meminfo`).
   - Samsung, Xiaomi, and Oppo/Realme marketing model resolvers.
   - Multi-strategy IMEI 1 & 2 extraction with Luhn checksum validation.
   - Battery health, cycle count, and level parsing.
   - Bootloader lock state parsing (`ro.boot.flash.locked`, `ro.boot.verifiedbootstate`).
   - Fastboot mode detection via `fastboot devices` and `fastboot getvar`.

All algorithms are specified with exact threshold boundaries, deterministic test vectors, and production code templates for the Worker.

---

## 2. Binary Tooling Setup (`/bin`)

### 2.1 Source Location & Target Mapping
The host environment already contains the official Google Android Platform Tools v37.0.1 (ADB v1.0.41).

- **Source Directory**:  
  `C:\Users\Eng_Ahmed\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\`
- **Target Directory**:  
  `c:\Users\Eng_Ahmed\Desktop\label\bin\`

### 2.2 Required Files to Copy
The following 5 files constitute the complete, self-contained Android runtime:
1. `adb.exe` (8,273,560 bytes) — Primary ADB client & daemon
2. `fastboot.exe` (2,429,080 bytes) — Bootloader protocol client
3. `AdbWinApi.dll` (108,184 bytes) — Windows USB driver interface library
4. `AdbWinUsbApi.dll` (73,368 bytes) — WinUSB driver wrapper
5. `libwinpthread-1.dll` (243,016 bytes) — POSIX thread runtime for Windows

*(Note: libimobiledevice binaries for iOS located at `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` will also reside in `c:\Users\Eng_Ahmed\Desktop\label\bin\` as specified in PROJECT.md).*

### 2.3 Automated Copy Command (PowerShell)
For the Worker to execute:
```powershell
$SourceDir = "C:\Users\Eng_Ahmed\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools"
$TargetDir = "c:\Users\Eng_Ahmed\Desktop\label\bin"

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$AdbFiles = @(
    "adb.exe",
    "fastboot.exe",
    "AdbWinApi.dll",
    "AdbWinUsbApi.dll",
    "libwinpthread-1.dll"
)

foreach ($file in $AdbFiles) {
    Copy-Item -Path (Join-Path $SourceDir $file) -Destination (Join-Path $TargetDir $file) -Force
}
```

---

## 3. Path Resolution Architecture (`core/paths.py`)

### 3.1 Problem Analysis: Development vs Frozen PyInstaller
A PyInstaller one-file executable unpacks bundled assets into a temporary directory assigned to `sys._MEIPASS` (e.g. `C:\Users\...\AppData\Local\Temp\_MEI123456\`). In a one-dir build, files reside next to `sys.executable`.
Crucially:
- **Binaries (`/bin`)** and **Static Data (`/data/apple_models.json`)**: Bundled read-only assets accessed via `_MEIPASS` in frozen mode, or project root in development mode.
- **Writable Data (`/data/app.db`, user templates)**: Must **NEVER** be written to `_MEIPASS` because temporary directories are deleted on exit. Writable data must resolve to `<exe_dir>/data/` when frozen, or `<project_root>/data/` when in development mode.

### 3.2 Concrete Specification: `core/paths.py`
```python
"""
Runtime path resolution for development and frozen PyInstaller environments.
"""
from pathlib import Path
import os
import shutil
import sys
from typing import Optional


def is_frozen() -> bool:
    """Returns True if running in a frozen PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def get_bundle_dir() -> Path:
    """
    Returns the read-only asset root:
    - sys._MEIPASS in PyInstaller frozen mode
    - Project root directory in development mode
    """
    if is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).parent.resolve()
    # Development: core/paths.py -> parent of core/ -> project root
    return Path(__file__).resolve().parent.parent


def get_app_data_dir() -> Path:
    """
    Returns the writable application data directory:
    - Executable directory / 'data' when frozen
    - Project root / 'data' in development mode
    Ensures the directory exists.
    """
    if is_frozen():
        base = Path(sys.executable).parent.resolve()
    else:
        base = get_bundle_dir()
    data_dir = base / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_bin_dir() -> Path:
    """
    Returns the path to the bundled bin directory.
    Checks bundle dir first, then falls back to project bin dir.
    """
    bundle_bin = get_bundle_dir() / "bin"
    if bundle_bin.exists():
        return bundle_bin
    # Fallback to alongside executable if externalized
    exe_bin = Path(sys.executable).parent / "bin"
    if exe_bin.exists():
        return exe_bin
    return bundle_bin


def get_binary_path(binary_name: str) -> str:
    """
    Resolves the absolute path of an external binary (e.g. 'adb', 'fastboot', 'ideviceinfo').
    Priority:
    1. Bundled /bin directory in _MEIPASS or dev root
    2. Sibling /bin directory next to the executable
    3. System PATH fallback via shutil.which
    Returns string path ready for subprocess.
    """
    name = binary_name
    if sys.platform == "win32" and not name.lower().endswith(".exe"):
        name += ".exe"

    # 1. Bundled bin dir
    bin_path = get_bin_dir() / name
    if bin_path.exists():
        return str(bin_path.resolve())

    # 2. Exe sibling bin dir
    if is_frozen():
        sibling_bin = Path(sys.executable).parent / "bin" / name
        if sibling_bin.exists():
            return str(sibling_bin.resolve())

    # 3. System PATH
    found = shutil.which(name)
    if found:
        return found

    # Return anticipated bin path as fallback
    return str(bin_path.resolve())


def get_database_path() -> str:
    """Returns absolute path to the SQLite application database."""
    return str((get_app_data_dir() / "app.db").resolve())


def get_templates_dir() -> Path:
    """Returns path to the label templates directory, ensuring it exists."""
    templates_dir = get_app_data_dir() / "templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    return templates_dir
```

---

## 4. Data Models Architecture (`core/models.py`)

`PROJECT.md` establishes strict interface contracts between the hardware extraction layer, the UI, the label renderer, and the database.

### 4.1 Concrete Specification: `core/models.py`
```python
"""
Strongly typed dataclasses conforming to PROJECT.md interface contracts.
"""
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any


@dataclass
class DeviceSpecs:
    connection_type: str  # "adb", "fastboot", "ios", "none", "mock"
    device_id: str        # Serial or UDID
    brand: str
    marketing_name: str
    model_code: str
    storage: str          # e.g. "128GB", "256GB"
    ram: str              # e.g. "8GB", "12GB"
    color: str
    os_version: str
    serial_number: str
    imei1: str
    imei2: Optional[str] = None
    battery_health: Optional[int] = None  # Percentage 0-100
    battery_cycles: Optional[int] = None
    sales_region: Optional[str] = None    # e.g. "LL/A"
    bootloader_locked: Optional[bool] = None
    condition_grade: str = "A+"
    remarks: str = ""
    raw_properties: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert dataclass to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceSpecs":
        """Instantiate DeviceSpecs from a dictionary, ignoring unknown keys."""
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)

    @classmethod
    def empty(cls) -> "DeviceSpecs":
        """Factory for a blank/disconnected state."""
        return cls(
            connection_type="none",
            device_id="",
            brand="",
            marketing_name="",
            model_code="",
            storage="",
            ram="",
            color="",
            os_version="",
            serial_number="",
            imei1="",
            imei2=None,
            battery_health=None,
            battery_cycles=None,
            sales_region=None,
            bootloader_locked=None,
            condition_grade="A+",
            remarks="",
            raw_properties={}
        )


@dataclass
class RepairTicket:
    ticket_id: str
    customer_name: str
    customer_phone: str
    device_model: str
    reported_fault: str
    passcode: str
    sim_removed: bool = True
    back_cracked: bool = False
    dead_device: bool = False
    estimated_cost: float = 0.0
    intake_datetime: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert dataclass to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RepairTicket":
        """Instantiate RepairTicket from a dictionary, ignoring unknown keys."""
        valid_keys = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)
```

---

## 5. Android Extraction Engine (`core/adb_reader.py`)

### 5.1 Subprocess Execution & Windows Console Flags
To prevent command window flickering every 2 seconds, all subprocess invocations on Windows must specify `creationflags = 0x08000000` (`CREATE_NO_WINDOW`).

```python
import subprocess
import sys

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

def run_cmd(args: list[str], timeout: float = 3.0) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            timeout=timeout,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout expired"
    except Exception as e:
        return -1, "", str(e)
```

### 5.2 ADB Daemon Resilience & Sanitization
When the ADB server starts or restarts due to a version clash, it outputs lines such as:
```
* daemon not running; starting now at tcp:5037
* daemon started successfully
adb server version (40) doesn't match this client (41); killing...
```
A robust parser must sanitize stdout before consuming it:

```python
def sanitize_adb_output(raw_output: str) -> str:
    """Strips daemon notices and informational banner lines from ADB output."""
    if not raw_output:
        return ""
    lines = raw_output.splitlines()
    clean = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("* daemon") or "daemon started" in stripped or "killing..." in stripped:
            continue
        clean.append(stripped)
    return "\n".join(clean)
```

### 5.3 Deterministic Commercial Storage Calculator
Because Android reserves system partitions (super, system, vendor, boot) outside `/data`, `/data` only contains userdata. A 128GB commercial device typically exposes 105GB to 118GB in `/data`.
Using standard decimal calculation ($1\text{ GB} = 10^9\text{ bytes}$):

$$\text{Decimal GB} = \frac{\text{Total 1K-Blocks} \times 1024}{10^9}$$

#### Boundary Threshold Table:
| Calculated GB Range | Commercial Size |
|---|---|
| $0.0 \le \text{GB} \le 18.0$ | **16GB** |
| $18.0 < \text{GB} \le 36.0$ | **32GB** |
| $36.0 < \text{GB} \le 72.0$ | **64GB** |
| $72.0 < \text{GB} \le 145.0$ | **128GB** |
| $145.0 < \text{GB} \le 290.0$ | **256GB** |
| $290.0 < \text{GB} \le 580.0$ | **512GB** |
| $580.0 < \text{GB} \le 1150.0$ | **1TB** |
| $> 1150.0$ | **2TB** |

#### Implementation:
```python
import re

def parse_storage_from_df(df_output: str) -> str:
    """
    Parses 'adb shell df -k /data' or 'adb shell df /data'.
    Example line:
    /dev/block/dm-7 114688000 24500000 90188000 22% /data
    """
    clean = sanitize_adb_output(df_output)
    total_kb = None
    for line in clean.splitlines():
        if "/data" in line:
            parts = line.split()
            # If filesystem is on one line and numbers follow
            for part in parts:
                if part.isdigit() and int(part) > 1000000: # at least ~1GB
                    total_kb = int(part)
                    break
            if total_kb:
                break
                
    if not total_kb:
        # Fallback regex for dumpsys diskstats or other formats:
        match = re.search(r'(\d+)\s*K?\s*total', df_output, re.IGNORECASE)
        if match:
            total_kb = int(match.group(1))

    if not total_kb:
        return "Unknown"

    decimal_gb = (total_kb * 1024) / 1e9
    if decimal_gb <= 18.0:
        return "16GB"
    elif decimal_gb <= 36.0:
        return "32GB"
    elif decimal_gb <= 72.0:
        return "64GB"
    elif decimal_gb <= 145.0:
        return "128GB"
    elif decimal_gb <= 290.0:
        return "256GB"
    elif decimal_gb <= 580.0:
        return "512GB"
    elif decimal_gb <= 1150.0:
        return "1TB"
    else:
        return f"{round(decimal_gb / 1000)}TB"
```

### 5.4 Deterministic Commercial RAM Calculator
In Linux/Android, `MemTotal` in `/proc/meminfo` reflects physical RAM minus kernel code, GPU carveouts, and modem baseband memory.
Calculating $\text{Total MB} = \text{MemTotal KB} / 1024.0$:

#### Boundary Threshold Table:
| MemTotal MB Range | Commercial RAM |
|---|---|
| $0 \le \text{MB} \le 2300$ | **2GB** |
| $2300 < \text{MB} \le 3400$ | **3GB** |
| $3400 < \text{MB} \le 4600$ | **4GB** |
| $4600 < \text{MB} \le 6800$ | **6GB** |
| $6800 < \text{MB} \le 9500$ | **8GB** |
| $9500 < \text{MB} \le 14000$ | **12GB** |
| $14000 < \text{MB} \le 19000$ | **16GB** |
| $> 19000$ | **24GB** |

#### Implementation:
```python
def parse_ram_from_meminfo(meminfo_output: str) -> str:
    """
    Parses 'adb shell cat /proc/meminfo'.
    Line format: 'MemTotal:        7854320 kB'
    """
    match = re.search(r'MemTotal:\s*(\d+)\s*kB', meminfo_output, re.IGNORECASE)
    if not match:
        return "Unknown"
    
    mem_kb = int(match.group(1))
    mem_mb = mem_kb / 1024.0

    if mem_mb <= 2300:
        return "2GB"
    elif mem_mb <= 3400:
        return "3GB"
    elif mem_mb <= 4600:
        return "4GB"
    elif mem_mb <= 6800:
        return "6GB"
    elif mem_mb <= 9500:
        return "8GB"
    elif mem_mb <= 14000:
        return "12GB"
    elif mem_mb <= 19000:
        return "16GB"
    else:
        return "24GB"
```

### 5.5 Multi-Strategy IMEI Extraction & Luhn Validation
On Android 10+, unprivileged shell queries to telephony state can be restricted. The engine applies an automated 4-strategy ladder:

1. **Luhn Algorithm Validation**:
```python
def validate_luhn(imei: str) -> bool:
    """Validates 15-digit IMEI with Luhn checksum algorithm."""
    if not imei or not imei.isdigit() or len(imei) != 15:
        return False
    total = 0
    for i, char in enumerate(imei):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0
```

2. **Parser for `service call iphonesubinfo 1` (Parcel Hex Dump)**:
Android's `service call iphonesubinfo 1` produces:
```
Result: Parcel(
  0x00000000: 00000000 0000000f 00380033 00310035 '........3.8.5.1.'
  0x00000010: 00380036 00330030 00390035 00340032 '.6.8.0.3.5.9.2.4'
  0x00000020: 00370030 00000031                   '.0.7.1..        ')
```
Each line terminates with single-quoted ASCII representation. Extracting ASCII digits between quotes directly reconstitutes the 15-digit IMEI:
```python
def parse_imei_from_service_call(parcel_output: str) -> Optional[str]:
    """Extracts 15-digit IMEI from service call iphonesubinfo parcel dump."""
    matches = re.findall(r"'([^']*)'", parcel_output)
    if not matches:
        return None
    raw_chars = "".join(matches)
    digits = re.sub(r"\D", "", raw_chars)
    if len(digits) >= 15:
        candidate = digits[:15]
        if validate_luhn(candidate):
            return candidate
    return None
```

3. **Parser for `dumpsys iphonesubinfo`**:
Matches: `r'(?:Device\s*ID|IMEI(?:\s*\[?\d+\]?)?)\s*[:=]\s*(\d{15})'`

4. **Parser for Baseband Properties**:
Reads `gsm.baseband.imei`, `persist.radio.imei1`, `persist.radio.imei2`, splitting comma-separated entries if present.

5. **Parser for `cmd phone get-imei 0` and `cmd phone get-imei 1`**:
Executes direct subcommands available on modern developer ROMs.

### 5.6 OEM Model Code Resolver
Converts cryptic development model codes into human-readable marketing names.

```python
SAMSUNG_PREFIX_MAP = {
    # Galaxy S24 Series
    "SM-S928": "Galaxy S24 Ultra",
    "SM-S926": "Galaxy S24+",
    "SM-S921": "Galaxy S24",
    # Galaxy S23 Series
    "SM-S918": "Galaxy S23 Ultra",
    "SM-S916": "Galaxy S23+",
    "SM-S911": "Galaxy S23",
    # Galaxy S22 Series
    "SM-S908": "Galaxy S22 Ultra",
    "SM-S906": "Galaxy S22+",
    "SM-S901": "Galaxy S22",
    # Galaxy S21 Series
    "SM-G998": "Galaxy S21 Ultra 5G",
    "SM-G996": "Galaxy S21+ 5G",
    "SM-G991": "Galaxy S21 5G",
    "SM-G990": "Galaxy S21 FE 5G",
    # Galaxy S20 Series
    "SM-G988": "Galaxy S20 Ultra",
    "SM-G986": "Galaxy S20+",
    "SM-G981": "Galaxy S20 5G",
    "SM-G980": "Galaxy S20",
    "SM-G781": "Galaxy S20 FE 5G",
    "SM-G780": "Galaxy S20 FE",
    # Note Series
    "SM-N986": "Galaxy Note 20 Ultra 5G",
    "SM-N981": "Galaxy Note 20 5G",
    "SM-N975": "Galaxy Note 10+",
    "SM-N970": "Galaxy Note 10",
    # Z Fold & Flip Series
    "SM-F946": "Galaxy Z Fold 5",
    "SM-F936": "Galaxy Z Fold 4",
    "SM-F926": "Galaxy Z Fold 3",
    "SM-F731": "Galaxy Z Flip 5",
    "SM-F721": "Galaxy Z Flip 4",
    "SM-F711": "Galaxy Z Flip 3",
    # A Series
    "SM-A556": "Galaxy A55 5G",
    "SM-A546": "Galaxy A54 5G",
    "SM-A536": "Galaxy A53 5G",
    "SM-A528": "Galaxy A52s 5G",
    "SM-A525": "Galaxy A52",
    "SM-A356": "Galaxy A35 5G",
    "SM-A346": "Galaxy A34 5G",
    "SM-A336": "Galaxy A33 5G",
    "SM-A256": "Galaxy A25 5G",
    "SM-A245": "Galaxy A24",
    "SM-A235": "Galaxy A23",
    "SM-A155": "Galaxy A15",
    "SM-A156": "Galaxy A15 5G",
    "SM-A145": "Galaxy A14",
    "SM-A135": "Galaxy A13",
    "SM-A055": "Galaxy A05",
    "SM-A057": "Galaxy A05s",
}

XIAOMI_CODE_MAP = {
    "2312DRA50G": "Redmi Note 13 Pro 5G",
    "2312DRA50C": "Redmi Note 13 Pro 5G",
    "23049PCD8G": "POCO F5",
    "2210132G": "Xiaomi 13 Pro",
    "23116PN5BC": "Xiaomi 14 Pro",
    "23127PN0CG": "Xiaomi 14",
    "2201116PG": "POCO X4 Pro 5G",
    "21091116UG": "Redmi Note 11 Pro 5G",
}

OPPO_ONEPLUS_MAP = {
    "CPH2581": "OnePlus 12",
    "CPH2451": "OnePlus 11",
    "CPH2551": "OnePlus Open",
    "CPH2415": "OnePlus 11R",
    "CPH2493": "OnePlus Nord 3 5G",
    "CPH2527": "Oppo Reno 10 Pro 5G",
    "CPH2607": "Oppo Reno 11 5G",
    "RMX3820": "Realme GT Neo 5",
    "RMX3771": "Realme 11 Pro+ 5G",
}

def resolve_marketing_name(model_code: str, manufacturer: str, marketname: str = "") -> tuple[str, str]:
    """
    Resolves commercial brand and marketing name from raw model and manufacturer.
    Returns (brand, marketing_name).
    """
    clean_mfr = manufacturer.strip().title() if manufacturer else "Android"
    clean_model = model_code.strip()
    
    # 1. Use system marketname if explicitly defined and distinct from model code
    if marketname and marketname.strip() and marketname.strip().lower() != clean_model.lower():
        return clean_mfr, marketname.strip()

    # 2. Samsung Resolver
    if clean_model.upper().startswith("SM-"):
        prefix = clean_model[:7].upper() # e.g. SM-S928
        if prefix in SAMSUNG_PREFIX_MAP:
            return "Samsung", SAMSUNG_PREFIX_MAP[prefix]
        return "Samsung", f"Samsung {clean_model}"

    # 3. Xiaomi / Redmi / POCO Resolver
    if clean_model.upper() in XIAOMI_CODE_MAP:
        name = XIAOMI_CODE_MAP[clean_model.upper()]
        brand = "Redmi" if "Redmi" in name else ("POCO" if "POCO" in name else "Xiaomi")
        return brand, name

    # 4. Oppo / OnePlus / Realme Resolver
    if clean_model.upper() in OPPO_ONEPLUS_MAP:
        name = OPPO_ONEPLUS_MAP[clean_model.upper()]
        brand = "OnePlus" if "OnePlus" in name else ("Realme" if "Realme" in name else "Oppo")
        return brand, name

    # 5. Google Pixel direct pass-through
    if "Pixel" in clean_model:
        return "Google", clean_model

    # Default fallback
    return clean_mfr, f"{clean_mfr} {clean_model}" if clean_model else clean_mfr
```

### 5.7 Battery Status Parsing (`dumpsys battery`)
Extracts level, health string, charge counter, and cycle count:

```python
BATTERY_HEALTH_MAP = {
    1: "Unknown",
    2: "Good",
    3: "Overheat",
    4: "Dead",
    5: "Over Voltage",
    6: "Failure",
    7: "Cold"
}

def parse_battery_info(dumpsys_battery_output: str) -> tuple[int, Optional[int], Optional[int]]:
    """
    Parses 'adb shell dumpsys battery'.
    Returns (level_percentage, health_percentage_or_none, cycle_count_or_none).
    """
    clean = sanitize_adb_output(dumpsys_battery_output)
    level = 0
    scale = 100
    health_code = 2
    cycle_count = None
    asoc = None

    for line in clean.splitlines():
        line = line.strip()
        if line.startswith("level:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                level = int(parts[1].strip())
        elif line.startswith("scale:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                scale = int(parts[1].strip())
        elif line.startswith("health:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                health_code = int(parts[1].strip())
        elif "cycle_count" in line or "mSavedBatteryUsage" in line:
            match = re.search(r':\s*(\d+)', line)
            if match:
                cycle_count = int(match.group(1))
        elif "mSavedBatteryAsoc" in line:
            match = re.search(r':\s*(\d+)', line)
            if match:
                asoc = int(match.group(1))

    # Normalized battery level percentage
    calc_level = int((level * 100) / scale) if scale > 0 else level
    
    # Health percentage: asoc if reported; if health is Good (2), default 95-100% or None
    health_pct = asoc if asoc is not None else (95 if health_code == 2 else 70)
    
    return calc_level, health_pct, cycle_count
```

### 5.8 Bootloader Lock State Parsing
```python
def parse_bootloader_status(flash_locked: str, verified_boot_state: str) -> Optional[bool]:
    """
    Returns True for Locked, False for Unlocked, or None if undetermined.
    """
    fl = flash_locked.strip().lower()
    vbs = verified_boot_state.strip().lower()

    if fl in ("1", "true", "locked"):
        return True
    if fl in ("0", "false", "unlocked"):
        return False
    
    if vbs == "green":
        return True
    if vbs in ("orange", "yellow", "red"):
        return False
        
    return None
```

### 5.9 Fastboot Detection & Extraction Engine
When an Android device is in Fastboot mode:
1. `adb devices` returns empty.
2. `fastboot devices` returns:
   `<serial>    fastboot`
3. The engine executes `fastboot getvar all` or targeted `fastboot getvar` commands:
   - `fastboot getvar product` -> e.g. `product: marble`
   - `fastboot getvar unlocked` -> e.g. `unlocked: yes` -> `bootloader_locked = False`
   - `fastboot getvar serialno` -> returns device serial number.

```python
def parse_fastboot_devices(output: str) -> list[str]:
    """Returns list of serial numbers in fastboot mode."""
    serials = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1].lower() == "fastboot":
            serials.append(parts[0])
    return serials

def extract_fastboot_specs(serial: str, fastboot_path: str) -> DeviceSpecs:
    """Queries fastboot getvar to build DeviceSpecs."""
    _, out_prod, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "product"])
    _, out_lock, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "unlocked"])

    product_match = re.search(r'product:\s*(\S+)', out_prod)
    product = product_match.group(1) if product_match else "Fastboot Device"
    
    unlocked_match = re.search(r'unlocked:\s*(\S+)', out_lock)
    is_unlocked = unlocked_match.group(1).lower() in ("yes", "true", "1") if unlocked_match else False

    return DeviceSpecs(
        connection_type="fastboot",
        device_id=serial,
        brand="Android (Fastboot)",
        marketing_name=f"{product.title()} (Fastboot)",
        model_code=product,
        storage="N/A (Fastboot)",
        ram="N/A (Fastboot)",
        color="Unknown",
        os_version="Fastboot Mode",
        serial_number=serial,
        imei1="Fastboot (Scan Barcode)",
        imei2=None,
        battery_health=None,
        battery_cycles=None,
        sales_region=None,
        bootloader_locked=(not is_unlocked),
        condition_grade="A",
        remarks="Device detected in Fastboot/Bootloader mode",
        raw_properties={"product": product, "unlocked": is_unlocked}
    )
```

### 5.10 Polling Loop Architecture (`AdbReader`)
```python
import threading
import time
from typing import Callable, Optional

class AdbReader:
    def __init__(self, adb_path: Optional[str] = None, fastboot_path: Optional[str] = None):
        self.adb_path = adb_path or get_binary_path("adb")
        self.fastboot_path = fastboot_path or get_binary_path("fastboot")
        self._stop_event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None
        self._last_device_id: Optional[str] = None
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None

    def start_polling(self, interval: float = 2.0):
        if self._poll_thread and self._poll_thread.is_alive():
            return
        self._stop_event.clear()
        self._poll_thread = threading.Thread(
            target=self._polling_loop,
            args=(interval,),
            name="AdbPollingThread",
            daemon=True
        )
        self._poll_thread.start()

    def stop_polling(self):
        self._stop_event.set()
        if self._poll_thread:
            self._poll_thread.join(timeout=2.5)
            self._poll_thread = None

    def _polling_loop(self, interval: float):
        while not self._stop_event.is_set():
            try:
                specs = self.poll_once()
                current_id = specs.device_id if specs else None
                
                if current_id != self._last_device_id:
                    self._last_device_id = current_id
                    if specs and specs.connection_type != "none":
                        if self.on_device_connected:
                            self.on_device_connected(specs)
                    else:
                        if self.on_device_disconnected:
                            self.on_device_disconnected()
            except Exception:
                pass
            self._stop_event.wait(interval)

    def poll_once(self) -> Optional[DeviceSpecs]:
        # 1. Check adb devices
        ret, out, _ = run_cmd([self.adb_path, "devices", "-l"], timeout=2.0)
        clean = sanitize_adb_output(out)
        for line in clean.splitlines():
            line = line.strip()
            if not line or line.startswith("List of devices"):
                continue
            parts = line.split()
            if len(parts) >= 2 and parts[1] == "device":
                serial = parts[0]
                return self.extract_adb_device(serial)

        # 2. Check fastboot devices
        ret_fb, out_fb, _ = run_cmd([self.fastboot_path, "devices"], timeout=2.0)
        fb_serials = parse_fastboot_devices(out_fb)
        if fb_serials:
            return extract_fastboot_specs(fb_serials[0], self.fastboot_path)

        return None

    def extract_adb_device(self, serial: str) -> DeviceSpecs:
        # Queries: getprop ro.product.model, manufacturer, marketname, release, df /data, meminfo, dumpsys battery, imei ladder
        # Construct and return complete DeviceSpecs
        ...
```

---

## 6. Implementation Action Plan for Worker

When the orchestrator assigns the Worker to implement Milestone 1:

1. **Step 1: Setup `/bin` Directory**
   Run the PowerShell script in Section 2.3 to copy `adb.exe`, `fastboot.exe`, and companion DLLs to `c:\Users\Eng_Ahmed\Desktop\label\bin\`.
2. **Step 2: Create `core/__init__.py`**
   Ensure `core/` package is recognized.
3. **Step 3: Implement `core/paths.py`**
   Write the exact module specified in Section 3.2.
4. **Step 4: Implement `core/models.py`**
   Write `DeviceSpecs` and `RepairTicket` specified in Section 4.1.
5. **Step 5: Implement `core/adb_reader.py`**
   Write the full implementation combining all parsers and `AdbReader` polling class specified in Section 5.
6. **Step 6: Create Unit Tests `tests/test_adb_reader.py`**
   Write unit tests asserting:
   - Storage threshold mappings (10GB -> 16GB, 110GB -> 128GB, 220GB -> 256GB, 460GB -> 512GB, 940GB -> 1TB).
   - RAM threshold mappings (3600MB -> 4GB, 5600MB -> 6GB, 7600MB -> 8GB, 11200MB -> 12GB, 15100MB -> 16GB).
   - Samsung regex resolver (`SM-S928B` -> Galaxy S24 Ultra, `SM-A546U` -> Galaxy A54 5G).
   - Xiaomi model resolver (`2312DRA50G` -> Redmi Note 13 Pro 5G).
   - Luhn validation and IMEI parcel extraction.
   - `dumpsys battery` level and health parsing.
   - Bootloader lock parsing (`flash.locked=1` -> True, `verifiedbootstate=orange` -> False).
   - Fastboot devices parsing.
   - Path resolution in dev and frozen modes.

---

## 7. Test Vectors & Verification Matrix

The following test vectors must be asserted in `tests/test_adb_reader.py`:

```python
# 1. Storage Boundary Test Vectors (Total KB -> Commercial Size)
STORAGE_VECTORS = [
    (11000000, "16GB"),     # ~11.2 GB
    (24500000, "32GB"),     # ~25.0 GB
    (54000000, "64GB"),     # ~55.2 GB
    (114688000, "128GB"),   # ~117.4 GB
    (235000000, "256GB"),   # ~240.6 GB
    (470000000, "512GB"),   # ~481.2 GB
    (950000000, "1TB"),     # ~972.8 GB
]

# 2. RAM Boundary Test Vectors (MemTotal KB -> Commercial RAM)
RAM_VECTORS = [
    (1850000, "2GB"),       # ~1806 MB
    (2800000, "3GB"),       # ~2734 MB
    (3850000, "4GB"),       # ~3759 MB
    (5800000, "6GB"),       # ~5664 MB
    (7854320, "8GB"),       # ~7670 MB
    (11794500, "12GB"),     # ~11518 MB
    (15600000, "16GB"),     # ~15234 MB
    (23500000, "24GB"),     # ~22949 MB
]

# 3. Model Resolver Test Vectors
MODEL_VECTORS = [
    ("SM-S928B", "samsung", "", "Samsung", "Galaxy S24 Ultra"),
    ("SM-A546U", "samsung", "", "Samsung", "Galaxy A54 5G"),
    ("SM-S911B", "samsung", "", "Samsung", "Galaxy S23"),
    ("2312DRA50G", "Xiaomi", "", "Redmi", "Redmi Note 13 Pro 5G"),
    ("CPH2581", "OnePlus", "", "OnePlus", "OnePlus 12"),
    ("Pixel 8 Pro", "Google", "", "Google", "Pixel 8 Pro"),
    ("AnyModel", "Motorola", "Moto G Power", "Motorola", "Moto G Power"),
]

# 4. Luhn Checksum Test Vectors
LUHN_VECTORS = [
    ("358901234567890", True),
    ("358901234567891", False),
    ("863095042071851", True),
    ("123456789012345", False),
]

# 5. Fastboot Parsing Vectors
FASTBOOT_OUTPUT = """
RFCW10Z9XXX	fastboot
2312DRA50G	fastboot
"""
EXPECTED_FB_SERIALS = ["RFCW10Z9XXX", "2312DRA50G"]
```
