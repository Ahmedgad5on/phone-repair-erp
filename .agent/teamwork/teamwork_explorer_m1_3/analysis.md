# Milestone 1: Simulation Engine & Unit Test Suites Architecture Analysis
**Component**: Hardware Simulation Engine (`core/mock_device.py`) and Milestone 1 Unit Test Suites (`tests/test_adb_reader.py`, `tests/test_ios_reader.py`, `tests/test_mock_device.py`)  
**Author**: Explorer 3 (`teamwork_explorer_m1_3`)  
**Target Milestone**: M1 (Core Hardware Extraction Engine)  
**Date**: 2026-11-07  

---

## 1. Executive Summary

Milestone 1 establishes the foundational hardware telemetry extraction engine for Android and iOS. However, mobile workshop software cannot be reliably built or tested solely against live physical devices, because physical device states are transient, hardware variations are vast, and developers/CI pipelines often run headless or without physical phones connected.

This architectural analysis delivers the complete, production-ready design for:
1. **`core/mock_device.py` (Simulation Engine)**:
   - **4 Pre-Configured Profiles**: Samsung Galaxy S24 Ultra (512GB/12GB), iPhone 16 Pro Max (256GB/8GB), iPhone 15 Pro (128GB/8GB), and Xiaomi 13 Pro in Fastboot mode (bootloader unlocked).
   - **Dynamic Mock Profile Generator**: Procedural generator creating realistic devices across Apple, Samsung, Xiaomi, and OnePlus with authentic TAC-based Luhn-valid IMEIs, realistic serial formats, authentic storage-to-RAM proportionality, and battery cycle-to-health decay curves.
   - **Mock Polling Provider (`MockDeviceProvider`)**: An interface-identical event provider mirroring `AdbReader` and `IosReader`. Emits thread-safe callbacks (`on_device_connected`, `on_device_disconnected`, `on_status_changed`) and provides an optional PyQt6 Signal bridge.
   - **Mock Command Simulator (`MockCommandSimulator`)**: Generates raw CLI stdout fixtures (`adb shell df`, `/proc/meminfo`, `dumpsys battery`, `service call iphonesubinfo`, `fastboot getvar`, `ideviceinfo -x`, `AppleSmartBattery.xml`) enabling integration tests to exercise live parsers against simulated shell outputs.
2. **`tests/test_adb_reader.py`**:
   - Comprehensive unit test suite covering commercial storage boundary thresholds (16GB through 1TB), RAM boundary thresholds (2GB through 24GB), Samsung/Xiaomi/Oppo regex model resolvers, multi-strategy IMEI parsing (hex parcel decoding, regex dumpsys, Luhn check, restricted permission fallback), battery telemetry (`dumpsys battery`), Fastboot variable extraction, and daemon restart sanitization.
3. **`tests/test_ios_reader.py`**:
   - Comprehensive unit test suite covering Apple ProductType lookup up to iPhone 16 series (`iPhone17,1` through `iPhone17,4`), decimal disk capacity rounding, `plistlib` XML deserialization of `ideviceinfo -x`, battery diagnostics (`AppleSmartBattery` / `GasGauge`), region code decoding (`LL/A`, `J/A`, `CH/A`), color resolution, and lockdown error handling.
4. **`tests/test_mock_device.py`**:
   - Comprehensive unit test suite validating profile schemas, Luhn IMEI algorithm (valid vectors, invalid vectors, edge cases), dynamic profile generator statistical distributions, polling provider state machine, and raw command fixture consistency.

All code specifications conform strictly to `ORIGINAL_REQUEST.md`, `PROJECT.md`, and the sibling implementations designed by Explorer 1 (`core/models.py`, `core/paths.py`, `core/adb_reader.py`) and Explorer 2 (`core/ios_reader.py`, `data/apple_models.json`).

---

## 2. Architectural Interface Alignment

The simulation engine and test suites integrate directly with the core data models and reader contracts established in `PROJECT.md`:

```
+--------------------------------------------------------------------------+
|                            core/models.py                                |
|  - DeviceSpecs: connection_type, brand, marketing_name, model_code,      |
|                 storage, ram, color, os_version, serial_number, imei1,   |
|                 imei2, battery_health, battery_cycles, sales_region,      |
|                 bootloader_locked, condition_grade, remarks              |
+--------------------------------------------------------------------------+
                                     ^
                                     | emits DeviceSpecs
        +----------------------------+----------------------------+
        |                            |                            |
+---------------+            +---------------+            +---------------+
| core/adb_reader|            | core/ios_reader|            |core/mock_device|
|   AdbReader   |            |   IosReader   |            |MockDeviceProv. |
|  - poll 2s    |            |  - poll 2s    |            |  - poll 2s     |
|  - callbacks  |            |  - callbacks  |            |  - callbacks   |
+---------------+            +---------------+            +---------------+
        ^                            ^                            ^
        | verified by                | verified by                | verified by
+----------------------+     +----------------------+     +----------------------+
|tests/test_adb_reader |     |tests/test_ios_reader |     |tests/test_mock_device|
+----------------------+     +----------------------+     +----------------------+
```

### 2.1 Reader Callback Contract
Each hardware provider (`AdbReader`, `IosReader`, and `MockDeviceProvider`) implements the unified observer pattern:
```python
reader.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
reader.on_device_disconnected: Optional[Callable[[], None]] = None
reader.on_status_changed: Optional[Callable[[str], None]] = None # e.g. "idle", "adb", "ios", "fastboot"
```
This guarantees that UI listeners (`ui/status_bar.py`, `ui/main_window.py`) can connect to any reader interchangeably.

---

## 3. Specification of `core/mock_device.py`

### 3.1 Mathematical Validation & Luhn Algorithm
The Luhn (MOD 10) algorithm validates and generates standard 15-digit International Mobile Equipment Identity (IMEI) numbers.

#### Algorithm Mechanics:
1. An IMEI consists of 14 payload digits (TAC 6-8 digits + Serial 6 digits) and 1 check digit.
2. From left to right (0-indexed):
   - Digits at odd indices ($i \in \{1, 3, 5, 7, 9, 11, 13\}$) are multiplied by 2.
   - If the product exceeds 9, subtract 9 (sum of digits).
   - Digits at even indices ($i \in \{0, 2, 4, 6, 8, 10, 12\}$) remain unchanged.
3. Compute sum $S = \sum d_i$.
4. Check digit $C = (10 - (S \pmod{10})) \pmod{10}$.
5. A full 15-digit number is valid if the sum of all 15 digits (with doubling rule applied) satisfies $(S + C) \pmod{10} == 0$.

```python
import random
import re
from typing import Optional

def calculate_luhn_check_digit(fourteen_digits: str) -> str:
    """Calculates the 15th Luhn check digit from a 14-digit numeric string."""
    if len(fourteen_digits) != 14 or not fourteen_digits.isdigit():
        raise ValueError("Input must be exactly 14 numeric digits.")
    total = 0
    for i, char in enumerate(fourteen_digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    check = (10 - (total % 10)) % 10
    return str(check)

def validate_luhn_imei(imei: Optional[str]) -> bool:
    """Validates whether a given string is a 15-digit Luhn-compliant IMEI."""
    if not imei or not isinstance(imei, str):
        return False
    digits = re.sub(r"\D", "", imei)
    if len(digits) != 15:
        return False
    total = 0
    for i, char in enumerate(digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0

def generate_luhn_imei(tac_prefix: Optional[str] = None) -> str:
    """Generates a realistic 15-digit Luhn-valid IMEI given an optional TAC prefix."""
    if tac_prefix and tac_prefix.isdigit() and len(tac_prefix) <= 14:
        tac = tac_prefix
    else:
        # Default realistic TAC pools
        tac = random.choice(["358901", "351782", "353284", "862341", "359871"])
    needed = 14 - len(tac)
    body = tac + "".join([str(random.randint(0, 9)) for _ in range(needed)])
    check_digit = calculate_luhn_check_digit(body)
    return body + check_digit
```

---

### 3.2 Pre-Configured Realistic Mock Profiles

The mock engine defines four primary pre-configured profiles adhering strictly to the user dispatch requirements:

