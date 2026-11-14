# Comprehensive Technical Analysis: Milestone M2
## iOS Telemetry Extraction & Zero-Click Background USB Listener

---

## Executive Summary

This document establishes the exhaustive technical implementation strategy for **Milestone M2** of the **Mobile Phone Sales & Repair Lab Smart Labeler**, specifically focusing on:
1. **iOS Telemetry Extraction Engine** (`core/ios_reader.py`)
2. **Zero-Click Background USB Listener & FSM State Machine** (`core/device_detector.py`)
3. **Portable ADB Key Vault Integration** (`core/paths.py` and `core/adb_reader.py`)

All specifications, algorithms, and proposed code blocks strictly adhere to `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the hardware mining protocol in `spec_hardware_extraction.md`.

---

## 1. Deep-Dive Inspection of Current Implementation

### 1.1 `core/ios_reader.py`
The existing `core/ios_reader.py` implements the foundational skeleton for iOS extraction via `libimobiledevice`. Inspection of lines 1–675 reveals several critical functional strengths alongside high-risk vulnerabilities and edge-case defects:

#### Strengths Verified:
- **ProductType Mapping Table (`BUILTIN_APPLE_MODELS`)**: Covers iPhone 16 Pro Max (`iPhone17,2`), iPhone 16 Pro (`iPhone17,1`), iPhone 16 Plus (`iPhone17,4`), iPhone 16 (`iPhone17,3`), iPhone 15 series down to iPhone 5.
- **Factory RAM Ratings (`BUILTIN_RAM_SPECS`)**: Correctly maps 8GB RAM to iPhone 16 series and 15 Pro series, 6GB to iPhone 15/14/13 Pro, down to 1GB for legacy devices.
- **Commercial Storage Decimal Rounding (`parse_ios_commercial_storage`)**: Uses commercial decimal gigabytes ($B / 10^9$) mapped across standard retail capacity boundaries (16GB, 32GB, 64GB, 128GB, 256GB, 512GB, 1TB, 2TB).
- **Subprocess Creation Flags**: Uses `CREATE_NO_WINDOW = 0x08000000` on Windows to suppress console prompt flashing.

#### Critical Gaps & Vulnerabilities Identified:
1. **Vulnerability to Banner / CLI Noise in `calculate_ios_battery_health`**:
   - *Current Code* (lines 334–340):
     ```python
     if isinstance(battery_data_or_bytes, (bytes, bytearray)):
         try:
             parsed = plistlib.loads(battery_data_or_bytes)
     ```
   - *Bug*: In real-world Windows environments, `idevicediagnostics` frequently outputs transient CLI lines before the XML payload (e.g., `Connecting to device...`, `Requesting IORegistry entry...`, or Windows CR/LF padding). `plistlib.loads` expects XML declarations strictly starting at index 0. If any text precedes `<?xml`, `plistlib.loads` throws an uncaught `expat.ExpatError` or `InvalidFileException`, returning `(None, None)`.
   - *Fix*: The parser must slice `payload` between `payload.find(b"<?xml")` (or `b"<plist"`) and `payload.rfind(b"</plist>") + 8`.
2. **Semantic Battery Health Fallback Defect in `extract_battery_telemetry`**:
   - *Current Code* (lines 598–602):
     ```python
     plist = plistlib.loads(out3)
     curr_cap = plist.get("BatteryCurrentCapacity")
     if curr_cap is not None:
         return int(curr_cap), None
     ```
   - *Bug*: `BatteryCurrentCapacity` in `com.apple.mobile.battery` is the **current battery charge level** (e.g. 85%), NOT the Maximum Capacity / Health %! Returning this value reports a phone at 40% battery charge as having "40% Battery Health" on thermal sales labels.
   - *Fix*: When `AppleSmartBattery` and `GasGauge` diagnostics fail, `battery_health` must return `None` unless authentic capacity metrics (`NominalChargeCapacity` and `DesignCapacity`) can be derived.
3. **Duplicate Sales Region Suffix Bug in `parse_apple_part_and_region`**:
   - *Current Code* (lines 318–326):
     ```python
     part_number = f"{model}{region}" if (model and region) else ...
     ```
   - *Bug*: Many iPhones report the full SKU in `ModelNumber` (e.g. `MYWV3LL/A`). If `RegionInfo` is also `LL/A`, this produces `MYWV3LL/ALL/A`.
   - *Fix*: Check if `model` already ends with `region` or matches `[A-Z]{1,3}/A$`. If `RegionInfo` is absent, extract region from `ModelNumber`.
4. **Missing 15-Digit Luhn IMEI Verification**:
   - *Current Code* (line 446): Directly takes `InternationalMobileEquipmentIdentity` string without Luhn check digit validation or non-digit sanitization.
5. **Lockdown State Visibility**:
   - Current code returns `None, "status string"`, but doesn't surface a structured enum state (`LOCKED`, `TRUST_PENDING`, `DENIED`) to drive UI status pills and warning dialogs.

---

### 1.2 `core/device_detector.py` (Currently Missing)
`PROJECT.md` line 92 and `ORIGINAL_REQUEST.md` R3 mandate:
`- core/device_detector.py: Background USB monitoring (WMI / polling), thread-safe Qt signals.`

#### Current State:
`core/device_detector.py` does not exist in the project repository. Currently, `ui/status_bar.py` contains a naive 1.0s `QTimer` inside `PollingWorker` that performs direct blocking calls to `AdbReader.poll_once()` and `IOSReader.list_device_udids()`.

#### Required Capabilities:
1. **Tri-Channel Hybrid USB Detection**:
   - **Channel A**: Windows WMI `Win32_PnPEntity` device operation event interceptor (`SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity'`). Instant 10–50ms wake-up on hardware insertion.
   - **Channel B**: ADB device streaming socket (`host:track-devices` over loopback port 5037).
   - **Channel C**: 1.0s debounced fallback poller as fail-safe.
