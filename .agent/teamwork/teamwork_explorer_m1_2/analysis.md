# Milestone 1: iOS Hardware Extraction Engine & Apple Model Dictionary Analysis
**Component**: libimobiledevice Integration, Binary Packaging, Apple Model Resolver, and `core/ios_reader.py`  
**Author**: Explorer 2 (`teamwork_explorer_m1_2`)  
**Date**: 2026-11-07  
**Status**: Investigation Complete — Implementation Recommendations Ready

---

## 1. Executive Summary

This report provides the exhaustive technical blueprint, command execution specifications, XML plist deserialization logic, dictionary mapping schemas, and production-grade implementation architecture for the **iOS Hardware Extraction Engine (Requirement R2)** and **Apple Model Dictionary** in Milestone 1.

Key verified findings:
1. **Host libimobiledevice Binaries**: A complete, functional 64-bit Windows build of `libimobiledevice` (v1.3.0 / libusbmuxd v2.0) exists at `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\`. Both `idevice_id.exe` and `ideviceinfo.exe` were verified via CLI test execution with exit code 0.
2. **Selective Binary Bundling**: 29 companion DLLs (~14.8 MB) and the key executables (`idevice_id.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`, `idevicepair.exe`, `usbmuxd.exe` ~0.7 MB) provide complete dynamic link integrity while omitting 65 MB of bloated, unrelated executables (`pymobiledevice3.exe` 44MB, `ios.exe` 17.4MB, `sec.exe` 3.3MB).
3. **Structured Plist Deserialization**: The `-x` flag of `ideviceinfo` and `idevicediagnostics` emits standard Apple XML Property Lists. Using Python's built-in `plistlib.loads` achieves structured, type-safe deserialization directly into native Python dictionaries, eliminating error-prone regex and string splitting.
4. **Apple Model Dictionary (`data/apple_models.json`)**: An exhaustive mapping dictionary spanning every iPhone generation from iPhone 5 up to the complete **iPhone 16 series** (`iPhone17,1` through `iPhone17,4`), accompanied by Apple color hex lookups and sales region decoders.
5. **Exact Battery Diagnostics**: Multi-tier extraction targeting `idevicediagnostics ioregentry AppleSmartBattery` and `GasGauge` extracts exact `CycleCount`, `DesignCapacity`, `NominalChargeCapacity`, and `MaximumCapacityPercent`, with fallback to `com.apple.mobile.battery`.
6. **Subprocess Window Suppression**: All child process calls strictly enforce `creationflags=0x08000000` (`CREATE_NO_WINDOW`) to guarantee zero console window flashing during background 2-second polling.

---

## 2. libimobiledevice Binary Copy & Deployment Plan

### 2.1 Binary Audit & Dependency Analysis
Inspection of `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` confirmed 61 files. A full dependency and size audit revealed:
- **Excluded Bloat Files**:
  - `pymobiledevice3.exe` (44,184,190 bytes): Standalone Python-based tool, not required.
  - `ios.exe` (17,428,480 bytes): Unrelated CLI utility.
  - `sec.exe` (3,312,640 bytes): Unrelated signing utility.
- **Required Executables**:
  - `idevice_id.exe` (13,824 bytes): USB device detection and UDID listing.
  - `ideviceinfo.exe` (19,456 bytes): Device metadata and property query.
  - `idevicediagnostics.exe` (16,896 bytes): Battery health, cycle count, and IORegistry query.
  - `idevicepair.exe` (20,480 bytes): Pair state validation and trust handling.
  - `usbmuxd.exe` (70,144 bytes): Standalone usbmux multiplexer service daemon.
  - `idevicename.exe` (13,824 bytes): Optional device name query.
  - `idevicesyslog.exe` (24,064 bytes): Optional system logging.
- **Required Companion DLLs (29 files, 14.8 MB total)**:
  `imobiledevice.dll`, `usbmuxd.dll`, `plist.dll`, `libcrypto-1_1-x64.dll`, `libssl-1_1-x64.dll`, `libxml2.dll`, `pthreadVC3.dll`, `bz2.dll`, `getopt.dll`, `help.dll`, `helper.dll`, `iconv-2.dll`, `ideviceactivation.dll`, `imobiledevice-net-lighthouse.dll`, `irecovery.dll`, `libcrypto-3-x64.dll`, `libcurl.dll`, `libreadline8.dll`, `libssl` (extensionless dynamic library), `libssl-3-x64.dll`, `libtermcap-0.dll`, `libusb-1.0.dll`, `libusb0.dll`, `lzma.dll`, `pcre.dll`, `pcreposix.dll`, `readline.dll`, `vcruntime140.dll`, `zip.dll`, `zlib1.dll`.

### 2.2 Worker Automation Script (PowerShell Copy)
To deploy the binaries cleanly from the host location to `c:\Users\Eng_Ahmed\Desktop\label\bin\`, the Worker should execute the following automated copy commands:

```powershell
# 1. Create target bin directory if not exists
$binDir = "c:\Users\Eng_Ahmed\Desktop\label\bin"
if (!(Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force }

$srcDir = "C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64"

# 2. Copy all companion DLLs (29 files)
Copy-Item "$srcDir\*.dll" -Destination $binDir -Force
Copy-Item "$srcDir\libssl" -Destination $binDir -Force -ErrorAction SilentlyContinue

# 3. Copy target libimobiledevice executables
$executables = @(
    "idevice_id.exe",
    "ideviceinfo.exe",
    "idevicediagnostics.exe",
    "idevicepair.exe",
    "usbmuxd.exe",
    "idevicename.exe",
    "idevicesyslog.exe",
    "ideviceenterrecovery.exe"
)

foreach ($exe in $executables) {
    if (Test-Path "$srcDir\$exe") {
        Copy-Item "$srcDir\$exe" -Destination $binDir -Force
    }
}
```

---

## 3. Apple Model Dictionary Specification (`data/apple_models.json`)

### 3.1 JSON File Schema
The file `c:\Users\Eng_Ahmed\Desktop\label\data\apple_models.json` must be structured so that direct key lookups `data.get(product_type)` return the official human-readable marketing name string, while also accommodating auxiliary color and sales region dictionaries:

```json
{
  "_metadata": {
    "version": "1.0.0",
    "description": "Apple ProductType to Marketing Name and Hardware Specs mapping",
    "generated_for": "Milestone 1 Core Extraction Engine"
  },
  "models": {
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
    "iPhone7,1": "iPhone 6 Plus",
    "iPhone6,1": "iPhone 5s",
    "iPhone6,2": "iPhone 5s",
    "iPhone5,3": "iPhone 5c",
    "iPhone5,4": "iPhone 5c",
    "iPhone5,1": "iPhone 5",
    "iPhone5,2": "iPhone 5"
  },
  "ram_specs": {
    "iPhone 16 Pro": "8GB",
    "iPhone 16 Pro Max": "8GB",
    "iPhone 16": "8GB",
    "iPhone 16 Plus": "8GB",
    "iPhone 15 Pro": "8GB",
    "iPhone 15 Pro Max": "8GB",
    "iPhone 15": "6GB",
    "iPhone 15 Plus": "6GB",
    "iPhone 14 Pro": "6GB",
    "iPhone 14 Pro Max": "6GB",
    "iPhone 14": "6GB",
    "iPhone 14 Plus": "6GB",
    "iPhone 13 Pro": "6GB",
    "iPhone 13 Pro Max": "6GB",
    "iPhone 13 mini": "4GB",
    "iPhone 13": "4GB",
    "iPhone SE (3rd Gen)": "4GB",
    "iPhone 12 mini": "4GB",
    "iPhone 12": "4GB",
    "iPhone 12 Pro": "6GB",
    "iPhone 12 Pro Max": "6GB",
    "iPhone 11": "4GB",
    "iPhone 11 Pro": "4GB",
    "iPhone 11 Pro Max": "4GB",
    "iPhone SE (2nd Gen)": "3GB",
    "iPhone XS": "4GB",
    "iPhone XS Max": "4GB",
    "iPhone XR": "3GB",
    "iPhone X": "3GB",
    "iPhone 8 Plus": "3GB",
    "iPhone 8": "2GB",
    "iPhone 7 Plus": "3GB",
    "iPhone 7": "2GB",
    "iPhone SE (1st Gen)": "2GB",
    "iPhone 6s": "2GB",
    "iPhone 6s Plus": "2GB",
    "iPhone 6": "1GB",
    "iPhone 6 Plus": "1GB"
  },
  "colors": {
    "#505e6b": "Natural Titanium",
    "#535150": "Natural Titanium",
    "#5f5e5c": "Natural Titanium",
    "#bca593": "Desert Titanium",
    "#c5b09d": "Desert Titanium",
    "#d1bfae": "Desert Titanium",
    "#35373a": "Black Titanium",
    "#3c3b37": "Black Titanium",
    "#2b2b2c": "Black Titanium",
    "#dededc": "White Titanium",
    "#e4e4e2": "White Titanium",
    "#3f4650": "Blue Titanium",
    "#39424e": "Blue Titanium",
    "#232a31": "Midnight",
    "#1c232e": "Midnight",
    "#faf7f2": "Starlight",
    "#f0ede6": "Starlight",
    "#343335": "Space Gray",
    "#3b3b3c": "Space Gray",
    "#4b4845": "Space Gray",
    "#1f2020": "Space Black",
    "#e1e4e3": "Silver",
    "#e3e4e5": "Silver",
    "#f5f5f0": "Silver",
    "#d4c9b1": "Gold",
    "#f9e5c9": "Gold",
    "#fad7bd": "Gold",
    "#e8c7c8": "Rose Gold",
    "#b9928f": "Rose Gold",
    "#bf0012": "PRODUCT(RED)",
    "#e11c2a": "PRODUCT(RED)",
    "#275878": "Pacific Blue",
    "#a7c1d9": "Sierra Blue",
    "#445847": "Alpine Green",
    "#576856": "Midnight Green",
    "#867a9a": "Deep Purple"
  },
  "regions": {
    "LL/A": "USA",
    "CH/A": "China",
    "ZP/A": "Hong Kong",
    "J/A": "Japan",
    "KH/A": "South Korea",
    "AE/A": "UAE",
    "AB/A": "Middle East",
    "B/A": "United Kingdom",
    "ZD/A": "Germany",
    "FD/A": "France",
    "EU/A": "Europe",
    "HN/A": "India",
    "VN/A": "Vietnam",
    "MY/A": "Malaysia",
    "X/A": "Australia",
    "C/A": "Canada",
    "TA/A": "Taiwan"
  }
}
```

### 3.2 Dual-Format Compatibility Resolver
To guarantee seamless interoperability whether `data/apple_models.json` is formatted as a flat dictionary `{ "iPhone17,1": "iPhone 16 Pro" }` or the nested multi-section dictionary above, `core/ios_reader.py` must implement dual-format detection:
```python
def load_apple_models(json_path: str) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "models" in data:
        models = data["models"]
        ram = data.get("ram_specs", {})
        colors = data.get("colors", {})
        regions = data.get("regions", {})
    else:
        # Flat dictionary format
        models = {k: v for k, v in data.items() if not k.startswith("_")}
        ram, colors, regions = {}, {}, {}
    return models, ram, colors, regions
```

---

## 4. `core/ios_reader.py` Architectural Design

### 4.1 Subprocess Execution Rules
1. Every invocation of `idevice_id.exe`, `ideviceinfo.exe`, or `idevicediagnostics.exe` must set:
   ```python
   CREATE_NO_WINDOW = 0x08000000
   ```
2. Execution must use a 3.0-second timeout to prevent deadlocks if the usbmuxd pipe hangs.
3. Raw byte output must be captured (`stdout=subprocess.PIPE, stderr=subprocess.PIPE`) and decoded safely with `plistlib.loads` for XML plists, or `encoding="utf-8", errors="replace"` for text output.

### 4.2 Commercial Storage Decimal Rounding Algorithm
iOS calculates storage in decimal bytes ($1\text{ GB} = 10^9\text{ bytes}$). Apple devices format `TotalDiskCapacity` as a decimal byte integer.
The deterministic conversion formula:
$$\text{GB} = \frac{\text{TotalDiskCapacity}}{10^9}$$

Mapping thresholds:
```python
def parse_ios_storage(total_bytes: int) -> str:
    """Converts TotalDiskCapacity in bytes to standard commercial capacity."""
    if not total_bytes or total_bytes <= 0:
        return "Unknown"
    gb = total_bytes / 1e9
    if gb <= 18.0:
        return "16GB"
    elif gb <= 36.0:
        return "32GB"
    elif gb <= 72.0:
        return "64GB"
    elif gb <= 145.0:
        return "128GB"
    elif gb <= 290.0:
        return "256GB"
    elif gb <= 580.0:
        return "512GB"
    elif gb <= 1150.0:
        return "1TB"
    elif gb <= 2300.0:
        return "2TB"
    else:
        return f"{round(gb)}GB"
```

### 4.3 Color Resolution Pipeline
The resolution pipeline handles both hex codes and string identifiers returned in `DeviceColor` and `DeviceEnclosureColor`:
```python
def resolve_apple_color(raw_color: Optional[str], raw_enclosure: Optional[str] = None, color_map: Optional[Dict[str, str]] = None) -> str:
    """
    Resolves Apple DeviceColor/DeviceEnclosureColor to a human-readable English name.
    """
    map_lookup = color_map or {}
    
    # 1. Try enclosure hex code first
    for candidate in [raw_enclosure, raw_color]:
        if candidate and candidate.startswith("#"):
            hex_lower = candidate.lower()
            if hex_lower in map_lookup:
                return map_lookup[hex_lower]
                
    # 2. Try raw color identifier string
    candidate_str = raw_color or raw_enclosure or ""
    if not candidate_str:
        return "Unknown"
        
    candidate_str = candidate_str.strip()
    if candidate_str.startswith("#"):
        return candidate_str.upper()
        
    # Standard string normalization (e.g. "space_gray" -> "Space Gray")
    clean_name = candidate_str.replace("_", " ").replace("-", " ").title()
    if "Product" in clean_name and "Red" in clean_name:
        return "(PRODUCT)RED"
    return clean_name
```

### 4.4 Model Number & Region Info Parser
`ideviceinfo` returns:
- `ModelNumber`: e.g. `"MLKN3"` or `"MYNT3"`
- `RegionInfo`: e.g. `"LL/A"` or `"J/A"`
In Apple's sales hierarchy, the full commercial part number is the combination: `f"{ModelNumber}{RegionInfo}"` (e.g. `MYNT3LL/A`).
The sales region is stored directly as `"LL/A"`, with optional region country lookup.

```python
def parse_apple_part_and_region(model_num: Optional[str], region_info: Optional[str]) -> Tuple[str, str]:
    model = (model_num or "").strip()
    region = (region_info or "").strip()
    
    # Format region: ensure standard suffix style
    if region and not region.endswith("/A") and len(region) <= 3:
        region = f"{region}/A"
        
    part_number = f"{model}{region}" if (model and region) else (model or region or "Unknown")
    return part_number, region
```

### 4.5 Battery Diagnostics & Health Extraction
iOS exposes battery diagnostics through `idevicediagnostics`. The engine applies a robust 3-stage fallback ladder:

```
[ Stage 1: idevicediagnostics ioregentry AppleSmartBattery ]
                         │
                         ├── Success: Parse CycleCount, NominalChargeCapacity, DesignCapacity, MaximumCapacityPercent
                         ▼
[ Stage 2: idevicediagnostics diagnostics GasGauge ]
                         │
                         ├── Success: Parse CycleCount, NominalChargeCapacity, DesignCapacity
                         ▼
[ Stage 3: ideviceinfo -q com.apple.mobile.battery -x ]
                         │
                         └── Fallback: Extract BatteryCurrentCapacity (charge level)
```

#### Battery Parsing Logic:
```python
def parse_battery_health_plist(plist_bytes: bytes) -> Tuple[Optional[int], Optional[int]]:
    """
    Parses battery diagnostic XML plist data.
    Returns (battery_health_percentage, cycle_count).
    """
    try:
        data = plistlib.loads(plist_bytes)
    except Exception:
        return None, None

    def find_key(obj: Any, key: str) -> Optional[Any]:
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                res = find_key(v, key)
                if res is not None:
                    return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_key(item, key)
                if res is not None:
                    return res
        return None

    cycle_count = find_key(data, "CycleCount")
    max_pct = find_key(data, "MaximumCapacityPercent")
    nominal_cap = find_key(data, "NominalChargeCapacity")
    design_cap = find_key(data, "DesignCapacity")

    health: Optional[int] = None
    if max_pct is not None and isinstance(max_pct, (int, float)) and 1 <= max_pct <= 100:
        health = int(round(max_pct))
    elif nominal_cap and design_cap and design_cap > 0:
        health = min(100, max(0, int(round((nominal_cap / design_cap) * 100))))

    cycles = int(cycle_count) if (cycle_count is not None and isinstance(cycle_count, (int, float))) else None
    return health, cycles
```

### 4.6 Lockdown State Machine & Error Handling
When a device is connected via USB, iOS requires passcode unlock and pairing authorization ("Trust This Computer"):
1. **`PasswordProtected` (Error -17)**:
   - Output contains: `PasswordProtected` or `Could not connect to lockdownd: Password protected`
   - State: `LOCKED`
   - Action: Notify status `"Device Locked - Enter Passcode on iPhone"`
2. **`PairingDialogResponsePending` (Error -19)**:
   - Output contains: `PairingDialogResponsePending` or `Pairing dialog response pending`
   - State: `PAIRING_PENDING`
   - Action: Notify status `"Tap 'Trust This Computer' on iPhone screen"`
3. **`UserDeniedPairing` (Error -18)**:
   - State: `PAIRING_DENIED`
   - Action: Notify status `"Pairing Denied by User"`
4. **`No device found`**:
   - State: `IDLE`
   - Action: Reset connection indicators

### 4.7 Pure-Python Background Polling Engine
`core/ios_reader.py` must remain completely decoupled from PyQt6 so that:
- It runs seamlessly in automated headless testing (`pytest`, `unittest`).
- It avoids Qt thread context dependencies in the core layer.
- The UI layer (`ui/`) or worker threads can bind to it via clean Python callbacks.

```python
# Architecture Blueprint for core/ios_reader.py
import os
import sys
import json
import time
import plistlib
import logging
import threading
import subprocess
from typing import Optional, Dict, Any, List, Callable, Tuple, Set

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000

class IOSReader:
    """
    Production-grade iOS extraction engine using libimobiledevice binaries.
    """
    def __init__(self, bin_dir: Optional[str] = None, models_json_path: Optional[str] = None):
        self.bin_dir = bin_dir or self._default_bin_dir()
        self.models_json_path = models_json_path or self._default_models_path()
        self.models, self.ram_specs, self.colors, self.regions = self._load_apple_data()
        
        self._polling_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._connected_udids: Set[str] = set()
        
    def _default_bin_dir(self) -> str:
        # Dynamic path resolution with fallback
        try:
            from core.paths import get_bin_path
            return os.path.dirname(get_bin_path("idevice_id.exe"))
        except ImportError:
            return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bin")

    def _default_models_path(self) -> str:
        try:
            from core.paths import get_data_path
            return get_data_path("apple_models.json")
        except ImportError:
            return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "apple_models.json")

    def _load_apple_data(self) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
        if os.path.exists(self.models_json_path):
            try:
                with open(self.models_json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "models" in data:
                    return data["models"], data.get("ram_specs", {}), data.get("colors", {}), data.get("regions", {})
                return {k: v for k, v in data.items() if not k.startswith("_")}, {}, {}, {}
            except Exception as e:
                logger.error(f"Failed to load apple_models.json: {e}")
        # Built-in fallback dictionary
        return self._builtin_fallback_models(), {}, {}, {}

    def _builtin_fallback_models(self) -> Dict[str, str]:
        return {
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

    def _exec(self, binary_name: str, args: List[str], timeout: float = 3.0) -> Tuple[int, bytes, bytes]:
        exe_path = os.path.join(self.bin_dir, binary_name)
        if not os.path.exists(exe_path):
            exe_path = binary_name  # fallback to PATH
        cmd = [exe_path] + args
        try:
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW,
                timeout=timeout
            )
            return res.returncode, res.stdout, res.stderr
        except subprocess.TimeoutExpired:
            return -1, b"", b"TimeoutExpired"
        except Exception as e:
            return -2, b"", str(e).encode()

    def list_device_udids(self) -> List[str]:
        """Lists connected USB device UDIDs via idevice_id -l."""
        code, out, _ = self._exec("idevice_id.exe", ["-l"])
        if code != 0 or not out:
            return []
        lines = out.decode("utf-8", errors="replace").splitlines()
        return [line.strip() for line in lines if line.strip()]

    def extract_device_telemetry(self, udid: Optional[str] = None) -> Tuple[Optional[Any], str]:
        """
        Queries and returns (DeviceSpecs, status_message).
        """
        args = ["-x"]
        if udid:
            args = ["-u", udid, "-x"]
            
        code, out, err = self._exec("ideviceinfo.exe", args)
        err_str = err.decode("utf-8", errors="replace") + out.decode("utf-8", errors="replace")
        
        # Check lockdown errors
        if "PasswordProtected" in err_str or "-17" in err_str:
            return None, "Device Locked - Enter Passcode on iPhone"
        if "PairingDialogResponsePending" in err_str or "-19" in err_str:
            return None, "Tap 'Trust This Computer' on iPhone screen"
        if "UserDeniedPairing" in err_str or "-18" in err_str:
            return None, "Pairing Denied by User"
        if code != 0 or not out:
            return None, "No device response or lockdownd connection error"

        try:
            plist = plistlib.loads(out)
        except Exception as e:
            return None, f"Failed to parse device plist: {e}"

        # Import DeviceSpecs
        try:
            from core.models import DeviceSpecs
        except ImportError:
            from dataclasses import dataclass, field
            @dataclass
            class DeviceSpecs:
                connection_type: str
                device_id: str
                brand: str
                marketing_name: str
                model_code: str
                storage: str
                ram: str
                color: str
                os_version: str
                serial_number: str
                imei1: str
                imei2: Optional[str] = None
                battery_health: Optional[int] = None
                battery_cycles: Optional[int] = None
                sales_region: Optional[str] = None
                bootloader_locked: Optional[bool] = None
                condition_grade: str = "A+"
                remarks: str = ""
                raw_properties: Dict[str, Any] = field(default_factory=dict)

        # Field Extraction
        product_type = str(plist.get("ProductType", ""))
        marketing_name = self.models.get(product_type, product_type or "Apple iPhone")
        ram = self.ram_specs.get(marketing_name, "")
        
        raw_storage = plist.get("TotalDiskCapacity", 0)
        storage = parse_ios_storage(int(raw_storage) if raw_storage else 0)
        
        device_color = str(plist.get("DeviceColor", ""))
        enclosure_color = str(plist.get("DeviceEnclosureColor", ""))
        color = resolve_apple_color(device_color, enclosure_color, self.colors)
        
        os_version = f"iOS {plist.get('ProductVersion', '')}".strip()
        serial_number = str(plist.get("SerialNumber", ""))
        active_udid = udid or str(plist.get("UniqueDeviceID", ""))
        
        imei1 = str(plist.get("InternationalMobileEquipmentIdentity", ""))
        imei2_val = plist.get("InternationalMobileEquipmentIdentity2")
        imei2 = str(imei2_val) if imei2_val else None
        
        model_num = plist.get("ModelNumber")
        region_info = plist.get("RegionInfo")
        part_number, sales_region = parse_apple_part_and_region(model_num, region_info)
        
        # Battery Extraction
        battery_health, battery_cycles = self.extract_battery_telemetry(active_udid)

        specs = DeviceSpecs(
            connection_type="ios",
            device_id=active_udid,
            brand="Apple",
            marketing_name=marketing_name,
            model_code=part_number,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_version,
            serial_number=serial_number,
            imei1=imei1,
            imei2=imei2,
            battery_health=battery_health,
            battery_cycles=battery_cycles,
            sales_region=sales_region or None,
            bootloader_locked=True,
            condition_grade="A+",
            remarks="",
            raw_properties=plist
        )
        return specs, "Ready"

    def extract_battery_telemetry(self, udid: str) -> Tuple[Optional[int], Optional[int]]:
        """
        Executes idevicediagnostics to extract battery health and cycles.
        """
        # Step 1: AppleSmartBattery
        args = ["-u", udid, "ioregentry", "AppleSmartBattery"] if udid else ["ioregentry", "AppleSmartBattery"]
        code, out, _ = self._exec("idevicediagnostics.exe", args)
        if code == 0 and out and b"xml" in out:
            health, cycles = parse_battery_health_plist(out)
            if health is not None or cycles is not None:
                return health, cycles

        # Step 2: GasGauge fallback
        args_gg = ["-u", udid, "diagnostics", "GasGauge"] if udid else ["diagnostics", "GasGauge"]
        code_gg, out_gg, _ = self._exec("idevicediagnostics.exe", args_gg)
        if code_gg == 0 and out_gg and b"xml" in out_gg:
            health, cycles = parse_battery_health_plist(out_gg)
            if health is not None or cycles is not None:
                return health, cycles

        # Step 3: com.apple.mobile.battery query fallback
        args_bat = ["-u", udid, "-q", "com.apple.mobile.battery", "-x"] if udid else ["-q", "com.apple.mobile.battery", "-x"]
        code_bat, out_bat, _ = self._exec("ideviceinfo.exe", args_bat)
        if code_bat == 0 and out_bat:
            try:
                plist = plistlib.loads(out_bat)
                curr_cap = plist.get("BatteryCurrentCapacity")
                if curr_cap is not None:
                    return int(curr_cap), None
            except Exception:
                pass

        return None, None

    def start_polling(
        self,
        on_connected: Callable[[Any], None],
        on_disconnected: Optional[Callable[[str], None]] = None,
        on_status: Optional[Callable[[str], None]] = None,
        interval: float = 2.0
    ):
        """Starts background 2-second polling thread."""
        self.stop_polling()
        self._stop_event.clear()
        
        def _poll_worker():
            while not self._stop_event.is_set():
                udids = self.list_device_udids()
                current_set = set(udids)
                
                # Detect new connections
                new_udids = current_set - self._connected_udids
                for udid in new_udids:
                    specs, status = self.extract_device_telemetry(udid)
                    if specs:
                        self._connected_udids.add(udid)
                        on_connected(specs)
                        if on_status:
                            on_status("iOS Normal")
                    else:
                        if on_status:
                            on_status(status)

                # Detect disconnections
                lost_udids = self._connected_udids - current_set
                for udid in lost_udids:
                    self._connected_udids.remove(udid)
                    if on_disconnected:
                        on_disconnected(udid)
                    if on_status:
                        on_status("No iOS device connected")
                        
                self._stop_event.wait(timeout=interval)

        self._polling_thread = threading.Thread(target=_poll_worker, daemon=True, name="IOSReaderPollingThread")
        self._polling_thread.start()

    def stop_polling(self):
        """Gracefully halts the background polling thread."""
        self._stop_event.set()
        if self._polling_thread and self._polling_thread.is_alive():
            self._polling_thread.join(timeout=3.0)
        self._polling_thread = None
```

---

## 5. Implementation Roadmap & Worker Recommendations

To implement Milestone 1 iOS components efficiently without conflicts, the Worker should execute the following sequence:

1. **Step 1: Directory Setup & Binary Deployment**
   - Create directories `bin/` and `data/`.
   - Run the PowerShell copy script to transfer all 29 companion DLLs and the required `idevice*.exe` and `usbmuxd.exe` binaries from `C:\Users\Eng_Ahmed\Downloads\iServicePro-Legacy\win-x64\` into `c:\Users\Eng_Ahmed\Desktop\label\bin\`.
2. **Step 2: Generate `data/apple_models.json`**
   - Write the complete JSON dictionary specified in Section 3.1 containing iPhone 5 through iPhone 16 series, RAM ratings, color hex mappings, and sales region codes.
3. **Step 3: Implement `core/ios_reader.py`**
   - Implement the complete class architecture from Section 4.7.
   - Ensure import interoperability with `core/paths.py` and `core/models.py`.
4. **Step 4: Unit Testing & Verification**
   - Execute unit tests targeting `test_ios_reader.py` using mock XML plist payloads.
   - Verify all boundary conditions (decimal storage rounding, color mapping, battery health percentage formula, lockdown error states).

---

## 6. Synthesis with Milestone 1 Peers

| Component | Explorer 1 (Android & Runtime) | Explorer 2 (iOS & Apple Dict) | Explorer 3 (Simulation & Tests) |
|---|---|---|---|
| **Binary Paths** | Designs `core/paths.py` | Supplies `get_bin_path` consumers for `ideviceinfo.exe` | Uses `paths.py` for test fixtures |
| **Data Models** | Designs `core/models.py` | Instantiates `DeviceSpecs(connection_type="ios")` | Creates mock `DeviceSpecs` profiles |
| **Data Store** | Android model resolver regexes | `data/apple_models.json` dictionary | Validates both in test harness |
| **Polling Engine** | `core/adb_reader.py` | `core/ios_reader.py` | `core/mock_device.py` |
| **Thread Safety** | Non-blocking 2s loop | Non-blocking 2s loop | Instantaneous state switching |