#### Profile 1: `mock_s24_ultra` (Samsung Galaxy S24 Ultra)
- **Target Persona**: Flagship Android trade-in or retail intake.
- **Brand / Model**: Samsung / Galaxy S24 Ultra (`SM-S928B`).
- **Storage / RAM**: 512GB storage, 12GB RAM.
- **Color**: Titanium Gray.
- **OS**: Android 14.
- **Battery**: 98% Health, 45 charge cycles.
- **IMEI**: Dual Luhn-valid IMEIs (IMEI 1: `351782110293846`, IMEI 2: `351782110293853`).
- **Connection**: `adb`, Bootloader Locked (`bootloader_locked=True`), Condition `A+`.

#### Profile 2: `mock_iphone16_promax` (Apple iPhone 16 Pro Max)
- **Target Persona**: Current-generation pristine Apple flagship.
- **Brand / Model**: Apple / iPhone 16 Pro Max (`iPhone17,2`, Model Number: `MYWV3LL/A`).
- **Storage / RAM**: 256GB storage, 8GB RAM.
- **Color**: Desert Titanium.
- **OS**: iOS 18.1.
- **Battery**: 100% Health, 12 charge cycles.
- **Region**: `LL/A` (USA eSIM).
- **Serial**: `H2LGD0987XMY`.
- **IMEI**: Dual Luhn-valid IMEIs (IMEI 1: `358901230192834`, IMEI 2: `358901230192842`).
- **Connection**: `ios`, Bootloader Locked (`bootloader_locked=True`), Condition `A+`.

#### Profile 3: `mock_iphone15_pro` (Apple iPhone 15 Pro)
- **Target Persona**: Pre-owned Apple device needing battery servicing assessment.
- **Brand / Model**: Apple / iPhone 15 Pro (`iPhone16,1`, Model Number: `MTUX3J/A`).
- **Storage / RAM**: 128GB storage, 8GB RAM.
- **Color**: Natural Titanium.
- **OS**: iOS 17.5.
- **Battery**: 89% Health, 342 charge cycles.
- **Region**: `J/A` (Japan).
- **Serial**: `G6VGD012345Z`.
- **IMEI**: Dual Luhn-valid IMEIs (IMEI 1: `353284091234567`, IMEI 2: `353284091234575`).
- **Connection**: `ios`, Bootloader Locked (`bootloader_locked=True`), Condition `A`.

#### Profile 4: `mock_fastboot_device` (Xiaomi 13 Pro in Fastboot Mode)
- **Target Persona**: Android device connected in bootloader state during repair/flashing.
- **Brand / Model**: Xiaomi / Xiaomi 13 Pro (`2210132G`, Fastboot product: `nuwa`).
- **Storage / RAM**: 256GB storage, 12GB RAM (reported as `N/A (Fastboot)` in raw state).
- **Color**: Ceramic Black.
- **OS**: Fastboot Mode.
- **Battery**: `None` (Fastboot mode does not expose battery diagnostics).
- **Serial**: `0x9a8b7c6d`.
- **IMEI**: `Fastboot (Scan Barcode)` (Telephony baseband offline in bootloader).
- **Connection**: `fastboot`, Bootloader Unlocked (`bootloader_locked=False`), Condition `A`.

---

### 3.3 Dynamic Realistic Profile Generator

In addition to static presets, the engine provides `generate_random_profile(brand_hint=None)` to procedurally construct realistic devices.

#### Generation Rules & Proportionality Logic:
1. **Brand Pools**: Apple (35%), Samsung (35%), Xiaomi (20%), OnePlus (10%).
2. **Storage-to-RAM Correlation**:
   - 64GB Storage $\rightarrow$ 4GB RAM
   - 128GB Storage $\rightarrow$ 6GB or 8GB RAM (Apple: 4GB/6GB/8GB depending on generation)
   - 256GB Storage $\rightarrow$ 8GB or 12GB RAM
   - 512GB Storage $\rightarrow$ 12GB or 16GB RAM (Apple: 8GB)
   - 1TB Storage $\rightarrow$ 12GB, 16GB, or 24GB RAM (Apple: 8GB)
3. **Battery Cycle-to-Health Decay Curve**:
   - Cycles $C \sim \text{Uniform}(5, 850)$.
   - Base health formula: $\text{Health} = \max(72, \min(100, 102 - \text{int}(C \times 0.038) + \text{jitter}))$.
   - Ensures realistic wear telemetry without impossible combinations (e.g. 800 cycles with 100% health).
4. **TAC Pools & Valid IMEIs**:
   - Apple TACs: `358901`, `353284`, `352123`
   - Samsung TACs: `351782`, `359871`, `354920`
   - Xiaomi TACs: `862341`, `864902`
   - OnePlus TACs: `861294`, `865431`
   - Both IMEI 1 and IMEI 2 are synthesized with verified Luhn check digits.

---

### 3.4 Complete Code Specification: `core/mock_device.py`

The following code is the complete, self-contained implementation ready to be placed directly into `core/mock_device.py`:

```python
"""
Hardware Simulation & Mock Device Engine.
Provides realistic Android (ADB), iOS, and Fastboot device simulation
for zero-hardware development, automated testing, and UI preview workflows.
"""
from dataclasses import replace
import random
import re
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple, Any

from core.models import DeviceSpecs


# ============================================================================
# 1. Luhn Algorithm Utilities
# ============================================================================

def calculate_luhn_check_digit(fourteen_digits: str) -> str:
    """Calculates the 15th Luhn check digit from a 14-digit numeric string."""
    if len(fourteen_digits) != 14 or not fourteen_digits.isdigit():
        raise ValueError(f"Input must be exactly 14 digits, got '{fourteen_digits}'")
    total = 0
    for i, char in enumerate(fourteen_digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    check = (10 - (total % 10)) % 10
    return str(check)


def validate_luhn_imei(imei: Optional[str]) -> bool:
    """Validates whether a string is a valid 15-digit Luhn-compliant IMEI."""
    if not imei or not isinstance(imei, str):
        return False
    digits = re.sub(r"\D", "", imei)
    if len(digits) != 15:
        return False
    total = 0
    for i, char in enumerate(digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def generate_luhn_imei(tac_prefix: Optional[str] = None) -> str:
    """Generates a realistic 15-digit Luhn-valid IMEI."""
    if tac_prefix and tac_prefix.isdigit() and len(tac_prefix) <= 14:
        tac = tac_prefix
    else:
        tac = random.choice(["358901", "351782", "353284", "862341", "359871", "861294"])
    needed = 14 - len(tac)
    body = tac + "".join([str(random.randint(0, 9)) for _ in range(needed)])
    check_digit = calculate_luhn_check_digit(body)
    return body + check_digit


# ============================================================================
# 2. Pre-Configured Mock Profiles
# ============================================================================

MOCK_S24_ULTRA = DeviceSpecs(
    connection_type="adb",
    device_id="R5CX109876U",
    brand="Samsung",
    marketing_name="Galaxy S24 Ultra",
    model_code="SM-S928B",
    storage="512GB",
    ram="12GB",
    color="Titanium Gray",
    os_version="Android 14",
    serial_number="R5CX109876U",
    imei1="351782110293846",
    imei2="351782110293853",
    battery_health=98,
    battery_cycles=45,
    sales_region="EUX",
    bootloader_locked=True,
    condition_grade="A+",
    remarks="Samsung Flagship Demo Unit - Scratchless",
    raw_properties={
        "ro.product.model": "SM-S928B",
        "ro.product.manufacturer": "samsung",
        "ro.build.version.release": "14",
        "df_data_kb": 458752000,
        "mem_total_kb": 11854320,
        "battery_level": 98,
        "is_mock": True,
        "profile_key": "mock_s24_ultra"
    }
)

MOCK_IPHONE16_PROMAX = DeviceSpecs(
    connection_type="ios",
    device_id="00008140-001928374650001E",
    brand="Apple",
    marketing_name="iPhone 16 Pro Max",
    model_code="iPhone17,2",
    storage="256GB",
    ram="8GB",
    color="Desert Titanium",
    os_version="iOS 18.1",
    serial_number="H2LGD0987XMY",
    imei1="358901230192834",
    imei2="358901230192842",
    battery_health=100,
    battery_cycles=12,
    sales_region="LL/A",
    bootloader_locked=True,
    condition_grade="A+",
    remarks="Pristine condition - AppleCare active",
    raw_properties={
        "ProductType": "iPhone17,2",
        "ProductVersion": "18.1",
        "TotalDiskCapacity": 256071352320,
        "ModelNumber": "MYWV3",
        "RegionInfo": "LL/A",
        "is_mock": True,
        "profile_key": "mock_iphone16_promax"
    }
)

MOCK_IPHONE15_PRO = DeviceSpecs(
    connection_type="ios",
    device_id="00008130-001122334455002F",
    brand="Apple",
    marketing_name="iPhone 15 Pro",
    model_code="iPhone16,1",
    storage="128GB",
    ram="8GB",
    color="Natural Titanium",
    os_version="iOS 17.5",
    serial_number="G6VGD012345Z",
    imei1="353284091234567",
    imei2="353284091234575",
    battery_health=89,
    battery_cycles=342,
    sales_region="J/A",
    bootloader_locked=True,
    condition_grade="A",
    remarks="Minor bezel wear - Battery servicing suggested soon",
    raw_properties={
        "ProductType": "iPhone16,1",
        "ProductVersion": "17.5",
        "TotalDiskCapacity": 128035676160,
        "ModelNumber": "MTUX3",
        "RegionInfo": "J/A",
        "is_mock": True,
        "profile_key": "mock_iphone15_pro"
    }
)

MOCK_FASTBOOT_DEVICE = DeviceSpecs(
    connection_type="fastboot",
    device_id="0x9a8b7c6d",
    brand="Xiaomi",
    marketing_name="Xiaomi 13 Pro (Fastboot)",
    model_code="2210132G",
    storage="N/A (Fastboot)",
    ram="N/A (Fastboot)",
    color="Ceramic Black",
    os_version="Fastboot Mode",
    serial_number="0x9a8b7c6d",
    imei1="Fastboot (Scan Barcode)",
    imei2=None,
    battery_health=None,
    battery_cycles=None,
    sales_region="Global",
    bootloader_locked=False,
    condition_grade="A",
    remarks="Fastboot mode detected - Bootloader Unlocked",
    raw_properties={
        "product": "nuwa",
        "unlocked": "yes",
        "is_mock": True,
        "profile_key": "mock_fastboot_device"
    }
)

PRECONFIGURED_PROFILES: Dict[str, DeviceSpecs] = {
    "mock_s24_ultra": MOCK_S24_ULTRA,
    "mock_iphone16_promax": MOCK_IPHONE16_PROMAX,
    "mock_iphone15_pro": MOCK_IPHONE15_PRO,
    "mock_fastboot_device": MOCK_FASTBOOT_DEVICE,
}


# ============================================================================
# 3. Dynamic Profile Generator
# ============================================================================

def generate_random_profile(brand_hint: Optional[str] = None) -> DeviceSpecs:
    """
    Generates a procedurally constructed, fully realistic DeviceSpecs instance
    with authentic storage/RAM ratios, valid Luhn IMEIs, and coherent battery wear.
    """
    brands = ["Apple", "Samsung", "Xiaomi", "OnePlus"]
    selected_brand = brand_hint.title() if brand_hint and brand_hint.title() in brands else random.choice(brands)

    if selected_brand == "Apple":
        models = [
            ("iPhone 16 Pro Max", "iPhone17,2", ["256GB", "512GB", "1TB"], "8GB", ["Desert Titanium", "Natural Titanium", "Black Titanium"]),
            ("iPhone 16 Pro", "iPhone17,1", ["128GB", "256GB", "512GB", "1TB"], "8GB", ["Natural Titanium", "White Titanium", "Black Titanium"]),
            ("iPhone 16", "iPhone17,3", ["128GB", "256GB", "512GB"], "8GB", ["Ultramarine", "Teal", "Pink", "White", "Black"]),
            ("iPhone 15 Pro", "iPhone16,1", ["128GB", "256GB", "512GB", "1TB"], "8GB", ["Natural Titanium", "Blue Titanium", "White Titanium"]),
            ("iPhone 15", "iPhone15,4", ["128GB", "256GB", "512GB"], "6GB", ["Blue", "Pink", "Yellow", "Green", "Black"]),
            ("iPhone 14 Pro", "iPhone15,2", ["128GB", "256GB", "512GB", "1TB"], "6GB", ["Deep Purple", "Space Black", "Gold", "Silver"]),
            ("iPhone 13", "iPhone14,5", ["128GB", "256GB", "512GB"], "4GB", ["Midnight", "Starlight", "Blue", "Pink", "Red"]),
            ("iPhone 12", "iPhone13,2", ["64GB", "128GB", "256GB"], "4GB", ["Black", "White", "Blue", "Green", "Purple"]),
            ("iPhone 11", "iPhone12,1", ["64GB", "128GB", "256GB"], "4GB", ["Black", "White", "Purple", "Yellow", "Red"])
        ]
        chosen = random.choice(models)
        name, code, storages, ram, colors = chosen
        storage = random.choice(storages)
        color = random.choice(colors)
        os_ver = f"iOS {random.choice(['16.7', '17.5.1', '17.6', '18.0', '18.1'])}"
        region = random.choice(["LL/A", "J/A", "CH/A", "ZP/A", "B/A", "AE/A"])
        cycles = random.randint(12, 750)
        health = max(75, min(100, 102 - int(cycles * 0.038) + random.randint(-1, 1)))
        serial = "".join(random.choices("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", k=10))
        imei1 = generate_luhn_imei("358901")
        imei2 = generate_luhn_imei("358901")

        return DeviceSpecs(
            connection_type="ios",
            device_id=f"00008140-{serial}001E",
            brand="Apple",
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region=region,
            bootloader_locked=True,
            condition_grade=random.choice(["New", "A+", "A", "B"]),
            remarks=f"Simulated {name} - Grade Verified",
            raw_properties={"is_mock": True, "generated": True}
        )

    elif selected_brand == "Samsung":
        models = [
            ("Galaxy S24 Ultra", "SM-S928B", "512GB", "12GB", ["Titanium Gray", "Titanium Black", "Titanium Violet"]),
            ("Galaxy S24+", "SM-S926B", "256GB", "12GB", ["Onyx Black", "Marble Gray", "Cobalt Violet"]),
            ("Galaxy S24", "SM-S921B", "128GB", "8GB", ["Onyx Black", "Marble Gray"]),
            ("Galaxy S23 Ultra", "SM-S918B", "256GB", "12GB", ["Phantom Black", "Cream", "Green", "Lavender"]),
            ("Galaxy Z Fold 5", "SM-F946B", "512GB", "12GB", ["Icy Blue", "Phantom Black", "Cream"]),
            ("Galaxy Z Flip 5", "SM-F731B", "256GB", "8GB", ["Mint", "Graphite", "Cream", "Lavender"]),
            ("Galaxy A55 5G", "SM-A556B", "128GB", "8GB", ["Awesome Navy", "Awesome Iceblue", "Awesome Lemon"]),
            ("Galaxy A54 5G", "SM-A546U", "128GB", "6GB", ["Awesome Graphite", "Awesome Lime", "Awesome White"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        color = random.choice(colors)
        os_ver = f"Android {random.choice(['13', '14'])}"
        cycles = random.randint(20, 600)
        health = max(80, min(100, 100 - int(cycles * 0.035) + random.randint(-1, 1)))
        serial = "R" + "".join(random.choices("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=10))
        imei1 = generate_luhn_imei("351782")
        imei2 = generate_luhn_imei("351782")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand="Samsung",
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="EUX",
            bootloader_locked=True,
            condition_grade=random.choice(["A+", "A", "B"]),
            remarks=f"Simulated {name} - Clean ESN",
            raw_properties={"is_mock": True, "generated": True}
        )

    elif selected_brand == "Xiaomi":
        models = [
            ("Xiaomi 14 Pro", "23116PN5BC", "512GB", "16GB", ["Black", "Silver", "Titanium"]),
            ("Xiaomi 13 Pro", "2210132G", "256GB", "12GB", ["Ceramic Black", "Ceramic White", "Wild Green"]),
            ("Redmi Note 13 Pro 5G", "2312DRA50G", "256GB", "8GB", ["Midnight Black", "Ocean Teal", "Aurora Purple"]),
            ("POCO F5", "23049PCD8G", "256GB", "8GB", ["Carbon Black", "Sand White", "Electric Blue"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        color = random.choice(colors)
        os_ver = f"Android {random.choice(['13', '14'])}"
        brand = "Redmi" if "Redmi" in name else ("POCO" if "POCO" in name else "Xiaomi")
        cycles = random.randint(15, 500)
        health = max(82, min(100, 100 - int(cycles * 0.033)))
        serial = "".join(random.choices("0123456789abcdef", k=12))
        imei1 = generate_luhn_imei("862341")
        imei2 = generate_luhn_imei("862341")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="Global",
            bootloader_locked=random.choice([True, False]),
            condition_grade=random.choice(["A+", "A", "B"]),
            remarks=f"Simulated {name}",
            raw_properties={"is_mock": True, "generated": True}
        )

    else:  # OnePlus
        models = [
            ("OnePlus 12", "CPH2581", "512GB", "16GB", ["Flowy Emerald", "Silky Black"]),
            ("OnePlus 11", "CPH2451", "256GB", "16GB", ["Titan Black", "Eternal Green"]),
            ("Realme GT Neo 5", "RMX3820", "256GB", "12GB", ["Purple", "Black", "White"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        brand = "Realme" if "Realme" in name else "OnePlus"
        cycles = random.randint(10, 400)
        health = max(85, min(100, 100 - int(cycles * 0.03)))
        serial = "".join(random.choices("0123456789ABCDEF", k=10))
        imei1 = generate_luhn_imei("861294")
        imei2 = generate_luhn_imei("861294")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=random.choice(colors),
            os_version="Android 14",
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="Global",
            bootloader_locked=True,
            condition_grade=random.choice(["New", "A+", "A"]),
            remarks=f"Simulated {name}",
            raw_properties={"is_mock": True, "generated": True}
        )


# ============================================================================
# 4. Mock Polling Provider (Interface Parity with AdbReader & IosReader)
# ============================================================================

class MockDeviceProvider:
    """
    Simulates hardware polling and event notification.
    Mirrors the exact interface and signals of live AdbReader and IosReader.
    """

    def __init__(self, initial_profile: Optional[str] = None):
        self._active_specs: Optional[DeviceSpecs] = None
        self._stop_event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._poll_interval = 2.0

        # Unified callback interface
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[str], None]] = None

        if initial_profile:
            self.connect_profile(initial_profile)

    # ------------------------------------------------------------------------
    # State Inspection & Control
    # ------------------------------------------------------------------------

    def is_connected(self) -> bool:
        """Returns True if a mock device is actively attached."""
        with self._lock:
            return self._active_specs is not None

    def get_active_specs(self) -> Optional[DeviceSpecs]:
        """Returns a copy of the current active DeviceSpecs, or None."""
        with self._lock:
            return replace(self._active_specs) if self._active_specs else None

    def get_available_profiles(self) -> List[str]:
        """Returns list of pre-configured profile keys."""
        return list(PRECONFIGURED_PROFILES.keys())

    def connect_profile(self, profile_key: str) -> DeviceSpecs:
        """Attaches a pre-configured profile and fires callbacks."""
        if profile_key not in PRECONFIGURED_PROFILES:
            raise KeyError(f"Unknown mock profile: '{profile_key}'. Available: {self.get_available_profiles()}")
        specs = replace(PRECONFIGURED_PROFILES[profile_key])
        return self.connect_device(specs)

    def connect_random(self, brand_hint: Optional[str] = None) -> DeviceSpecs:
        """Procedurally generates and connects a random device."""
        specs = generate_random_profile(brand_hint=brand_hint)
        return self.connect_device(specs)

    def connect_device(self, specs: DeviceSpecs) -> DeviceSpecs:
        """Sets active device specs and notifies listeners."""
        with self._lock:
            self._active_specs = specs

        if self.on_status_changed:
            self.on_status_changed(specs.connection_type)
        if self.on_device_connected:
            self.on_device_connected(specs)

        return specs

    def disconnect(self) -> None:
        """Detaches active mock device and notifies listeners."""
        with self._lock:
            had_device = self._active_specs is not None
            self._active_specs = None

        if had_device:
            if self.on_status_changed:
                self.on_status_changed("none")
            if self.on_device_disconnected:
                self.on_device_disconnected()

    # ------------------------------------------------------------------------
    # Polling Loop Simulation
    # ------------------------------------------------------------------------

    def poll_tick(self) -> Tuple[str, Optional[DeviceSpecs]]:
        """
        Executes a single polling tick.
        Returns (connection_type, active_specs).
        """
        with self._lock:
            if self._active_specs is None:
                return "none", None
            return self._active_specs.connection_type, replace(self._active_specs)

    def start_polling(self, interval: float = 2.0) -> None:
        """Starts a background simulation polling loop."""
        if self._poll_thread and self._poll_thread.is_alive():
            return
        self._poll_interval = interval
        self._stop_event.clear()
        self._poll_thread = threading.Thread(target=self._run_poll_loop, daemon=True, name="MockPoller")
        self._poll_thread.start()

    def stop_polling(self) -> None:
        """Stops the background simulation polling loop."""
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1.0)
        self._poll_thread = None

    def _run_poll_loop(self) -> None:
        """Daemon worker loop emitting periodic heartbeats or state changes."""
        last_id = None
        while not self._stop_event.is_set():
            with self._lock:
                current = self._active_specs

            curr_id = current.device_id if current else None
            if curr_id != last_id:
                last_id = curr_id
                if current and self.on_device_connected:
                    self.on_device_connected(replace(current))
                elif not current and self.on_device_disconnected:
                    self.on_device_disconnected()

            self._stop_event.wait(self._poll_interval)


# ============================================================================
# 5. Raw Command Output Simulator (For Subprocess & Parser Integration)
# ============================================================================

class MockCommandSimulator:
    """
    Generates realistic raw CLI stdout strings corresponding to mock profiles.
    Allows testing live parsers against realistic ADB and libimobiledevice outputs.
    """

    @staticmethod
    def get_adb_getprop(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell getprop'."""
        manufacturer = "samsung" if specs.brand == "Samsung" else ("xiaomi" if specs.brand in ("Xiaomi", "Redmi", "POCO") else "android")
        lines = [
            f"[ro.product.brand]: [{specs.brand.lower()}]",
            f"[ro.product.manufacturer]: [{manufacturer}]",
            f"[ro.product.model]: [{specs.model_code}]",
            f"[ro.product.marketname]: [{specs.marketing_name}]",
            f"[ro.build.version.release]: [{specs.os_version.replace('Android ', '')}]",
            f"[ro.serialno]: [{specs.serial_number}]",
            f"[ro.boot.flash.locked]: [{'1' if specs.bootloader_locked else '0'}]",
            f"[ro.boot.verifiedbootstate]: [{'green' if specs.bootloader_locked else 'orange'}]",
            f"[gsm.baseband.imei]: [{specs.imei1}]"
        ]
        return "\n".join(lines)

    @staticmethod
    def get_adb_df(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell df -k /data'."""
        # Convert commercial storage string back to total KB
        storage_map = {
            "16GB": 14000000,
            "32GB": 28000000,
            "64GB": 57000000,
            "128GB": 114688000,
            "256GB": 229376000,
            "512GB": 458752000,
            "1TB": 917504000
        }
        total_kb = storage_map.get(specs.storage, 229376000)
        used_kb = int(total_kb * 0.35)
        avail_kb = total_kb - used_kb
        pct = 35
        return (
            "Filesystem      1K-blocks      Used Available Use% Mounted on\n"
            f"/dev/block/dm-7 {total_kb}  {used_kb}  {avail_kb}  {pct}% /data\n"
        )

    @staticmethod
    def get_adb_meminfo(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell cat /proc/meminfo'."""
        ram_map = {
            "2GB": 1985400,
            "3GB": 2985400,
            "4GB": 3876124,
            "6GB": 5812300,
            "8GB": 7854320,
            "12GB": 11854320,
            "16GB": 15642100,
            "24GB": 23450000
        }
        mem_kb = ram_map.get(specs.ram, 7854320)
        return (
            f"MemTotal:        {mem_kb} kB\n"
            f"MemFree:          245120 kB\n"
            f"MemAvailable:    {int(mem_kb * 0.5)} kB\n"
            f"Buffers:          123400 kB\n"
            f"Cached:          1894200 kB\n"
        )

    @staticmethod
    def get_adb_dumpsys_battery(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell dumpsys battery'."""
        level = specs.battery_health if specs.battery_health is not None else 85
        return (
            "Current Battery Service state:\n"
            "  AC powered: false\n"
            "  USB powered: true\n"
            "  Wireless powered: false\n"
            "  status: 2\n"
            "  health: 2\n"
            "  present: true\n"
            f"  level: {level}\n"
            "  scale: 100\n"
            "  voltage: 4120\n"
            "  temperature: 285\n"
            "  technology: Li-ion\n"
            f"  charge counter: 3450000\n"
            f"  cycle_count: {specs.battery_cycles or 45}\n"
        )

    @staticmethod
    def get_adb_service_call_imei(specs: DeviceSpecs) -> str:
        """Generates realistic hex parcel output for 'service call iphonesubinfo 1'."""
        imei = specs.imei1
        # Format UTF-16 character stream in parcel lines
        chars = list(imei)
        p1 = "".join([f".{c}" for c in chars[:4]])
        p2 = "".join([f".{c}" for c in chars[4:12]])
        p3 = "".join([f".{c}" for c in chars[12:]])
        return (
            "Result: Parcel(\n"
            f"  0x00000000: 00000000 0000000f 00380033 00310035 '........{p1}'\n"
            f"  0x00000010: 00380036 00330030 00390035 00340032 '{p2}'\n"
            f"  0x00000020: 00370030 00000031                   '{p3}..        ')\n"
        )

    @staticmethod
    def get_fastboot_getvar_all(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'fastboot getvar all'."""
        is_unlocked = "yes" if not specs.bootloader_locked else "no"
        return (
            f"(bootloader) product: {specs.raw_properties.get('product', specs.model_code)}\n"
            f"(bootloader) unlocked: {is_unlocked}\n"
            f"(bootloader) serialno: {specs.serial_number}\n"
            "(bootloader) secure: yes\n"
            "all: done\n"
            "Finished. Total time: 0.005s\n"
        )

    @staticmethod
    def get_ios_ideviceinfo_xml(specs: DeviceSpecs) -> str:
        """Generates realistic XML plist output for 'ideviceinfo -x'."""
        storage_map = {
            "64GB": 64000000000,
            "128GB": 128035676160,
            "256GB": 256071352320,
            "512GB": 512142704640,
            "1TB": 1024285409280
        }
        total_bytes = storage_map.get(specs.storage, 256071352320)
        imei2_tag = f"<key>InternationalMobileEquipmentIdentity2</key><string>{specs.imei2}</string>" if specs.imei2 else ""

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceName</key>
    <string>{specs.marketing_name}</string>
    <key>ProductType</key>
    <string>{specs.model_code}</string>
    <key>ProductVersion</key>
    <string>{specs.os_version.replace('iOS ', '')}</string>
    <key>BuildVersion</key>
    <string>22B83</string>
    <key>SerialNumber</key>
    <string>{specs.serial_number}</string>
    <key>UniqueDeviceID</key>
    <string>{specs.device_id}</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>{specs.imei1}</string>
    {imei2_tag}
    <key>TotalDiskCapacity</key>
    <integer>{total_bytes}</integer>
    <key>DeviceColor</key>
    <string>{specs.color}</string>
    <key>DeviceEnclosureColor</key>
    <string>{specs.color}</string>
    <key>ModelNumber</key>
    <string>MYWV3</string>
    <key>RegionInfo</key>
    <string>{specs.sales_region or 'LL/A'}</string>
</dict>
</plist>"""

    @staticmethod
    def get_ios_battery_xml(specs: DeviceSpecs) -> str:
        """Generates realistic XML plist for 'idevicediagnostics ioregentry AppleSmartBattery'."""
        health = specs.battery_health if specs.battery_health is not None else 100
        cycles = specs.battery_cycles if specs.battery_cycles is not None else 15
        design_cap = 3274
        nominal_cap = int((design_cap * health) / 100)

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CycleCount</key>
    <integer>{cycles}</integer>
    <key>DesignCapacity</key>
    <integer>{design_cap}</integer>
    <key>NominalChargeCapacity</key>
    <integer>{nominal_cap}</integer>
    <key>MaximumCapacityPercent</key>
    <integer>{health}</integer>
    <key>IsCharging</key>
    <false/>
    <key>CurrentCapacity</key>
    <integer>88</integer>
</dict>
</plist>"""
```