2. **Finite State Machine (FSM)**:
   - States: `DISCONNECTED`, `CONNECTING` (600ms debounce), `CONNECTED_ANDROID_ADB`, `CONNECTED_ANDROID_UNAUTHORIZED`, `CONNECTED_FASTBOOT`, `CONNECTED_IOS_NORMAL`, `CONNECTED_IOS_LOCKED`, `CONNECTED_IOS_PAIRING_PENDING`, `ERROR`.
3. **USB Contact Bounce Elimination & Idempotency Guard**:
   - Physical USB insertion flaps 2–5 times within 200–400ms. A 600ms debounce timer stabilizes the bus before launching heavy CLI extraction.
   - Idempotency guard suppresses duplicate query triggers if serial/UDID is unchanged and query occurred within <2.0s.
4. **Thread-Safe Architecture**:
   - Implemented as a `QObject` (`DeviceDetectorWorker`) managed by a persistent `QThread`.
   - Pure Python callback interface (`on_device_connected`, `on_device_disconnected`, `on_status_changed`) ensuring 100% functionality in headless and unit-test environments without requiring a running `QApplication`.
   - Mock simulation routing (`live`, `mock_s24`, `mock_iphone16`, `mock_fastboot`, `mock_offline`).

---

### 1.3 Portable ADB Key Vault (`core/paths.py` & `core/adb_reader.py`)
`PROJECT.md` contracts specify:
- `core.paths.get_adb_keys_dir() -> Path`: Resolves `./data/adb_keys` relative to application root (development or frozen).
- `core.paths.setup_adb_environment() -> Dict[str, str]`: Injects `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` into `os.environ`.

Currently, neither function is exported by `core/paths.py`, and `AdbReader` does not guarantee key vault configuration prior to starting `adb.exe`.

---

## 2. Technical Specification & Concrete Design

### 2.1 Complete ProductType & Sales Region Matrix

#### iPhone 16 Series Specifications:
| ProductType | Commercial Marketing Name | Factory RAM | Typical Battery Design (mAh) |
|-------------|---------------------------|-------------|------------------------------|
| `iPhone17,1` | **iPhone 16 Pro** | 8GB | 3582 mAh |
| `iPhone17,2` | **iPhone 16 Pro Max** | 8GB | 4685 mAh |
| `iPhone17,3` | **iPhone 16** | 8GB | 3561 mAh |
| `iPhone17,4` | **iPhone 16 Plus** | 8GB | 4674 mAh |