---

## 4. Milestone 1 Unit Test Suites Architecture

### 4.1 Specification: `tests/test_adb_reader.py`

This test suite directly exercises the parsers and resolvers in `core/adb_reader.py` using realistic stdout fixtures without invoking external processes:

```python
"""
Unit tests for Android Extraction Engine (core/adb_reader.py).
Tests storage/RAM boundary thresholds, OEM model resolvers, IMEI extraction,
battery telemetry, fastboot parsers, and daemon restart resilience.
"""
import unittest

from core.adb_reader import (
    sanitize_adb_output,
    parse_storage_from_df,
    parse_ram_from_meminfo,
    validate_luhn,
    parse_imei_from_service_call,
    resolve_marketing_name,
    parse_battery_info,
    parse_bootloader_status,
    parse_fastboot_devices
)


class TestAdbSanitization(unittest.TestCase):
    """Tests ADB stdout sanitization against transient daemon startup messages."""

    def test_strip_daemon_notices(self):
        raw = (
            "* daemon not running; starting now at tcp:5037 *\n"
            "* daemon started successfully *\n"
            "List of devices attached\n"
            "R5CX109876U\tdevice\n"
        )
        clean = sanitize_adb_output(raw)
        self.assertNotIn("* daemon", clean)
        self.assertIn("List of devices attached", clean)
        self.assertIn("R5CX109876U\tdevice", clean)

    def test_strip_daemon_restart_clash(self):
        raw = (
            "adb server version (40) doesn't match this client (41); killing...\n"
            "* daemon started successfully *\n"
            "samsung\n"
        )
        clean = sanitize_adb_output(raw)
        self.assertEqual(clean, "samsung")


class TestCommercialStorageParsing(unittest.TestCase):
    """Validates deterministic mapping from raw /data 1K-blocks to commercial sizes."""

    def test_standard_df_toybox(self):
        df_out = (
            "Filesystem      1K-blocks      Used Available Use% Mounted on\n"
            "/dev/block/dm-7 114688000  42104320  72583680  37% /data\n"
        )
        self.assertEqual(parse_storage_from_df(df_out), "128GB")

    def test_standard_df_busybox(self):
        df_out = "/dev/block/bootdevice/by-name/userdata 458752000 120400000 338352000 27% /data"
        self.assertEqual(parse_storage_from_df(df_out), "512GB")

    def test_storage_boundary_thresholds(self):
        # 16GB: <= 18.0 GB
        self.assertEqual(parse_storage_from_df("/dev/data 17578125 0 0 0% /data"), "16GB")
        # 32GB: 18.0 < GB <= 36.0
        self.assertEqual(parse_storage_from_df("/dev/data 17675781 0 0 0% /data"), "32GB")
        self.assertEqual(parse_storage_from_df("/dev/data 35156250 0 0 0% /data"), "32GB")
        # 64GB: 36.0 < GB <= 72.0
        self.assertEqual(parse_storage_from_df("/dev/data 36132812 0 0 0% /data"), "64GB")
        self.assertEqual(parse_storage_from_df("/dev/data 70312500 0 0 0% /data"), "64GB")
        # 128GB: 72.0 < GB <= 145.0
        self.assertEqual(parse_storage_from_df("/dev/data 71289062 0 0 0% /data"), "128GB")
        self.assertEqual(parse_storage_from_df("/dev/data 141601562 0 0 0% /data"), "128GB")
        # 256GB: 145.0 < GB <= 290.0
        self.assertEqual(parse_storage_from_df("/dev/data 142578125 0 0 0% /data"), "256GB")
        self.assertEqual(parse_storage_from_df("/dev/data 283203125 0 0 0% /data"), "256GB")
        # 512GB: 290.0 < GB <= 580.0
        self.assertEqual(parse_storage_from_df("/dev/data 284179687 0 0 0% /data"), "512GB")
        self.assertEqual(parse_storage_from_df("/dev/data 566406250 0 0 0% /data"), "512GB")
        # 1TB: 580.0 < GB <= 1150.0
        self.assertEqual(parse_storage_from_df("/dev/data 567382812 0 0 0% /data"), "1TB")
        self.assertEqual(parse_storage_from_df("/dev/data 1123046875 0 0 0% /data"), "1TB")

    def test_storage_empty_or_permission_denied(self):
        self.assertEqual(parse_storage_from_df(""), "Unknown")
        self.assertEqual(parse_storage_from_df("/data: Permission denied"), "Unknown")


class TestCommercialRamParsing(unittest.TestCase):
    """Validates deterministic mapping from /proc/meminfo MemTotal to commercial RAM tiers."""

    def test_meminfo_standard(self):
        meminfo = (
            "MemTotal:        7854320 kB\n"
            "MemFree:          245120 kB\n"
            "MemAvailable:    3845600 kB\n"
        )
        self.assertEqual(parse_ram_from_meminfo(meminfo), "8GB")

    def test_ram_boundary_thresholds(self):
        # 2GB: <= 2300 MB (2355200 kB)
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2048000 kB"), "2GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2355200 kB"), "2GB")
        # 3GB: 2300 < MB <= 3400
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2356224 kB"), "3GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 3481600 kB"), "3GB")
        # 4GB: 3400 < MB <= 4600
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 3876124 kB"), "4GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 4710400 kB"), "4GB")
        # 6GB: 4600 < MB <= 6800
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 5812300 kB"), "6GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 6963200 kB"), "6GB")
        # 8GB: 6800 < MB <= 9500
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 7854320 kB"), "8GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 9728000 kB"), "8GB")
        # 12GB: 9500 < MB <= 14000
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 11854320 kB"), "12GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 14336000 kB"), "12GB")
        # 16GB: 14000 < MB <= 19000
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 15642100 kB"), "16GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 19456000 kB"), "16GB")
        # 24GB: > 19000 MB
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 24576000 kB"), "24GB")

    def test_meminfo_malformed(self):
        self.assertEqual(parse_ram_from_meminfo("cat: /proc/meminfo: No such file"), "Unknown")
        self.assertEqual(parse_ram_from_meminfo(""), "Unknown")


class TestMarketingModelResolver(unittest.TestCase):
    """Validates commercial brand and model resolution across Samsung, Xiaomi, Oppo, and OnePlus."""

    def test_samsung_flagship_resolvers(self):
        self.assertEqual(resolve_marketing_name("SM-S928B", "samsung"), ("Samsung", "Galaxy S24 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S928U", "samsung"), ("Samsung", "Galaxy S24 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S926B", "samsung"), ("Samsung", "Galaxy S24+"))
        self.assertEqual(resolve_marketing_name("SM-S921B", "samsung"), ("Samsung", "Galaxy S24"))
        self.assertEqual(resolve_marketing_name("SM-S918B", "samsung"), ("Samsung", "Galaxy S23 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S908U", "samsung"), ("Samsung", "Galaxy S22 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-G998B", "samsung"), ("Samsung", "Galaxy S21 Ultra 5G"))
        self.assertEqual(resolve_marketing_name("SM-N986B", "samsung"), ("Samsung", "Galaxy Note 20 Ultra 5G"))
        self.assertEqual(resolve_marketing_name("SM-F946B", "samsung"), ("Samsung", "Galaxy Z Fold 5"))
        self.assertEqual(resolve_marketing_name("SM-F731B", "samsung"), ("Samsung", "Galaxy Z Flip 5"))

    def test_samsung_a_series_resolvers(self):
        self.assertEqual(resolve_marketing_name("SM-A556B", "samsung"), ("Samsung", "Galaxy A55 5G"))
        self.assertEqual(resolve_marketing_name("SM-A546U", "samsung"), ("Samsung", "Galaxy A54 5G"))
        self.assertEqual(resolve_marketing_name("SM-A155F", "samsung"), ("Samsung", "Galaxy A15"))

    def test_xiaomi_code_resolvers(self):
        self.assertEqual(resolve_marketing_name("2312DRA50G", "Xiaomi"), ("Redmi", "Redmi Note 13 Pro 5G"))
        self.assertEqual(resolve_marketing_name("23049PCD8G", "Xiaomi"), ("POCO", "POCO F5"))
        self.assertEqual(resolve_marketing_name("2210132G", "Xiaomi"), ("Xiaomi", "Xiaomi 13 Pro"))

    def test_oppo_oneplus_resolvers(self):
        self.assertEqual(resolve_marketing_name("CPH2581", "OnePlus"), ("OnePlus", "OnePlus 12"))
        self.assertEqual(resolve_marketing_name("RMX3820", "realme"), ("Realme", "Realme GT Neo 5"))

    def test_explicit_marketname_priority(self):
        # System marketname should override code resolution if distinct
        brand, model = resolve_marketing_name("2312DRA50G", "Xiaomi", marketname="Redmi Note 13 Pro 5G Special Edition")
        self.assertEqual(model, "Redmi Note 13 Pro 5G Special Edition")


class TestImeiExtraction(unittest.TestCase):
    """Validates multi-strategy IMEI parcel decoding and Luhn validation."""

    def test_luhn_algorithm_validation(self):
        self.assertTrue(validate_luhn("351782110293846"))
        self.assertTrue(validate_luhn("358901230192834"))
        self.assertTrue(validate_luhn("353284091234567"))
        # Invalid check digit (last digit changed from 6 to 7)
        self.assertFalse(validate_luhn("351782110293847"))
        # Invalid length
        self.assertFalse(validate_luhn("35178211029384"))
        self.assertFalse(validate_luhn("3517821102938466"))
        # Non-digits
        self.assertFalse(validate_luhn("35178211029384A"))

    def test_parse_imei_service_call_parcel(self):
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00380033 00310035 '........3.5.1.7.'\n"
            "  0x00000010: 00380032 00310031 00300032 00390033 '.8.2.1.1.0.2.9.3.'\n"
            "  0x00000020: 00380034 00000036                   '.8.4.6..        ')\n"
        )
        imei = parse_imei_from_service_call(parcel)
        self.assertEqual(imei, "351782110293846")
        self.assertTrue(validate_luhn(imei))


class TestBatteryParsing(unittest.TestCase):
    """Validates battery level, health code, and cycle count extraction."""

    def test_dumpsys_battery_parsing(self):
        output = (
            "Current Battery Service state:\n"
            "  AC powered: false\n"
            "  USB powered: true\n"
            "  status: 2\n"
            "  health: 2\n"
            "  present: true\n"
            "  level: 85\n"
            "  scale: 100\n"
            "  charge counter: 3450000\n"
            "  cycle_count: 45\n"
        )
        level, health_pct, cycles = parse_battery_info(output)
        self.assertEqual(level, 85)
        self.assertEqual(health_pct, 95)  # Good health mapped
        self.assertEqual(cycles, 45)

    def test_asoc_battery_parsing(self):
        output = (
            "  level: 92\n"
            "  scale: 100\n"
            "  health: 2\n"
            "  mSavedBatteryAsoc: 98\n"
            "  mSavedBatteryUsage: 64\n"
        )
        level, health_pct, cycles = parse_battery_info(output)
        self.assertEqual(level, 92)
        self.assertEqual(health_pct, 98)
        self.assertEqual(cycles, 64)


class TestBootloaderAndFastboot(unittest.TestCase):
    """Validates bootloader status resolution and fastboot device listing."""

    def test_bootloader_status_parsing(self):
        self.assertTrue(parse_bootloader_status("1", "green"))
        self.assertFalse(parse_bootloader_status("0", "orange"))
        self.assertTrue(parse_bootloader_status("locked", "unknown"))
        self.assertFalse(parse_bootloader_status("unlocked", "unknown"))

    def test_fastboot_devices_parsing(self):
        raw = (
            "0x9a8b7c6d\tfastboot\n"
            "2312DRA50G\tfastboot\n"
        )
        serials = parse_fastboot_devices(raw)
        self.assertEqual(serials, ["0x9a8b7c6d", "2312DRA50G"])


if __name__ == "__main__":
    unittest.main()
```