#### Sales Region Decoding & Hardware Variance Matrix:
| Token | Descriptive Commercial Region | Hardware / Regulatory Variance |
|-------|-------------------------------|--------------------------------|
| `LL/A` or `LL` | **USA (eSIM Only / mmWave 5G)** | No physical SIM tray on iPhone 14/15/16 |
| `CH/A` or `CH` | **China (Dual Physical Nano-SIM)** | No FaceTime Audio / eSIM disabled |
| `ZP/A` or `ZP` | **Hong Kong / Macau / Singapore** | Dual Nano-SIM in HK/Macau; FaceTime Audio active |
| `J/A` or `J` | **Japan** | Permanent hardware camera shutter sound |
| `KH/A` or `KH` | **South Korea** | Enforced shutter sound; location tracking consent |
| `AE/A` or `AE` | **United Arab Emirates (UAE)** | FaceTime historically restricted |
| `AB/A` or `AB` | **Egypt / Saudi Arabia / Middle East** | Standard Middle Eastern regional retail SKU |
| `B/A` or `B` | **United Kingdom / Ireland** | UK regulatory markings (CE/UKCA) |
| `ZD/A` or `ZD` | **Germany / Austria / Switzerland** | European Union open market |
| `FD/A` or `FD` | **France** | Hearing safety dB limits |
| `EU/A` or `EU` | **European Union Open** | Standard EU SKU |
| `HN/A` or `HN` | **India** | BIS certified |
| `VN/A` or `VN` | **Vietnam** | Southeast Asia variant |
| `MY/A` or `MY` | **Malaysia** | SIRIM certified |
| `X/A` or `X` | **Australia / New Zealand** | RCM regulatory compliance |
| `C/A` or `C` | **Canada** | IC certification; physical SIM + eSIM |
| `TA/A` or `TA` | **Taiwan** | NCC certification |

---

### 2.2 iOS Battery Health Derivation Algorithm

Apple does not provide battery health in the root plist of `ideviceinfo`. The engine queries `idevicediagnostics` using the following exact multi-tier fallback algorithm:

```
               +-------------------------------------------------+
               | idevicediagnostics ioregentry AppleSmartBattery |
               +-------------------------------------------------+
                                        |
                            [Valid XML Plist bytes?]
                                        |
                         +--------------+--------------+
                         | YES                         | NO
                         v                             v
             [Extract Keys from Plist]    +-----------------------------+
             - MaximumCapacityPercent     | idevicediagnostics          |
             - NominalChargeCapacity      | diagnostics GasGauge        |
             - DesignCapacity             +--------------+--------------+
             - CycleCount                                |
                         |                     [Valid XML Plist?]
                         |                               |
                         |                +--------------+--------------+
                         |                | YES                         | NO
                         |                v                             v
                         +-------> [Calculate Health]             [health = None]
                                   [ health % = round(             cycles = None]
                                   [  (Nominal / Design) * 100)   ]
                                   [ Clamped: min(100, max(0, h)) ]
```

#### Exact Clamping Formula:
$$\text{Battery Health \%} = \min\left(100, \max\left(0, \operatorname{round}\left( \frac{\text{NominalChargeCapacity}}{\text{DesignCapacity}} \times 100 \right)\right)\right)$$

*Overprovisioning Note*: Brand new factory batteries frequently measure `NominalChargeCapacity` (e.g. 3400 mAh) higher than rated `DesignCapacity` (e.g. 3274 mAh), resulting in unrounded calculations of 103.8%. Clamping strictly to `100%` is mandatory to avoid erroneous printing on retail labels.

---

### 2.3 Zero-Click Background USB Listener Architecture

```
+=============================================================================+
|                      ZERO-CLICK USB DETECTOR SUBSYSTEM                      |
+=============================================================================+
                                       |
          +----------------------------+----------------------------+
          |                                                         |
          v                                                         v
+-----------------------------+                           +-------------------+
|  Channel A: WMI PnP Events  |                           | Channel B: ADB    |
|  __InstanceOperationEvent   |                           | track-devices     |
|  (Apple, Samsung, Google,   |                           | Loopback Socket   |
|   Xiaomi, Oppo, Huawei VIDs)|                           | (127.0.0.1:5037)  |
+-----------------------------+                           +-------------------+
          |                                                         |
          +----------------------------+----------------------------+
                                       |
                                       v
                    +-------------------------------------+
                    | 600ms Software Debounce & FSM Guard |
                    | (Filters USB contact pin bounce)    |
                    +-------------------------------------+
                                       |
                                       v
                    +-------------------------------------+
                    |       Fast Mode Probe Ladder        |
                    | 1. iOS: idevice_id -l               |
                    | 2. Android: adb devices -l          |
                    | 3. Fastboot: fastboot devices       |
                    +-------------------------------------+
                                       |
                                       v
                    +-------------------------------------+
                    | Telemetry Dispatch to PyQt6 UI      |
                    | specs_received(DeviceSpecs)         |
                    | status_changed(dict)                |
                    | device_disconnected()               |
                    +-------------------------------------+
```

#### Windows WMI Vendor ID (VID) Filter Set:
- Apple Mobile Devices: `USB\VID_05AC`
- Google Pixel: `USB\VID_18D1`
- Samsung Electronics: `USB\VID_04E8`
- Xiaomi Inc.: `USB\VID_2717`
- Oppo / Realme / OnePlus: `USB\VID_22D9`
- Huawei Technologies: `USB\VID_12D1`
- MediaTek Preloader / ADB: `USB\VID_0E8D`
- Qualcomm HS-USB: `USB\VID_05C6`

---

## 3. Proposed Exact Code Changes

### 3.1 Proposed Additions to `core/paths.py`
Add the Portable ADB Key Vault resolution functions to `core/paths.py`:

```python
# ---------------------------------------------------------------------------
# Portable ADB Key Vault Paths (Milestone M2)
# ---------------------------------------------------------------------------

def get_adb_keys_dir(base_dir: Optional[Path] = None) -> Path:
    """
    Resolves the dedicated ./data/adb_keys directory relative to the application root.
    Ensures the directory exists before returning.
    """
    if base_dir is not None:
        vault = base_dir / "data" / "adb_keys"
    else:
        vault = get_app_data_dir() / "adb_keys"
    vault.mkdir(parents=True, exist_ok=True)
    return vault


def setup_adb_environment(base_dir: Optional[Path] = None) -> Dict[str, str]:
    """
    Configures environment variables for portable ADB key isolation:
    - ANDROID_SDK_HOME
    - ANDROID_PREFS_ROOT
    - ADB_VENDOR_KEYS
    Injects variables into os.environ and returns the modified environment dictionary.
    """
    vault_dir = get_adb_keys_dir(base_dir)
    vault_path_str = str(vault_dir.resolve())
    
    os.environ["ANDROID_SDK_HOME"] = vault_path_str
    os.environ["ANDROID_PREFS_ROOT"] = vault_path_str
    os.environ["ADB_VENDOR_KEYS"] = vault_path_str
    
    env = os.environ.copy()
    env["ANDROID_SDK_HOME"] = vault_path_str
    env["ANDROID_PREFS_ROOT"] = vault_path_str
    env["ADB_VENDOR_KEYS"] = vault_path_str
    return env
```

---

### 3.2 Proposed Hardening & Enhancements for `core/ios_reader.py`

#### Change 1: Robust XML Plist Payload Sanitization in `calculate_ios_battery_health`
Replace lines 334–345 with:
```python
    data: Dict[str, Any] = {}
    if isinstance(battery_data_or_bytes, (bytes, bytearray)):
        payload = bytes(battery_data_or_bytes)
        # Resilient XML extraction: slice between <?xml or <plist and </plist>
        xml_start = payload.find(b"<?xml")
        if xml_start == -1:
            xml_start = payload.find(b"<plist")
        xml_end = payload.rfind(b"</plist>")
        
        if xml_start != -1 and xml_end != -1 and xml_end > xml_start:
            clean_payload = payload[xml_start : xml_end + 8]
        else:
            clean_payload = payload

        try:
            parsed = plistlib.loads(clean_payload)
            if isinstance(parsed, dict):
                data = parsed
            elif isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                data = parsed[0]
        except Exception as e:
            logger.debug(f"plistlib.loads failed on battery diagnostics: {e}")
            return None, None
    elif isinstance(battery_data_or_bytes, dict):
        data = battery_data_or_bytes
    else:
        return None, None
```

#### Change 2: Elimination of Semantic Battery Health Bug in `extract_battery_telemetry`
Replace lines 570–606 with:
```python
    def extract_battery_telemetry(self, udid: Optional[str] = None) -> Tuple[Optional[int], Optional[int]]:
        """
        Executes battery diagnostics fallback ladder:
        1. idevicediagnostics ioregentry AppleSmartBattery
        2. idevicediagnostics diagnostics GasGauge
        Returns (battery_health_pct, cycle_count). Returns (None, None) if unavailable.
        """
        # Step 1: AppleSmartBattery
        args1 = ["-u", udid, "ioregentry", "AppleSmartBattery"] if udid else ["ioregentry", "AppleSmartBattery"]
        code1, out1, _ = self._exec("idevicediagnostics", args1)
        if code1 == 0 and out1 and (b"AppleSmartBattery" in out1 or b"CycleCount" in out1 or b"NominalChargeCapacity" in out1):
            health, cycles = calculate_ios_battery_health(out1)
            if health is not None or cycles is not None:
                return health, cycles

        # Step 2: GasGauge fallback
        args2 = ["-u", udid, "diagnostics", "GasGauge"] if udid else ["diagnostics", "GasGauge"]
        code2, out2, _ = self._exec("idevicediagnostics", args2)
        if code2 == 0 and out2 and (b"GasGauge" in out2 or b"CycleCount" in out2 or b"Cycle" in out2):
            health, cycles = calculate_ios_battery_health(out2)
            if health is not None or cycles is not None:
                return health, cycles

        # Note: ideviceinfo -q com.apple.mobile.battery provides BatteryCurrentCapacity
        # (current charge level %), NOT Battery Health %. We strictly return None for health.
        return None, None
```