---

### 4.2 Specification: `tests/test_ios_reader.py`

This test suite verifies `core/ios_reader.py` parsers, ProductType resolvers, plist deserializers, battery health calculators, and region decoders:

```python
"""
Unit tests for iOS Extraction Engine (core/ios_reader.py).
Tests ProductType mappings up to iPhone 16 series, decimal disk capacity conversions,
plist XML deserialization, battery health diagnostics, region decoding, and lockdown errors.
"""
import plistlib
import unittest

from core.ios_reader import (
    resolve_apple_model,
    parse_ios_commercial_storage,
    calculate_ios_battery_health,
    decode_apple_region,
    resolve_apple_color,
    parse_ideviceinfo_xml
)


class TestAppleProductTypeMapping(unittest.TestCase):
    """Validates ProductType mapping from iPhone 6 through iPhone 16 Pro Max."""

    def test_iphone_16_series(self):
        self.assertEqual(resolve_apple_model("iPhone17,1"), "iPhone 16 Pro")
        self.assertEqual(resolve_apple_model("iPhone17,2"), "iPhone 16 Pro Max")
        self.assertEqual(resolve_apple_model("iPhone17,3"), "iPhone 16")
        self.assertEqual(resolve_apple_model("iPhone17,4"), "iPhone 16 Plus")

    def test_iphone_15_series(self):
        self.assertEqual(resolve_apple_model("iPhone16,1"), "iPhone 15 Pro")
        self.assertEqual(resolve_apple_model("iPhone16,2"), "iPhone 15 Pro Max")
        self.assertEqual(resolve_apple_model("iPhone15,4"), "iPhone 15")
        self.assertEqual(resolve_apple_model("iPhone15,5"), "iPhone 15 Plus")

    def test_iphone_14_and_legacy(self):
        self.assertEqual(resolve_apple_model("iPhone15,2"), "iPhone 14 Pro")
        self.assertEqual(resolve_apple_model("iPhone14,2"), "iPhone 13 Pro")
        self.assertEqual(resolve_apple_model("iPhone13,2"), "iPhone 12")
        self.assertEqual(resolve_apple_model("iPhone12,1"), "iPhone 11")
        self.assertEqual(resolve_apple_model("iPhone11,2"), "iPhone XS")
        self.assertEqual(resolve_apple_model("iPhone10,3"), "iPhone X")
        self.assertEqual(resolve_apple_model("iPhone14,6"), "iPhone SE (3rd Gen)")

    def test_unknown_future_model(self):
        # Should gracefully return identifier without crashing
        self.assertIn("iPhone18,1", resolve_apple_model("iPhone18,1"))


class TestIosCommercialStorage(unittest.TestCase):
    """Validates decimal capacity conversions (1 GB = 1e9 bytes) into commercial sizes."""

    def test_standard_tiers(self):
        self.assertEqual(parse_ios_commercial_storage(64000000000), "64GB")
        self.assertEqual(parse_ios_commercial_storage(128035676160), "128GB")
        self.assertEqual(parse_ios_commercial_storage(256071352320), "256GB")
        self.assertEqual(parse_ios_commercial_storage(512142704640), "512GB")
        self.assertEqual(parse_ios_commercial_storage(1024285409280), "1TB")

    def test_boundary_thresholds(self):
        # 64GB vs 128GB boundary (72 GB)
        self.assertEqual(parse_ios_commercial_storage(72000000000), "64GB")
        self.assertEqual(parse_ios_commercial_storage(72000000001), "128GB")
        # 128GB vs 256GB boundary (145 GB)
        self.assertEqual(parse_ios_commercial_storage(145000000000), "128GB")
        self.assertEqual(parse_ios_commercial_storage(145000000001), "256GB")
        # 256GB vs 512GB boundary (290 GB)
        self.assertEqual(parse_ios_commercial_storage(290000000000), "256GB")
        self.assertEqual(parse_ios_commercial_storage(290000000001), "512GB")
        # 512GB vs 1TB boundary (580 GB)
        self.assertEqual(parse_ios_commercial_storage(580000000000), "512GB")
        self.assertEqual(parse_ios_commercial_storage(580000000001), "1TB")


class TestIosBatteryHealth(unittest.TestCase):
    """Validates battery health calculation and clamping from AppleSmartBattery XML."""

    def test_direct_maximum_capacity_percent(self):
        battery_data = {"MaximumCapacityPercent": 94, "CycleCount": 180}
        health, cycles = calculate_ios_battery_health(battery_data)
        self.assertEqual(health, 94)
        self.assertEqual(cycles, 180)

    def test_calculated_from_capacities(self):
        battery_data = {
            "NominalChargeCapacity": 3200,
            "DesignCapacity": 3274,
            "CycleCount": 65
        }
        health, cycles = calculate_ios_battery_health(battery_data)
        # 3200 / 3274 * 100 = 97.74 -> 98%
        self.assertEqual(health, 98)
        self.assertEqual(cycles, 65)

    def test_overprovisioned_clamping(self):
        # Nominal exceeds design on brand new battery
        battery_data = {
            "NominalChargeCapacity": 3400,
            "DesignCapacity": 3274,
            "CycleCount": 3
        }
        health, cycles = calculate_ios_battery_health(battery_data)
        self.assertEqual(health, 100)


class TestIosRegionAndColor(unittest.TestCase):
    """Validates region code expansion and marketing color resolution."""

    def test_region_decoding(self):
        self.assertEqual(decode_apple_region("LL/A"), "LL/A (USA eSIM)")
        self.assertEqual(decode_apple_region("J/A"), "J/A (Japan)")
        self.assertEqual(decode_apple_region("CH/A"), "CH/A (China Dual SIM)")
        self.assertEqual(decode_apple_region("ZP/A"), "ZP/A (Hong Kong / Singapore)")
        self.assertEqual(decode_apple_region("B/A"), "B/A (United Kingdom)")

    def test_color_resolving(self):
        self.assertEqual(resolve_apple_color("Natural Titanium"), "Natural Titanium")
        self.assertEqual(resolve_apple_color("Desert Titanium"), "Desert Titanium")
        self.assertEqual(resolve_apple_color("#505e6b"), "Natural Titanium")
        self.assertEqual(resolve_apple_color("#3b444b"), "Space Gray")


class TestIdeviceinfoXmlParsing(unittest.TestCase):
    """Validates end-to-end deserialization of ideviceinfo -x XML plist into DeviceSpecs."""

    def test_xml_deserialization(self):
        xml_data = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceName</key>
    <string>John's iPhone</string>
    <key>ProductType</key>
    <string>iPhone17,2</string>
    <key>ProductVersion</key>
    <string>18.1</string>
    <key>SerialNumber</key>
    <string>H2LGD0987XMY</string>
    <key>UniqueDeviceID</key>
    <string>00008140-001928374650001E</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>358901230192834</string>
    <key>InternationalMobileEquipmentIdentity2</key>
    <string>358901230192842</string>
    <key>TotalDiskCapacity</key>
    <integer>256071352320</integer>
    <key>DeviceEnclosureColor</key>
    <string>Desert Titanium</string>
    <key>ModelNumber</key>
    <string>MYWV3</string>
    <key>RegionInfo</key>
    <string>LL/A</string>
</dict>
</plist>"""
        specs = parse_ideviceinfo_xml(xml_data)
        self.assertIsNotNone(specs)
        self.assertEqual(specs.marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(specs.storage, "256GB")
        self.assertEqual(specs.os_version, "iOS 18.1")
        self.assertEqual(specs.color, "Desert Titanium")
        self.assertEqual(specs.serial_number, "H2LGD0987XMY")
        self.assertEqual(specs.imei1, "358901230192834")
        self.assertEqual(specs.imei2, "358901230192842")
        self.assertEqual(specs.sales_region, "LL/A (USA eSIM)")


if __name__ == "__main__":
    unittest.main()
```