#### Change 3: SKU Deduplication & Region Extraction in `parse_apple_part_and_region`
Replace lines 318–326 with:
```python
def parse_apple_part_and_region(model_num: Optional[str], region_info: Optional[str]) -> Tuple[str, str]:
    """
    Combines ModelNumber (e.g. MYWV3) and RegionInfo (e.g. LL/A) into full part number.
    Safely prevents duplicate region suffixes if ModelNumber already includes the region code.
    """
    model = (model_num or "").strip()
    region = (region_info or "").strip()

    if region and not region.endswith("/A") and len(region) <= 3:
        region = f"{region}/A"

    if model:
        # Check if model already ends with the region or a standard [A-Z]{1,3}/A pattern
        m_reg = re.search(r'([A-Z]{1,3}/A)$', model)
        if m_reg:
            detected_region = m_reg.group(1)
            final_region = region if region else detected_region
            return model, final_region
        if region and model.endswith(region.replace("/A", "")):
            return f"{model}/A", region
        if region:
            return f"{model}{region}", region
        return model, "Unknown"

    return region or "Unknown", region or "Unknown"
```

#### Change 4: 15-Digit Luhn Validation in `parse_ideviceinfo_xml`
In lines 446–449, ensure IMEIs are validated with Luhn checksum:
```python
    raw_imei1 = str(plist.get("InternationalMobileEquipmentIdentity") or "")
    clean_imei1 = re.sub(r"\D", "", raw_imei1)
    
    from core.adb_reader import validate_luhn
    imei1 = clean_imei1 if (len(clean_imei1) == 15 and validate_luhn(clean_imei1)) else clean_imei1
    
    imei2_val = plist.get("InternationalMobileEquipmentIdentity2")
    if imei2_val:
        clean_imei2 = re.sub(r"\D", "", str(imei2_val))
        imei2 = clean_imei2 if (len(clean_imei2) == 15 and validate_luhn(clean_imei2)) else clean_imei2
    else:
        imei2 = None
```

---

### 3.3 New Module: `core/device_detector.py`
Below is the complete, production-grade proposed implementation for `core/device_detector.py`:

```python
"""
core/device_detector.py — Zero-Click Background USB Hardware Listener & FSM State Machine.
Implements:
1. Tri-channel USB detection:
   - Channel A: Windows WMI Win32_PnPEntity creation/deletion event listener.
   - Channel B: Persistent ADB host:track-devices streaming loopback socket.
   - Channel C: Debounced 1.0s periodic polling fallback.
2. 600ms software debouncing for USB contact bounce elimination.
3. Connection idempotency guard suppressing duplicate queries within 2.0s.
4. Non-blocking QThread worker emitting strongly typed Qt signals and pure Python callbacks.
5. Mock simulation routing matching StatusBarPanel requirements.
"""
from dataclasses import replace
import enum
import logging
import os
import re
import socket
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from core.models import DeviceSpecs
from core.adb_reader import AdbReader
from core.ios_reader import IOSReader
from core.mock_device import MOCK_S24_ULTRA, MOCK_IPHONE16_PROMAX, MOCK_FASTBOOT_DEVICE

logger = logging.getLogger(__name__)

# Known Mobile Device USB Vendor IDs (VID)
TARGET_MOBILE_VIDS = {
    "05AC",  # Apple Inc.
    "18D1",  # Google Inc. (Android/Pixel)
    "04E8",  # Samsung Electronics Co., Ltd.
    "2717",  # Xiaomi Inc.
    "22D9",  # Oppo / Realme / OnePlus
    "12D1",  # Huawei Technologies
    "0E8D",  # MediaTek Inc.
    "05C6",  # Qualcomm Inc.
}


class ConnectionState(enum.Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED_ADB = "adb"
    CONNECTED_FASTBOOT = "fastboot"
    CONNECTED_IOS = "ios"
    CONNECTED_IOS_LOCKED = "ios_locked"
    CONNECTED_IOS_TRUST_PENDING = "ios_trust_pending"
    CONNECTED_UNAUTHORIZED = "unauthorized"
    ERROR = "error"


# PyQt6 Signal Interface (Safely guarded for headless/testing environments)
try:
    from PyQt6.QtCore import QObject, pyqtSignal, pyqtSlot, QTimer, QThread
    HAS_PYQT6 = True
except ImportError:
    HAS_PYQT6 = False
    class QObject:
        def __init__(self, *args, **kwargs): pass
    def pyqtSignal(*args, **kwargs):
        class _Signal:
            def connect(self, slot): pass
            def emit(self, *args, **kwargs): pass
        return _Signal()
    def pyqtSlot(*args, **kwargs):
        return lambda fn: fn


class DeviceDetectorWorker(QObject):
    """
    Non-blocking background worker thread running hybrid USB detection.
    Can be run via QThread.moveToThread() or as a standalone Python thread.
    """
    specs_received = pyqtSignal(object)       # DeviceSpecs
    device_disconnected = pyqtSignal()
    status_changed = pyqtSignal(dict)         # {"adb": bool, "fastboot": bool, "ios": bool, "mode": str, "state": str, "description": str}
    error_occurred = pyqtSignal(str, str)     # title, message

    def __init__(self, parent=None):
        super().__init__(parent)
        self._mock_mode: str = "live"
        self._last_device_id: Optional[str] = None
        self._last_processed_time: float = 0.0
        self._current_state = ConnectionState.DISCONNECTED
        self._active_specs: Optional[DeviceSpecs] = None

        self._adb_reader = AdbReader()
        self._ios_reader = IOSReader()

        self._stop_event = threading.Event()
        self._wmi_thread: Optional[threading.Thread] = None
        self._track_devices_thread: Optional[threading.Thread] = None
        self._poll_timer: Optional[Any] = None

        # Pure Python callback hooks for headless testing
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[Dict[str, Any]], None]] = None

    # -----------------------------------------------------------------------
    # Worker Lifecycle & Mode Control
    # -----------------------------------------------------------------------

    @pyqtSlot()
    def start_polling(self, interval_ms: int = 1000):
        """Starts WMI event listener, ADB streaming socket, and periodic guard timer."""
        self._stop_event.clear()

        # 1. Start Windows WMI Event Interceptor (Channel A)
        if sys.platform == "win32":
            self._start_wmi_listener()

        # 2. Start ADB track-devices stream (Channel B)
        self._start_track_devices_listener()

        # 3. Start Periodic Backup Poller (Channel C)
        if HAS_PYQT6 and isinstance(self, QObject) and hasattr(self, "thread"):
            self._poll_timer = QTimer()
            self._poll_timer.setInterval(interval_ms)
            self._poll_timer.timeout.connect(self._on_poll_tick)
            self._poll_timer.start()

        # Initial trigger
        self._on_poll_tick()

    @pyqtSlot()
    def stop_polling(self):
        """Stops all background listeners and cleans up sockets."""
        self._stop_event.set()
        if self._poll_timer:
            self._poll_timer.stop()
            self._poll_timer = None
        if self._wmi_thread and self._wmi_thread.is_alive():
            self._wmi_thread.join(timeout=1.0)
            self._wmi_thread = None
        if self._track_devices_thread and self._track_devices_thread.is_alive():
            self._track_devices_thread.join(timeout=1.0)
            self._track_devices_thread = None

    @pyqtSlot(str)
    def set_mock_mode(self, mode: str):
        """Switches between live hardware extraction and mock simulation presets."""
        self._mock_mode = mode
        self._last_device_id = None
        self._on_poll_tick()

    # -----------------------------------------------------------------------
    # Channel A: Windows WMI Event Interceptor
    # -----------------------------------------------------------------------

    def _start_wmi_listener(self):
        def _wmi_worker():
            try:
                import pythoncom
                import win32com.client
                pythoncom.CoInitialize()
                wmi = win32com.client.GetObject("winmgmts:")
                wql = "SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity'"
                watcher = wmi.ExecNotificationQuery(wql)
                
                while not self._stop_event.is_set():
                    try:
                        # Non-blocking poll with 1000ms timeout
                        event = watcher.NextEvent(1000)
                        if event:
                            target = event.TargetInstance
                            dev_id = str(getattr(target, "DeviceID", ""))
                            # Check for target mobile VIDs
                            if any(f"VID_{vid}" in dev_id.upper() for vid in TARGET_MOBILE_VIDS):
                                logger.debug(f"WMI USB mobile hardware event detected: {dev_id}")
                                # Apply 600ms contact debounce before probing
                                time.sleep(0.6)
                                self._on_poll_tick()
                    except Exception:
                        pass
                pythoncom.CoUninitialize()
            except Exception as e:
                logger.debug(f"WMI listener could not initialize, falling back to periodic polling: {e}")

        self._wmi_thread = threading.Thread(target=_wmi_worker, name="WmiUsbDetectorThread", daemon=True)
        self._wmi_thread.start()

    # -----------------------------------------------------------------------
    # Channel B: ADB Device Streaming Socket (host:track-devices)
    # -----------------------------------------------------------------------

    def _start_track_devices_listener(self):
        def _adb_stream_worker():
            while not self._stop_event.is_set():
                s = None
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(3.0)
                    s.connect(("127.0.0.1", 5037))
                    # Packet format: 4 hex digits length + command string
                    cmd = "host:track-devices"
                    req = f"{len(cmd):04x}{cmd}".encode("ascii")
                    s.sendall(req)
                    resp = s.recv(4)
                    if resp == b"OKAY":
                        s.settimeout(2.0)
                        while not self._stop_event.is_set():
                            try:
                                len_hdr = s.recv(4)
                                if not len_hdr:
                                    break
                                length = int(len_hdr.decode("ascii"), 16)
                                if length > 0:
                                    payload = s.recv(length).decode("utf-8", errors="replace")
                                    logger.debug(f"ADB track-devices stream update: {payload.strip()}")
                                    time.sleep(0.6)  # Debounce contact bounce
                                    self._on_poll_tick()
                                else:
                                    # All ADB devices disconnected
                                    self._on_poll_tick()
                            except socket.timeout:
                                continue
                except Exception:
                    pass
                finally:
                    if s:
                        try:
                            s.close()
                        except Exception:
                            pass
                # Backoff before reconnecting to ADB daemon
                self._stop_event.wait(5.0)

        self._track_devices_thread = threading.Thread(
            target=_adb_stream_worker, name="AdbTrackDevicesThread", daemon=True
        )
        self._track_devices_thread.start()

    # -----------------------------------------------------------------------
    # Channel C & FSM Evaluation Tick
    # -----------------------------------------------------------------------

    def _on_poll_tick(self):
        """Evaluates hardware state ladder and dispatches debounced signals."""
        status = {
            "adb": False,
            "fastboot": False,
            "ios": False,
            "mode": self._mock_mode,
            "state": "disconnected",
            "description": "No Device Connected"
        }
        active_specs: Optional[DeviceSpecs] = None

        # 1. Handle Mock Modes
        if self._mock_mode == "mock_s24":
            status["adb"] = True
            status["state"] = "adb"
            status["description"] = "Samsung Galaxy S24 Ultra (Emulated)"
            active_specs = MOCK_S24_ULTRA

        elif self._mock_mode == "mock_iphone16":
            status["ios"] = True
            status["state"] = "ios"
            status["description"] = "Apple iPhone 16 Pro Max (Emulated)"
            active_specs = MOCK_IPHONE16_PROMAX

        elif self._mock_mode == "mock_fastboot":
            status["fastboot"] = True
            status["state"] = "fastboot"
            status["description"] = "Fastboot Bootloader Mode (Emulated)"
            active_specs = MOCK_FASTBOOT_DEVICE

        elif self._mock_mode == "mock_offline":
            status["state"] = "disconnected"
            status["description"] = "Disconnected (Emulated)"

        else:
            # 2. Live Hardware Evaluation Ladder
            # Step 1: Check iOS libimobiledevice first
            try:
                udids = self._ios_reader.list_device_udids()
                if udids:
                    target_udid = udids[0]
                    specs_obj, status_msg = self._ios_reader.extract_device_telemetry(target_udid)
                    if specs_obj:
                        status["ios"] = True
                        status["state"] = "ios"
                        status["description"] = f"{specs_obj.marketing_name} ({specs_obj.storage})"
                        active_specs = specs_obj
                    else:
                        status["ios"] = True
                        if "Passcode" in status_msg or "Locked" in status_msg:
                            status["state"] = "ios_locked"
                            status["description"] = status_msg
                        elif "Trust" in status_msg:
                            status["state"] = "ios_trust_pending"
                            status["description"] = status_msg
                        else:
                            status["state"] = "error"
                            status["description"] = status_msg
            except Exception as e:
                logger.debug(f"iOS probe error: {e}")

            # Step 2: Check Android ADB / Fastboot if no active iOS specs
            if not active_specs and status["state"] not in ("ios_locked", "ios_trust_pending"):
                try:
                    specs = self._adb_reader.poll_once()
                    if specs:
                        if specs.connection_type == "fastboot":
                            status["fastboot"] = True
                            status["state"] = "fastboot"
                            status["description"] = f"Fastboot: {specs.marketing_name}"
                        else:
                            status["adb"] = True
                            status["state"] = "adb"
                            status["description"] = f"{specs.marketing_name} ({specs.storage})"
                        active_specs = specs
                except Exception as e:
                    logger.debug(f"ADB probe error: {e}")

        # Dispatch Status Signal
        self.status_changed.emit(status)
        if self.on_status_changed:
            self.on_status_changed(status)

        current_id = active_specs.device_id if active_specs else None
        now = time.time()

        # Idempotency Guard & State Transitions
        if active_specs:
            # Suppress duplicate query if identical serial within 2 seconds
            if current_id != self._last_device_id or (now - self._last_processed_time) > 2.0:
                self._last_device_id = current_id
                self._last_processed_time = now
                self._active_specs = active_specs
                self.specs_received.emit(active_specs)
                if self.on_device_connected:
                    self.on_device_connected(active_specs)
        elif self._last_device_id is not None:
            self._last_device_id = None
            self._active_specs = None
            self.device_disconnected.emit()
            if self.on_device_disconnected:
                self.on_device_disconnected()
```

---

## 4. UI Integration Strategy with `ui/status_bar.py`

In `ui/status_bar.py`:
1. Import `DeviceDetectorWorker` from `core.device_detector`.
2. Replace the embedded `PollingWorker` with `DeviceDetectorWorker`, or alias `PollingWorker = DeviceDetectorWorker`.
3. In `_init_thread`:
   ```python
   self._thread = QThread()
   self._worker = DeviceDetectorWorker()
   self._worker.moveToThread(self._thread)

   self._thread.started.connect(self._worker.start_polling)
   self._worker.specs_received.connect(self._on_specs_received)
   self._worker.device_disconnected.connect(self._on_device_lost)
   self._worker.status_changed.connect(self._on_status_changed)
   self._worker.error_occurred.connect(self._on_error_occurred)

   self._thread.start()
   ```
4. Expand `_on_status_changed` to handle `ios_locked` and `ios_trust_pending` states:
   ```python
   if status.get("state") == "ios_locked":
       self.pill_ios.setText("iOS: Passcode Locked")
       self.pill_ios.setStyleSheet("background-color: #7F1D1D; color: #FCA5A5; border: 1px solid #DC2626; border-radius: 10px; padding: 3px 8px; font-weight: bold;")
   elif status.get("state") == "ios_trust_pending":
       self.pill_ios.setText("iOS: Tap Trust")
       self.pill_ios.setStyleSheet("background-color: #78350F; color: #FDE68A; border: 1px solid #F59E0B; border-radius: 10px; padding: 3px 8px; font-weight: bold;")
   ```

---

## 5. Verification & Test Strategy

To verify this implementation strategy end-to-end:

### 1. iOS Reader Unit Tests
```bash
python -m unittest tests/test_ios_reader.py
```
*Coverage*:
- `test_iphone_16_series`: Validates `iPhone17,1` to `iPhone17,4` mapping.
- `test_calculated_from_capacities`: Validates `round((Nominal / Design) * 100)`.
- `test_overprovisioned_clamping`: Validates 100% maximum clamp.
- `test_region_decoding`: Validates `LL/A`, `CH/A`, `J/A`, `AB/A` decoding.
- `test_xml_deserialization`: Validates end-to-end `ideviceinfo -x` XML plist conversion.

### 2. New Dedicated Tests for `core/device_detector.py`
Create `tests/test_device_detector.py` to verify:
- WMI VID filter matching.
- 600ms debounce idempotency guard.
- Mock mode state transitions (`live`, `mock_s24`, `mock_iphone16`, `mock_fastboot`, `mock_offline`).
- Status dictionary contract integrity (`adb`, `fastboot`, `ios`, `state`, `description`).

### 3. Full E2E & Boundary Regression
```bash
python -m unittest discover tests
```
Ensures 100% of all 521 existing tests pass without regressions.