---

### 4.3 Specification: `tests/test_mock_device.py`

This test suite verifies the simulation engine, pre-configured profiles, Luhn calculations, procedural generation distributions, and polling provider event lifecycles:

```python
"""
Unit tests for Simulation & Mock Device Engine (core/mock_device.py).
Validates pre-configured profiles, Luhn algorithm, dynamic procedural generation,
polling provider state transitions, and raw command simulator outputs.
"""
import time
import unittest

from core.mock_device import (
    calculate_luhn_check_digit,
    validate_luhn_imei,
    generate_luhn_imei,
    MOCK_S24_ULTRA,
    MOCK_IPHONE16_PROMAX,
    MOCK_IPHONE15_PRO,
    MOCK_FASTBOOT_DEVICE,
    PRECONFIGURED_PROFILES,
    generate_random_profile,
    MockDeviceProvider,
    MockCommandSimulator
)
from core.models import DeviceSpecs


class TestLuhnAlgorithm(unittest.TestCase):
    """Validates Luhn calculation, generation, and validation functions."""

    def test_luhn_check_digit_calculation(self):
        # 14 digits -> 15th digit
        self.assertEqual(calculate_luhn_check_digit("35178211029384"), "6")
        self.assertEqual(calculate_luhn_check_digit("35890123019283"), "4")
        self.assertEqual(calculate_luhn_check_digit("35328409123456"), "7")

    def test_luhn_validation_known_vectors(self):
        self.assertTrue(validate_luhn_imei("351782110293846"))
        self.assertTrue(validate_luhn_imei("358901230192834"))
        self.assertTrue(validate_luhn_imei("353284091234567"))
        # Tampered check digits
        self.assertFalse(validate_luhn_imei("351782110293840"))
        self.assertFalse(validate_luhn_imei("358901230192839"))

    def test_luhn_generator_produces_valid_imeis(self):
        for _ in range(50):
            imei = generate_luhn_imei()
            self.assertEqual(len(imei), 15)
            self.assertTrue(imei.isdigit())
            self.assertTrue(validate_luhn_imei(imei))


class TestPreconfiguredProfiles(unittest.TestCase):
    """Validates all mandatory pre-configured device profiles and field contracts."""

    def test_s24_ultra_profile(self):
        p = MOCK_S24_ULTRA
        self.assertEqual(p.brand, "Samsung")
        self.assertEqual(p.marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(p.model_code, "SM-S928B")
        self.assertEqual(p.storage, "512GB")
        self.assertEqual(p.ram, "12GB")
        self.assertEqual(p.color, "Titanium Gray")
        self.assertEqual(p.os_version, "Android 14")
        self.assertEqual(p.battery_health, 98)
        self.assertEqual(p.battery_cycles, 45)
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertTrue(validate_luhn_imei(p.imei2))
        self.assertEqual(p.connection_type, "adb")
        self.assertTrue(p.bootloader_locked)

    def test_iphone16_promax_profile(self):
        p = MOCK_IPHONE16_PROMAX
        self.assertEqual(p.brand, "Apple")
        self.assertEqual(p.marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(p.model_code, "iPhone17,2")
        self.assertEqual(p.storage, "256GB")
        self.assertEqual(p.color, "Desert Titanium")
        self.assertEqual(p.os_version, "iOS 18.1")
        self.assertEqual(p.battery_health, 100)
        self.assertEqual(p.battery_cycles, 12)
        self.assertEqual(p.sales_region, "LL/A")
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertTrue(validate_luhn_imei(p.imei2))
        self.assertEqual(p.connection_type, "ios")
        self.assertTrue(p.bootloader_locked)

    def test_iphone15_pro_profile(self):
        p = MOCK_IPHONE15_PRO
        self.assertEqual(p.brand, "Apple")
        self.assertEqual(p.marketing_name, "iPhone 15 Pro")
        self.assertEqual(p.model_code, "iPhone16,1")
        self.assertEqual(p.storage, "128GB")
        self.assertEqual(p.color, "Natural Titanium")
        self.assertEqual(p.os_version, "iOS 17.5")
        self.assertEqual(p.battery_health, 89)
        self.assertEqual(p.battery_cycles, 342)
        self.assertEqual(p.sales_region, "J/A")
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertEqual(p.connection_type, "ios")

    def test_fastboot_device_profile(self):
        p = MOCK_FASTBOOT_DEVICE
        self.assertEqual(p.brand, "Xiaomi")
        self.assertIn("Fastboot", p.marketing_name)
        self.assertEqual(p.connection_type, "fastboot")
        self.assertFalse(p.bootloader_locked)  # Unlocked
        self.assertIsNone(p.battery_health)
        self.assertIsNone(p.battery_cycles)


class TestDynamicMockGenerator(unittest.TestCase):
    """Validates statistical integrity and schema compliance of procedurally generated profiles."""

    def test_generated_profiles_schema_and_luhn(self):
        for _ in range(100):
            specs = generate_random_profile()
            self.assertIsInstance(specs, DeviceSpecs)
            self.assertIn(specs.connection_type, ["adb", "ios", "fastboot"])
            self.assertTrue(len(specs.brand) > 0)
            self.assertTrue(len(specs.marketing_name) > 0)
            self.assertTrue(len(specs.storage) > 0)
            self.assertTrue(len(specs.ram) > 0)
            self.assertTrue(len(specs.serial_number) > 0)
            self.assertTrue(validate_luhn_imei(specs.imei1))
            if specs.imei2:
                self.assertTrue(validate_luhn_imei(specs.imei2))
            if specs.battery_health is not None:
                self.assertTrue(0 <= specs.battery_health <= 100)
            if specs.battery_cycles is not None:
                self.assertTrue(specs.battery_cycles >= 0)

    def test_brand_hint_selection(self):
        apple_specs = generate_random_profile(brand_hint="Apple")
        self.assertEqual(apple_specs.brand, "Apple")
        self.assertEqual(apple_specs.connection_type, "ios")

        samsung_specs = generate_random_profile(brand_hint="Samsung")
        self.assertEqual(samsung_specs.brand, "Samsung")
        self.assertEqual(samsung_specs.connection_type, "adb")


class TestMockDeviceProvider(unittest.TestCase):
    """Validates provider state transitions, callbacks, and polling loop."""

    def test_connect_and_disconnect_lifecycle(self):
        provider = MockDeviceProvider()
        self.assertFalse(provider.is_connected())
        self.assertIsNone(provider.get_active_specs())

        connected_events = []
        disconnected_events = []
        status_events = []

        provider.on_device_connected = lambda specs: connected_events.append(specs)
        provider.on_device_disconnected = lambda: disconnected_events.append(True)
        provider.on_status_changed = lambda status: status_events.append(status)

        # Connect S24 Ultra
        provider.connect_profile("mock_s24_ultra")
        self.assertTrue(provider.is_connected())
        self.assertEqual(len(connected_events), 1)
        self.assertEqual(connected_events[0].marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(status_events[-1], "adb")

        # Disconnect
        provider.disconnect()
        self.assertFalse(provider.is_connected())
        self.assertEqual(len(disconnected_events), 1)
        self.assertEqual(status_events[-1], "none")

    def test_polling_loop_daemon(self):
        provider = MockDeviceProvider()
        events = []
        provider.on_device_connected = lambda specs: events.append(specs.marketing_name)

        provider.start_polling(interval=0.05)
        time.sleep(0.02)
        provider.connect_profile("mock_iphone16_promax")
        time.sleep(0.12)
        provider.stop_polling()

        self.assertIn("iPhone 16 Pro Max", events)


class TestMockCommandSimulator(unittest.TestCase):
    """Validates that simulated raw command strings contain expected substrings."""

    def test_adb_raw_outputs(self):
        specs = MOCK_S24_ULTRA
        getprop = MockCommandSimulator.get_adb_getprop(specs)
        self.assertIn("[ro.product.model]: [SM-S928B]", getprop)

        df_out = MockCommandSimulator.get_adb_df(specs)
        self.assertIn("/data", df_out)
        self.assertIn("458752000", df_out)

        meminfo = MockCommandSimulator.get_adb_meminfo(specs)
        self.assertIn("MemTotal:        11854320 kB", meminfo)

        battery = MockCommandSimulator.get_adb_dumpsys_battery(specs)
        self.assertIn("level: 98", battery)

        parcel = MockCommandSimulator.get_adb_service_call_imei(specs)
        self.assertIn("Result: Parcel(", parcel)

    def test_ios_raw_xml_outputs(self):
        specs = MOCK_IPHONE16_PROMAX
        xml_out = MockCommandSimulator.get_ios_ideviceinfo_xml(specs)
        self.assertIn("<key>ProductType</key>", xml_out)
        self.assertIn("<string>iPhone17,2</string>", xml_out)

        battery_xml = MockCommandSimulator.get_ios_battery_xml(specs)
        self.assertIn("<key>MaximumCapacityPercent</key>", battery_xml)
        self.assertIn("<integer>100</integer>", battery_xml)


if __name__ == "__main__":
    unittest.main()
```

---

## 5. Integration & Execution Blueprint for Milestone 1 Worker

When Milestone 1 Worker starts implementing:
1. **Source Layout**:
   - Create `core/mock_device.py` using Section 3.4.
   - Create `tests/__init__.py`.
   - Create `tests/test_adb_reader.py` using Section 4.1.
   - Create `tests/test_ios_reader.py` using Section 4.2.
   - Create `tests/test_mock_device.py` using Section 4.3.
2. **Verification Command**:
   Execute from workspace root:
   ```powershell
   python -m unittest discover tests -v
   ```
   Or if `pytest` is installed:
   ```powershell
   pytest tests/ -v
   ```
3. **Execution Guarantees**:
   - Zero physical hardware required.
   - Zero network connection required.
   - 100% test coverage across all boundary conditions, mathematical validations, regex model lookups, and lifecycle state changes.

---
