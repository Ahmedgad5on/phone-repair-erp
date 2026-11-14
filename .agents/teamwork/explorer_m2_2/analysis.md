# Milestone M2 Technical Analysis: Android Multi-Layer Telemetry Extraction Engine (`core/adb_reader.py`)

## 1. Executive Summary

This document presents the comprehensive architectural analysis and exact implementation strategy for **Milestone M2: Android Multi-Layer Telemetry Extraction Engine** (`core/adb_reader.py`), conforming strictly to:
- `ORIGINAL_REQUEST.md` (Section R3: Zero-Click Hardware Data Extraction Engine)
- `PROJECT.md` (Features F04, F05, F06, F07)
- `spec_miner_hardware/spec_hardware_extraction.md` (Section 4: Android Multi-Layer Extraction Engine)

The investigation analyzed the existing implementation of `core/adb_reader.py`, the test suites (`tests/test_adb_reader.py`, `tests/e2e/`), and runtime integration contracts. While basic extraction mechanisms currently exist in `core/adb_reader.py`, critical protocol-level gaps were identified in modern Android 10-16 SELinux permission bypasses, multi-SIM parcel decoding, full Luhn checksum verification, the OEM property matrix, Fastboot IMEI querying, multi-OEM color resolving (including Samsung `ril.product_code`), and portable ADB Key Vault environment injection.

---

## 2. Gap Analysis of Current `core/adb_reader.py`

| Component | Current Implementation | Required Specification | Severity / Impact |
|---|---|---|---|
| **Layer 1 Parcel Bypass** | Invokes `service call iphonesubinfo 1` without caller package token. Calls index `2` for secondary SIM. | Must pass `s16 com.android.shell` (caller token UID 2000) to bypass SELinux `READ_PRIVILEGED_PHONE_STATE` on Android 10-16. Dual-SIM must query index `3` / `4`. | **CRITICAL**: Fails on all modern Android devices (10 to 16) returning SecurityException. |
| **Parcel Parsing Robustness** | Solely extracts text inside single quotes `re.findall(r"'([^']*)'", parcel_output)`. | Must implement **Dual-Strategy Parser**: Strategy A (quoted ASCII regions) + Strategy B (32-bit hex word binary unpacking of UTF-16 code units: `val & 0xFFFF` and `(val >> 16) & 0xFFFF`). | **HIGH**: Truncated terminal dumps or alternate Toybox builds fail to extract IMEI. |
| **Luhn Validation in Parcel Parser** | `parse_imei_from_service_call` takes first 15 digits without running `validate_luhn()`. | Must strictly validate candidates with 15-digit Luhn checksum (`validate_luhn(candidate)`). | **HIGH**: Corrupted binder transactions or memory garbage accepted as false positive IMEIs. |
| **Layer 2 OEM Property Matrix** | Only checks 3 properties: `gsm.baseband.imei`, `persist.radio.imei1`, `persist.radio.imei`. No Luhn check. | Must query full matrix: `ro.ril.oem.imei`, `ro.ril.oem.imei1`, `ro.ril.oem.imei2`, `ril.IMEI`, `ril.imei1`, `ril.imei2`, `persist.radio.imei`, `persist.radio.imei1`, `persist.radio.imei2`, `ro.gsm.imei`, `persist.sys.imei`, `gsm.baseband.imei`. Must validate Luhn. | **MEDIUM**: Fails on HTC, Asus, MediaTek, and Sony OEM fallbacks. |
| **Layer 3 Fastboot Extraction** | Hardcodes `imei1 = "Fastboot (Scan Barcode)"` in `extract_fastboot_specs`. | Must query `fastboot getvar imei`, `imei1`, `imei2`, and `fastboot getvar all` line regex. Extract valid Luhn IMEIs before fallback. | **MEDIUM**: Bricked/bootloader devices miss valid bootloader-reported IMEIs. |
| **Samsung Product Code Decoder** | Completely absent. | Must decode `ril.product_code` / `ro.ril.product_code` 3-letter tokens (`ZKG`/`ZKA`=Black, `ZWG`/`ZWA`=White, `ZGA`=Green, `ZVA`=Violet, `ZBA`=Blue, `ZDA`=Gold, `ZTA`=Titanium Gray, etc.). | **HIGH**: Samsung flagship and A-series devices always report generic "Standard" color. |
| **Multi-OEM Color Hierarchy** | Only reads `ro.boot.hardware.color`. | Must resolve Xiaomi (`ro.boot.hwc`, `ro.product.SystemColor`, `persist.sys.color`), Oppo/Realme/OnePlus (`ro.hw.phone.color`, `ro.boot.project_color`), Pixel (`ro.boot.hardware.color` mapping), Huawei/Honor (`ro.config.color`), and SQLite TAC memory fallback. | **HIGH**: Color field is empty or "Standard" on >80% of Android OEMs. |
| **Portable ADB Key Vault** | `core/paths.py` lacks `get_adb_keys_dir()` and `setup_adb_environment()`. `run_cmd()` does not inject vault environment variables. | Must configure `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` to `./data/adb_keys` for all ADB subprocess calls. | **HIGH**: Technicians face repeated RSA authorization prompts when running from USB or changing accounts. |

---

## 3. Technical Implementation Strategy

### 3.1 Multi-Layer IMEI Extraction Hierarchy

```
+=============================================================================+
|                       ANDROID MULTI-LAYER IMEI LADDER                       |
+=============================================================================+
                                      |
         +----------------------------v----------------------------+
         | LAYER 1: Binder Parcel Bypass (service call)            |
         | Primary:   service call iphonesubinfo 1 s16 com.android.shell
         | Dual-SIM:  service call iphonesubinfo 3 / 4 s16 ...     |
         +----------------------------+----------------------------+
                                      |
                           [Valid 15-Digit Luhn?]
                                      |
                       +--------------+--------------+
                       | YES                         | NO
                       v                             v
               [Accept IMEI]        +--------------------------------+
                                    | LAYER 2: OEM Property Matrix   |
                                    | ro.ril.oem.imei, ril.IMEI,     |
                                    | persist.radio.imei, gsm.imei   |
                                    +----------------+---------------+
                                                     |
                                          [Valid 15-Digit Luhn?]
                                                     |
                                      +--------------+--------------+
                                      | YES                         | NO
                                      v                             v
                              [Accept IMEI]        +----------------+----------------+
                                                   | LAYER 3: Fastboot Bootloader    |
                                                   | fastboot getvar imei / imei1/2  |
                                                   +----------------+----------------+
                                                                    |
                                                         [Valid 15-Digit Luhn?]
                                                                    |
                                                     +--------------+--------------+
                                                     | YES                         | NO
                                                     v                             v
                                             [Accept IMEI]           "Restricted (Scan)"
```

#### Layer 1: Parcel Bypass Protocol & Parser Details
Modern Android telephony services enforce `READ_PRIVILEGED_PHONE_STATE`. Calling `service call iphonesubinfo 1 s16 com.android.shell` sends the IPC parcel with the shell caller token (UID 2000), which satisfies the Android Framework permission gate.

1. **Commands Executed**:
   - Primary SIM (IMEI 1):
     `adb -s <serial> shell service call iphonesubinfo 1 s16 com.android.shell`
     *(Fallback for Android 6–9: `adb -s <serial> shell service call iphonesubinfo 1`)*
   - Secondary SIM (Dual-SIM IMEI 2):
     `adb -s <serial> shell service call iphonesubinfo 3 s16 com.android.shell`
     *(Fallback chain: index `4` with token, index `2` with token, then indices `3`, `4`, `2` without token)*

2. **Parcel Decoding Algorithm**:
   - **Strategy A (Quoted Characters Dump)**:
     Extract all blocks matching `'([^']*)'`. Filter non-digit characters (`re.sub(r"\D", "", raw)`). Scan 15-digit sliding windows. If candidate is not all zeros (`candidate != "000000000000000"`) and `validate_luhn(candidate)` is True, return candidate immediately.
   - **Strategy B (Binary 32-bit Hex Word Unpacking)**:
     Parse lines matching `0x[0-9a-fA-F]{8}:\s+([0-9a-fA-F\s]+)`.
     Word 0: Binder status (0 = NO_ERROR).
     Word 1: Character length (0x0000000f = 15).
     Subsequent words: 32-bit little-endian packed UTF-16 code units:
     `char1 = chr(val & 0xFFFF)`
     `char2 = chr((val >> 16) & 0xFFFF)`
     Filter digits, verify length >= 15, and validate Luhn checksum.

3. **Luhn Checksum Validation Algorithm**:
   $$\text{CheckDigit}(d_1 \dots d_{14}) = \left( 10 - \left( \sum_{i=1}^{14} f(i, d_i) \pmod{10} \right) \right) \pmod{10}$$
   where odd 0-indexed positions ($i = 1, 3, 5, 7, 9, 11, 13$) are doubled and subtracted by 9 if $>9$. Total sum modulo 10 must equal 0. Non-digits or strings of 15 zeros are rejected.

#### Layer 2: OEM Property Matrix Fallback
When Layer 1 returns no valid Luhn IMEI, query the system properties dictionary across 12 known OEM keys:
```python
OEM_IMEI_PROP_KEYS = [
    "ro.ril.oem.imei",
    "ro.ril.oem.imei1",
    "ro.ril.oem.imei2",
    "ril.IMEI",
    "ril.imei1",
    "ril.imei2",
    "persist.radio.imei",
    "persist.radio.imei1",
    "persist.radio.imei2",
    "ro.gsm.imei",
    "persist.sys.imei",
    "gsm.baseband.imei",
]
```
Values are split by commas, semicolons, and whitespace. Tokens are stripped to digits. Any token with `len == 15` satisfying `validate_luhn(token)` is assigned to `imei1`. Any distinct valid token is assigned to `imei2`.

#### Layer 3: Fastboot Bootloader Fallback
When a device is connected in bootloader/fastboot mode:
1. `fastboot -s <serial> getvar imei`
2. `fastboot -s <serial> getvar imei1`
3. `fastboot -s <serial> getvar imei2`
4. `fastboot -s <serial> getvar all` (regex search lines `(?:bootloader\)?\s*imei[12]?:\s*(\d{15})`)
Candidates are validated via `validate_luhn()`. If found, `imei1` is populated with the true hardware IMEI. If not found, fall back to `"Fastboot (Scan Barcode)"`.

---

### 3.2 Multi-OEM Commercial Color Resolver

Smartphones do not have a standard AOSP `ro.color` property. The resolver evaluates vendor-specific properties in deterministic priority order:

#### 1. Samsung Product Code Decoder (`ril.product_code`)
Samsung Galaxy product codes follow the structure:
`[Model: 7-8 chars][Color/Variant Code: 2-3 chars][CSC Region: 3 chars]`
Example: `SM-S928BZKGEUX` -> Model `SM-S928B`, Color `ZKG` (Black), CSC `EUX` (Europe).

Decoder logic supports both unsuffixed test strings (e.g. `SM-S928BZKG`) and full carrier SKUs with 3-letter CSC (e.g. `SM-S928BZKGEUX`):

| Color Tokens | Commercial Color Output | Tab 1 Color Chip Equivalent |
|---|---|---|
| `ZKG`, `ZKA`, `ZK`, `BLK`, `BK` | Black | Black |
| `ZWG`, `ZWA`, `ZW`, `WHT`, `WH` | White | White |
| `ZGA`, `ZGG`, `ZG`, `GRN`, `GR` | Green | Green |
| `ZVA`, `ZVG`, `ZV`, `VIO` | Violet | Purple |
| `ZBA`, `ZBB`, `ZB`, `BLU` | Blue | Blue |
| `ZDA`, `ZDG`, `ZD`, `YEL` | Gold | Gold |
| `ZTA`, `ZTG`, `ZT`, `GRY` | Titanium Gray | Titanium |
| `ZSA`, `ZS`, `SLV` | Silver | Silver |
| `ZOA`, `ZO`, `ORG` | Orange | Gold/Custom |
| `DB` | Dark Blue | Blue |

#### 2. Xiaomi / Redmi / POCO Color Resolver
Priority:
1. `ro.boot.hwc` (Hardware casing code)
2. `ro.product.SystemColor` (e.g. "Midnight Black", "Emerald Green")
3. `persist.sys.color`
4. `ro.boot.color`

#### 3. Oppo / Realme / OnePlus Color Resolver
Priority:
1. `ro.hw.phone.color` (e.g. "Sunset Orange")
2. `ro.boot.project_color`
3. `ro.boot.hardware.color`
4. `persist.sys.oppo.color`

#### 4. Google Pixel Color Resolver
Property: `ro.boot.hardware.color`
Mappings:
- `obsidian` -> Obsidian Black
- `porcelain` -> Porcelain White
- `bay` -> Bay Blue
- `hazel` -> Hazel
- `rose` -> Rose
- `mint` -> Mint
- `snow` -> Snow
- `stormy_black` -> Stormy Black
- `kinda_coral` -> Kinda Coral
- `sorta_sunny` -> Sorta Sunny
- `clearly_white` -> Clearly White
- `just_black` -> Just Black
- `lemongrass` -> Lemongrass
- `charcoal` -> Charcoal

#### 5. Huawei / Honor Color Resolver
Priority: `ro.config.color`, `ro.hw.phone.color`.

#### 6. SQLite TAC Memory Fallback
When all properties return empty or generic values:
- Extract TAC prefix: first 8 digits of `imei1`.
- Query `lookup_tac_color(tac, model_code)` from `core.database`.
- If learned from a previous technician 1-click color chip selection, instantly return the learned color.
- Default fallback: `"Standard"`.

---

### 3.3 Hardware Specs & Battery Extraction

#### Commercial Storage Tier Decimal Rounding
- Command: `adb -s <serial> shell df -k /data`
- Calculation: $\text{Decimal GB} = \frac{\text{1K-Blocks} \times 1024}{10^9}$
- Boundary Tiers:
  - $\le 18.0\text{ GB} \rightarrow$ **16GB**
  - $\le 36.0\text{ GB} \rightarrow$ **32GB**
  - $\le 72.0\text{ GB} \rightarrow$ **64GB**
  - $\le 145.0\text{ GB} \rightarrow$ **128GB**
  - $\le 290.0\text{ GB} \rightarrow$ **256GB**
  - $\le 580.0\text{ GB} \rightarrow$ **512GB**
  - $\le 1150.0\text{ GB} \rightarrow$ **1TB**
  - $\le 2300.0\text{ GB} \rightarrow$ **2TB**
  - $> 2300.0\text{ GB} \rightarrow$ $\operatorname{round}(\text{Decimal GB} / 1000)\text{TB}$

#### Commercial RAM Calculation (`/proc/meminfo`)
- Command: `adb -s <serial> shell cat /proc/meminfo`
- Regex: `MemTotal:\s*(\d+)\s*kB`
- Carveout Compensation Tiers ($\text{MB} = \text{kB} / 1024.0$):
  - $\le 2300\text{ MB} \rightarrow$ **2GB**
  - $2301 - 3400\text{ MB} \rightarrow$ **3GB**
  - $3401 - 4600\text{ MB} \rightarrow$ **4GB**
  - $4601 - 6800\text{ MB} \rightarrow$ **6GB**
  - $6801 - 9500\text{ MB} \rightarrow$ **8GB**
  - $9501 - 14000\text{ MB} \rightarrow$ **12GB**
  - $14001 - 19000\text{ MB} \rightarrow$ **16GB**
  - $19001 - 28000\text{ MB} \rightarrow$ **24GB**

#### Serial Number Hierarchy
Priority:
1. `ro.serialno`
2. `ro.boot.serialno`
3. Connection `serial`

#### Battery Metrics (`dumpsys battery`)
- Command: `adb -s <serial> shell dumpsys battery`
- Fields extracted:
  - `level` and `scale`: $\text{Percentage} = \operatorname{clamp}\left(\operatorname{round}\left(\frac{\text{level} \times 100}{\text{scale}}\right), 0, 100\right)$
  - `mSavedBatteryAsoc`: Samsung exact hardware ASOC (0–100%)
  - `health` status code: if code == 2 (Good), default to 95%; otherwise 70%
  - `cycle_count` or `mSavedBatteryUsage`: Lifetime charge cycles

---

### 3.4 Portable ADB Key Vault Integration

In `core/paths.py`:
- `get_adb_keys_dir(base_dir: Optional[Path] = None) -> Path`: Resolves `./data/adb_keys` relative to application root (frozen exe or development). Creates directory if missing.
- `setup_adb_environment(base_dir: Optional[Path] = None) -> Dict[str, str]`: Sets `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` in `os.environ` and returns the injected environment dictionary.

In `core/adb_reader.py`:
- Ensure `run_cmd()` passes `env=setup_adb_environment()` to `subprocess.run()`.

---

## 4. Proposed Code Changes

The complete code implementation is provided below as drop-in replacement proposals for the implementer agent.

### 4.1 Changes to `core/paths.py`

Add `get_adb_keys_dir()` and `setup_adb_environment()` conforming to Interface Contract:

```python
# --- ADD TO core/paths.py ---

def get_adb_keys_dir(base_dir: Optional[Path] = None) -> Path:
    """
    Resolves ./data/adb_keys relative to application root (frozen exe or development).
    Ensures directory exists before returning.
    """
    if base_dir is not None:
        vault_dir = Path(base_dir) / "data" / "adb_keys"
    else:
        vault_dir = get_app_data_dir() / "adb_keys"
    vault_dir.mkdir(parents=True, exist_ok=True)
    return vault_dir


def setup_adb_environment(base_dir: Optional[Path] = None) -> Dict[str, str]:
    """
    Sets ANDROID_SDK_HOME, ANDROID_PREFS_ROOT, and ADB_VENDOR_KEYS to the adb keys directory.
    Updates os.environ and returns injected environment dictionary.
    """
    vault_dir = get_adb_keys_dir(base_dir)
    vault_str = str(vault_dir.resolve())
    env_vars = {
        "ANDROID_SDK_HOME": vault_str,
        "ANDROID_PREFS_ROOT": vault_str,
        "ADB_VENDOR_KEYS": vault_str,
    }
    for k, v in env_vars.items():
        os.environ[k] = v
    return env_vars
```

---

### 4.2 Changes to `core/adb_reader.py`

Below is the complete revised implementation of `core/adb_reader.py`:

```python
"""
Android & Fastboot Hardware Extraction Engine.
Provides asynchronous polling, daemon sanitization, deterministic storage/RAM calculators,
OEM model code resolution, multi-strategy IMEI extraction, multi-OEM color resolution,
and Fastboot telemetry.
"""
from dataclasses import replace
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple, Any

from core.models import DeviceSpecs
from core.paths import get_binary_path, get_adb_keys_dir, setup_adb_environment

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def run_cmd(
    args: List[str],
    timeout: float = 3.0,
    env: Optional[Dict[str, str]] = None
) -> Tuple[int, str, str]:
    """
    Executes an external command with CREATE_NO_WINDOW on Windows to prevent console flashing.
    Automatically injects portable ADB key vault environment variables if not specified.
    Returns (returncode, stdout, stderr).
    """
    cmd_env = env if env is not None else os.environ.copy()
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            timeout=timeout,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=cmd_env
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout expired"
    except Exception as e:
        return -1, "", str(e)


def sanitize_adb_output(raw_output: str) -> str:
    """Strips transient daemon startup messages, banner noise, and version clashes."""
    if not raw_output or not isinstance(raw_output, str):
        return ""
    lines = raw_output.splitlines()
    clean = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if (
            stripped.startswith("* daemon")
            or "daemon started" in stripped.lower()
            or "killing..." in stripped.lower()
        ):
            continue
        clean.append(stripped)
    return "\n".join(clean)


# ============================================================================
# Deterministic Commercial Storage & RAM Parsers
# ============================================================================

def parse_android_commercial_storage(total_kb: int) -> str:
    """
    Converts 1K-blocks in /data to standard commercial storage sizes.
    Uses decimal calculation: (total_kb * 1024) / 1e9.
    """
    if total_kb <= 0:
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
    elif decimal_gb <= 2300.0:
        return "2TB"
    else:
        return f"{round(decimal_gb / 1000)}TB"


def parse_storage_from_df(df_output: Optional[str]) -> str:
    """
    Parses 'adb shell df -k /data' or 'adb shell df /data'.
    Handles standard Toybox, Busybox, and multiline wrapped outputs.
    """
    if not df_output or not isinstance(df_output, str):
        return "Unknown"

    clean = sanitize_adb_output(df_output)
    total_kb: Optional[int] = None

    for line in clean.splitlines():
        if "/data" in line:
            parts = line.split()
            # Look for 1K-blocks column (first large numeric token >= 1,000,000 KB)
            for part in parts:
                if part.isdigit() and int(part) >= 1000000:
                    total_kb = int(part)
                    break
            if total_kb:
                break

    if not total_kb:
        match = re.search(r'(\d+)\s*K?\s*total', clean, re.IGNORECASE)
        if match:
            total_kb = int(match.group(1))

    if not total_kb:
        return "Unknown"

    return parse_android_commercial_storage(total_kb)


def parse_android_commercial_ram(mem_total_kb: int) -> str:
    """
    Converts /proc/meminfo MemTotal in kB to standard commercial RAM ratings.
    Accounts for Linux kernel code, baseband modem, and GPU carveouts.
    """
    if mem_total_kb <= 0:
        return "Unknown"
    mem_mb = mem_total_kb / 1024.0
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
    elif mem_mb <= 28000:
        return "24GB"
    else:
        return f"{round(mem_mb / 1024.0)}GB"


def parse_ram_from_meminfo(meminfo_output: Optional[str]) -> str:
    """
    Parses 'adb shell cat /proc/meminfo' extracting MemTotal.
    """
    if not meminfo_output or not isinstance(meminfo_output, str):
        return "Unknown"
    clean = sanitize_adb_output(meminfo_output)
    match = re.search(r'MemTotal:\s*(\d+)\s*kB', clean, re.IGNORECASE)
    if not match:
        return "Unknown"
    try:
        mem_kb = int(match.group(1))
    except (ValueError, TypeError):
        return "Unknown"
    return parse_android_commercial_ram(mem_kb)


# ============================================================================
# OEM Model Resolvers & Dictionaries
# ============================================================================

SAMSUNG_PREFIX_RULES = [
    (r"^SM-S928[A-Z0-9]*", "Galaxy S24 Ultra"),
    (r"^SM-S926[A-Z0-9]*", "Galaxy S24+"),
    (r"^SM-S921[A-Z0-9]*", "Galaxy S24"),
    (r"^SM-S918[A-Z0-9]*", "Galaxy S23 Ultra"),
    (r"^SM-S916[A-Z0-9]*", "Galaxy S23+"),
    (r"^SM-S911[A-Z0-9]*", "Galaxy S23"),
    (r"^SM-S908[A-Z0-9]*", "Galaxy S22 Ultra"),
    (r"^SM-S906[A-Z0-9]*", "Galaxy S22+"),
    (r"^SM-S901[A-Z0-9]*", "Galaxy S22"),
    (r"^SM-G998[A-Z0-9]*", "Galaxy S21 Ultra 5G"),
    (r"^SM-G996[A-Z0-9]*", "Galaxy S21+ 5G"),
    (r"^SM-G991[A-Z0-9]*", "Galaxy S21 5G"),
    (r"^SM-G990[A-Z0-9]*", "Galaxy S21 FE 5G"),
    (r"^SM-G988[A-Z0-9]*", "Galaxy S20 Ultra"),
    (r"^SM-G986[A-Z0-9]*", "Galaxy S20+"),
    (r"^SM-G981[A-Z0-9]*", "Galaxy S20 5G"),
    (r"^SM-G980[A-Z0-9]*", "Galaxy S20"),
    (r"^SM-G781[A-Z0-9]*", "Galaxy S20 FE 5G"),
    (r"^SM-G780[A-Z0-9]*", "Galaxy S20 FE"),
    (r"^SM-N986[A-Z0-9]*", "Galaxy Note 20 Ultra 5G"),
    (r"^SM-N981[A-Z0-9]*", "Galaxy Note 20 5G"),
    (r"^SM-N975[A-Z0-9]*", "Galaxy Note 10+"),
    (r"^SM-N970[A-Z0-9]*", "Galaxy Note 10"),
    (r"^SM-F946[A-Z0-9]*", "Galaxy Z Fold 5"),
    (r"^SM-F936[A-Z0-9]*", "Galaxy Z Fold 4"),
    (r"^SM-F926[A-Z0-9]*", "Galaxy Z Fold 3"),
    (r"^SM-F731[A-Z0-9]*", "Galaxy Z Flip 5"),
    (r"^SM-F721[A-Z0-9]*", "Galaxy Z Flip 4"),
    (r"^SM-F711[A-Z0-9]*", "Galaxy Z Flip 3"),
    (r"^SM-A556[A-Z0-9]*", "Galaxy A55 5G"),
    (r"^SM-A546[A-Z0-9]*", "Galaxy A54 5G"),
    (r"^SM-A536[A-Z0-9]*", "Galaxy A53 5G"),
    (r"^SM-A528[A-Z0-9]*", "Galaxy A52s 5G"),
    (r"^SM-A525[A-Z0-9]*", "Galaxy A52"),
    (r"^SM-A356[A-Z0-9]*", "Galaxy A35 5G"),
    (r"^SM-A346[A-Z0-9]*", "Galaxy A34 5G"),
    (r"^SM-A336[A-Z0-9]*", "Galaxy A33 5G"),
    (r"^SM-A256[A-Z0-9]*", "Galaxy A25 5G"),
    (r"^SM-A245[A-Z0-9]*", "Galaxy A24"),
    (r"^SM-A235[A-Z0-9]*", "Galaxy A23"),
    (r"^SM-A155[A-Z0-9]*", "Galaxy A15"),
    (r"^SM-A156[A-Z0-9]*", "Galaxy A15 5G"),
    (r"^SM-A145[A-Z0-9]*", "Galaxy A14"),
    (r"^SM-A135[A-Z0-9]*", "Galaxy A13"),
    (r"^SM-A055[A-Z0-9]*", "Galaxy A05"),
    (r"^SM-A057[A-Z0-9]*", "Galaxy A05s"),
]

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

PIXEL_COLOR_MAP = {
    "obsidian": "Obsidian Black",
    "porcelain": "Porcelain White",
    "bay": "Bay Blue",
    "hazel": "Hazel",
    "rose": "Rose",
    "mint": "Mint",
    "snow": "Snow",
    "stormy_black": "Stormy Black",
    "kinda_coral": "Kinda Coral",
    "sorta_sunny": "Sorta Sunny",
    "clearly_white": "Clearly White",
    "just_black": "Just Black",
    "not_pink": "Not Pink",
    "oh_so_orange": "Oh So Orange",
    "lemongrass": "Lemongrass",
    "charcoal": "Charcoal",
}

SAMSUNG_COLOR_SUFFIXES = {
    "ZKG": "Black", "ZKA": "Black",
    "ZWG": "White", "ZWA": "White",
    "ZGA": "Green", "ZGG": "Green",
    "ZVA": "Violet", "ZVG": "Violet",
    "ZBA": "Blue", "ZBB": "Blue",
    "ZDA": "Gold", "ZDG": "Gold",
    "ZTA": "Titanium Gray", "ZTG": "Titanium Gray",
    "ZSA": "Silver", "ZS": "Silver",
    "ZOA": "Orange", "ZO": "Orange",
    "DB": "Dark Blue", "BK": "Black", "WH": "White", "GR": "Green",
    "BLK": "Black", "WHT": "White", "GRN": "Green", "VIO": "Violet",
    "BLU": "Blue", "YEL": "Gold", "GRY": "Titanium Gray", "SLV": "Silver",
    "ORG": "Orange",
}


def resolve_samsung_model(model_code: Optional[str]) -> Optional[str]:
    """Resolves Samsung model code (e.g. SM-S928B) to marketing name."""
    if not model_code or not isinstance(model_code, str):
        return None
    clean = model_code.strip().upper()
    for pattern, name in SAMSUNG_PREFIX_RULES:
        if re.match(pattern, clean):
            return name
    return None


def resolve_marketing_name(
    model_code: Optional[str],
    manufacturer: Optional[str] = "Android",
    marketname: Optional[str] = ""
) -> Tuple[str, str]:
    """
    Resolves commercial brand and marketing name from model code, manufacturer, and marketname.
    Returns (brand, marketing_name).
    """
    clean_mfr = str(manufacturer).strip().title() if manufacturer else "Android"
    clean_model = str(model_code).strip() if model_code else ""
    clean_market = str(marketname).strip() if marketname else ""

    if clean_market and clean_market.lower() != clean_model.lower():
        resolved_brand = "Samsung" if "samsung" in clean_mfr.lower() else clean_mfr
        return resolved_brand, clean_market

    if clean_model.upper().startswith("SM-") or "samsung" in clean_mfr.lower():
        samsung_name = resolve_samsung_model(clean_model)
        if samsung_name:
            return "Samsung", samsung_name
        return "Samsung", f"Samsung {clean_model}" if clean_model else "Samsung Galaxy"

    if clean_model.upper() in XIAOMI_CODE_MAP:
        name = XIAOMI_CODE_MAP[clean_model.upper()]
        brand = "Redmi" if "Redmi" in name else ("POCO" if "POCO" in name else "Xiaomi")
        return brand, name

    if clean_model.upper() in OPPO_ONEPLUS_MAP:
        name = OPPO_ONEPLUS_MAP[clean_model.upper()]
        brand = "OnePlus" if "OnePlus" in name else ("Realme" if "Realme" in name else "Oppo")
        return brand, name

    if "pixel" in clean_model.lower():
        return "Google", clean_model

    return clean_mfr, f"{clean_mfr} {clean_model}".strip() if clean_model else clean_mfr


# ============================================================================
# Multi-OEM Color Resolver
# ============================================================================

def decode_samsung_product_code(product_code: Optional[str]) -> Optional[str]:
    """
    Decodes Samsung ril.product_code 3-letter suffix to standard color.
    Supports unsuffixed product codes (e.g. SM-S928BZKG) and full carrier SKUs
    with 3-letter CSC (e.g. SM-S928BZKGEUX).
    """
    if not product_code or not isinstance(product_code, str):
        return None
    code = product_code.strip().upper()

    # 1. Direct suffix match (e.g. SM-S928BZKG)
    for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
        if code.endswith(suffix):
            return color

    # 2. Match before 3-letter CSC (e.g. SM-S928BZKGEUX -> strip last 3 chars EUX)
    if len(code) > 6:
        stem = code[:-3]
        for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
            if stem.endswith(suffix):
                return color

    # 3. Match embedded 3-letter variant token in middle
    for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
        if len(suffix) == 3 and suffix in code:
            return color

    return None


def resolve_oem_color_from_props(
    props: Dict[str, Any],
    imei1: Optional[str] = None,
    model_code: Optional[str] = None,
    tac_lookup_fn: Optional[Callable[[str, str], Optional[str]]] = None
) -> str:
    """
    Comprehensive multi-OEM commercial color resolver:
    1. Direct vendor properties (ro.boot.hardware.color, ro.boot.hwc, ro.product.SystemColor, etc.)
    2. Samsung product code decoding (ril.product_code / ro.ril.product_code)
    3. SQLite TAC memory fallback (first 8 digits of imei1 + model_code)
    4. Default fallback: 'Unknown' or 'Standard'.
    """
    if not props:
        return "Unknown"

    # Property keys in priority order
    keys = [
        "ro.boot.hardware.color",
        "ro.boot.hwc",
        "ro.product.SystemColor",
        "persist.sys.color",
        "ro.hw.phone.color",
        "ro.boot.project_color",
        "ro.config.color",
        "persist.sys.oppo.color",
        "ro.boot.color",
        "ro.color",
    ]

    for k in keys:
        val = props.get(k)
        if val is not None:
            clean_val = str(val).strip()
            if clean_val and clean_val.lower() not in ("unknown", "null", "none"):
                # Normalize Pixel lowercase names if matched
                if k == "ro.boot.hardware.color" and clean_val.lower() in PIXEL_COLOR_MAP:
                    return PIXEL_COLOR_MAP[clean_val.lower()]
                return clean_val

    # Samsung product code decoding
    prod_code = props.get("ril.product_code") or props.get("ro.ril.product_code")
    if prod_code:
        decoded = decode_samsung_product_code(str(prod_code))
        if decoded:
            return decoded

    # SQLite TAC memory fallback
    if imei1 and model_code:
        tac_digits = re.sub(r"\D", "", str(imei1))
        if len(tac_digits) >= 8:
            tac = tac_digits[:8]
            if tac_lookup_fn:
                learned = tac_lookup_fn(tac, str(model_code))
                if learned:
                    return learned
            else:
                try:
                    from core.database import lookup_tac_color
                    learned = lookup_tac_color(tac, str(model_code))
                    if learned:
                        return learned
                except Exception:
                    pass

    return "Unknown"


# ============================================================================
# IMEI Parsing & Luhn Algorithm
# ============================================================================

def validate_luhn(imei: Optional[str]) -> bool:
    """
    Validates 15-digit IMEI with Luhn checksum algorithm (ITU-T E.118 / 3GPP TS 23.003).
    Rejects non-digits, incorrect lengths, and strings of 15 zeros.
    """
    if not imei or not isinstance(imei, str):
        return False
    digits = re.sub(r"\D", "", imei)
    if len(digits) != 15 or digits == "000000000000000":
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


def parse_imei_from_service_call(parcel_output: Optional[str]) -> Optional[str]:
    """
    Extracts 15-digit Luhn-validated IMEI from 'service call iphonesubinfo' parcel dump.
    Dual-Strategy:
    Strategy A: Decodes ASCII text characters between single quotes.
    Strategy B: Binary 32-bit hex word unpacking of UTF-16 code units (for truncated dumps).
    """
    if not parcel_output or not isinstance(parcel_output, str):
        return None

    # Strategy A: Quoted character dump
    matches = re.findall(r"'([^']*)'", parcel_output)
    if matches:
        raw_chars = "".join(matches)
        digits = re.sub(r"\D", "", raw_chars)
        if len(digits) >= 15:
            for i in range(len(digits) - 14):
                candidate = digits[i:i + 15]
                if candidate != "000000000000000" and validate_luhn(candidate):
                    return candidate
            # If Luhn failed, still test first 15 digits for non-zero candidate
            candidate = digits[:15]
            if candidate != "000000000000000" and validate_luhn(candidate):
                return candidate

    # Strategy B: Binary hex word unpacking
    hex_words = []
    for line in parcel_output.splitlines():
        line = line.strip()
        m = re.match(r'0x[0-9a-fA-F]{8}:\s+([0-9a-fA-F\s]+)', line)
        if m:
            words = m.group(1).split()
            for w in words:
                if re.match(r'^[0-9a-fA-F]{8}$', w):
                    hex_words.append(w)

    if len(hex_words) >= 3:
        try:
            length = int(hex_words[1], 16)
            if length >= 14:
                extracted_chars = []
                for word in hex_words[2:]:
                    val = int(word, 16)
                    char1 = chr(val & 0xFFFF)
                    char2 = chr((val >> 16) & 0xFFFF)
                    extracted_chars.extend([char1, char2])
                digits_b = "".join([c for c in extracted_chars if c.isdigit()])
                if len(digits_b) >= 15:
                    for i in range(len(digits_b) - 14):
                        candidate_b = digits_b[i:i + 15]
                        if candidate_b != "000000000000000" and validate_luhn(candidate_b):
                            return candidate_b
        except Exception:
            pass

    return None


OEM_IMEI_PROP_KEYS = [
    "ro.ril.oem.imei",
    "ro.ril.oem.imei1",
    "ro.ril.oem.imei2",
    "ril.IMEI",
    "ril.imei1",
    "ril.imei2",
    "persist.radio.imei",
    "persist.radio.imei1",
    "persist.radio.imei2",
    "ro.gsm.imei",
    "persist.sys.imei",
    "gsm.baseband.imei",
]


def extract_imei_from_properties(props: Dict[str, str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts 15-digit Luhn-validated IMEI 1 and IMEI 2 from OEM system properties dictionary.
    """
    imei1: Optional[str] = None
    imei2: Optional[str] = None

    for prop_key in OEM_IMEI_PROP_KEYS:
        val = props.get(prop_key, "")
        if not val:
            continue
        tokens = re.split(r'[,;\s|]+', val.strip())
        for token in tokens:
            cleaned = re.sub(r"\D", "", token)
            if len(cleaned) == 15 and validate_luhn(cleaned):
                if not imei1:
                    imei1 = cleaned
                elif cleaned != imei1 and not imei2:
                    imei2 = cleaned
                    return imei1, imei2

    return imei1, imei2


def extract_imei_from_fastboot(serial: str, fastboot_path: str) -> Tuple[str, Optional[str]]:
    """
    Queries fastboot getvar imei, imei1, imei2, and getvar all to extract Luhn-verified IMEIs.
    Returns (imei1, imei2).
    """
    imei1 = ""
    imei2: Optional[str] = None

    # 1. fastboot getvar imei
    _, out_imei, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei"], timeout=2.0)
    matches = re.findall(r'(\d{15})', out_imei)
    for m in matches:
        if validate_luhn(m):
            imei1 = m
            break

    # 2. fastboot getvar imei1
    if not imei1:
        _, out_imei1, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei1"], timeout=2.0)
        matches1 = re.findall(r'(\d{15})', out_imei1)
        for m in matches1:
            if validate_luhn(m):
                imei1 = m
                break

    # 3. fastboot getvar imei2
    _, out_imei2, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei2"], timeout=2.0)
    matches2 = re.findall(r'(\d{15})', out_imei2)
    for m in matches2:
        if validate_luhn(m) and m != imei1:
            imei2 = m
            break

    # 4. Fallback: fastboot getvar all
    if not imei1:
        _, out_all, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "all"], timeout=3.0)
        all_matches = re.findall(r'imei[12]?:\s*(\d{15})', out_all, re.IGNORECASE)
        valid_candidates = [c for c in all_matches if validate_luhn(c)]
        if valid_candidates:
            imei1 = valid_candidates[0]
            if len(valid_candidates) > 1 and valid_candidates[1] != imei1:
                imei2 = valid_candidates[1]

    if not imei1:
        imei1 = "Fastboot (Scan Barcode)"

    return imei1, imei2


# ============================================================================
# Battery, Bootloader & Fastboot Parsers
# ============================================================================

def parse_battery_info(dumpsys_battery_output: Optional[str]) -> Tuple[int, Optional[int], Optional[int]]:
    """
    Parses 'adb shell dumpsys battery'.
    Returns (level_percentage, health_percentage_or_none, cycle_count_or_none).
    """
    if not dumpsys_battery_output or not isinstance(dumpsys_battery_output, str):
        return 0, None, None

    clean = sanitize_adb_output(dumpsys_battery_output)
    if not clean:
        return 0, None, None

    level = 0
    scale = 100
    health_code: Optional[int] = None
    cycle_count = None
    asoc = None

    for line in clean.splitlines():
        line = line.strip()
        if line.lower().startswith("level:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().lstrip("-").isdigit():
                level = max(0, int(parts[1].strip()))
        elif line.lower().startswith("scale:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                scale = max(1, int(parts[1].strip()))
        elif line.lower().startswith("health:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                health_code = int(parts[1].strip())
        elif "cycle_count" in line.lower() or "msavedbatteryusage" in line.lower():
            match = re.search(r':\s*(\d+)', line)
            if match:
                cycle_count = int(match.group(1))
        elif "msavedbatteryasoc" in line.lower():
            match = re.search(r':\s*(\d+)', line)
            if match:
                asoc = int(match.group(1))

    calc_level = int((level * 100) / scale) if scale > 0 else level
    calc_level = max(0, min(100, calc_level))

    if asoc is not None:
        health_pct = max(0, min(100, asoc))
    elif health_code is not None:
        health_pct = 95 if health_code == 2 else 70
    else:
        health_pct = None

    return calc_level, health_pct, cycle_count


def parse_bootloader_status(flash_locked: str, verified_boot_state: str) -> Optional[bool]:
    """
    Parses ro.boot.flash.locked and ro.boot.verifiedbootstate.
    Returns True for locked, False for unlocked, None if undetermined.
    """
    fl = (flash_locked or "").strip().lower()
    vbs = (verified_boot_state or "").strip().lower()

    if fl in ("1", "true", "locked"):
        return True
    if fl in ("0", "false", "unlocked"):
        return False

    if vbs == "green":
        return True
    if vbs in ("orange", "yellow", "red"):
        return False

    return None


def parse_fastboot_devices(output: str) -> List[str]:
    """Parses 'fastboot devices' output, returning list of serial numbers."""
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
    """Queries fastboot getvar to construct DeviceSpecs."""
    _, out_prod, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "product"])
    _, out_lock, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "unlocked"])

    product_match = re.search(r'product:\s*(\S+)', out_prod, re.IGNORECASE)
    product = product_match.group(1) if product_match else "Fastboot Device"

    unlocked_match = re.search(r'unlocked:\s*(\S+)', out_lock, re.IGNORECASE)
    is_unlocked = unlocked_match.group(1).lower() in ("yes", "true", "1") if unlocked_match else False

    imei1, imei2 = extract_imei_from_fastboot(serial, fastboot_path)

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
        imei1=imei1,
        imei2=imei2,
        battery_health=None,
        battery_cycles=None,
        sales_region=None,
        bootloader_locked=(not is_unlocked),
        condition_grade="A",
        remarks="Device detected in Fastboot/Bootloader mode",
        raw_properties={"product": product, "unlocked": is_unlocked}
    )


# ============================================================================
# AdbReader Background Polling Class
# ============================================================================

class AdbReader:
    """
    Asynchronous Android and Fastboot extraction engine.
    Integrates portable ADB Key Vault and non-blocking background polling.
    """
    def __init__(self, adb_path: Optional[str] = None, fastboot_path: Optional[str] = None):
        self.adb_path = adb_path or get_binary_path("adb")
        self.fastboot_path = fastboot_path or get_binary_path("fastboot")
        self._stop_event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None
        self._last_device_id: Optional[str] = None
        self._last_connection_type: str = "none"

        # Initialize portable ADB key vault environment
        try:
            setup_adb_environment()
        except Exception as e:
            logger.debug(f"Portable ADB environment setup notice: {e}")

        # Unified callback interface
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[str], None]] = None

    def start_polling(self, interval: float = 2.0) -> None:
        """Starts background polling thread on specified interval."""
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

    def stop_polling(self) -> None:
        """Signals background thread to stop and waits for join."""
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=2.5)
            self._poll_thread = None

    def _polling_loop(self, interval: float) -> None:
        while not self._stop_event.is_set():
            try:
                specs = self.poll_once()
                current_id = specs.device_id if specs else None
                current_type = specs.connection_type if specs else "none"

                if current_id != self._last_device_id:
                    self._last_device_id = current_id
                    self._last_connection_type = current_type

                    if specs and specs.connection_type != "none":
                        if self.on_status_changed:
                            self.on_status_changed(specs.connection_type)
                        if self.on_device_connected:
                            self.on_device_connected(specs)
                    else:
                        if self.on_status_changed:
                            self.on_status_changed("none")
                        if self.on_device_disconnected:
                            self.on_device_disconnected()
            except Exception as e:
                logger.debug(f"AdbReader poll loop error: {e}")

            self._stop_event.wait(interval)

    def poll_once(self) -> Optional[DeviceSpecs]:
        """Performs a single synchronous detection check for ADB or Fastboot."""
        # 1. Check ADB devices
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

        # 2. Check Fastboot devices
        ret_fb, out_fb, _ = run_cmd([self.fastboot_path, "devices"], timeout=2.0)
        fb_serials = parse_fastboot_devices(out_fb)
        if fb_serials:
            return extract_fastboot_specs(fb_serials[0], self.fastboot_path)

        return None

    def extract_adb_device(self, serial: str) -> DeviceSpecs:
        """Queries ADB telemetry from connected device and constructs DeviceSpecs."""
        # Query getprop properties
        _, getprop_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "getprop"], timeout=3.0)
        props: Dict[str, str] = {}
        for line in getprop_out.splitlines():
            m = re.match(r'\[([^\]]+)\]:\s*\[([^\]]*)\]', line.strip())
            if m:
                props[m.group(1)] = m.group(2)

        model_code = props.get("ro.product.model", serial)
        manufacturer = props.get("ro.product.manufacturer", "Android")
        marketname = props.get("ro.product.marketname", "")
        brand, marketing_name = resolve_marketing_name(model_code, manufacturer, marketname)

        # Storage
        _, df_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "df", "-k", "/data"], timeout=2.5)
        storage = parse_storage_from_df(df_out)

        # RAM
        _, meminfo_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "cat", "/proc/meminfo"], timeout=2.0)
        ram = parse_ram_from_meminfo(meminfo_out)

        # Battery
        _, battery_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "dumpsys", "battery"], timeout=2.0)
        battery_level, battery_health, battery_cycles = parse_battery_info(battery_out)

        # Bootloader
        flash_locked = props.get("ro.boot.flash.locked", "")
        verified_boot = props.get("ro.boot.verifiedbootstate", "")
        bootloader_locked = parse_bootloader_status(flash_locked, verified_boot)

        # --------------------------------------------------------------------
        # Multi-Layer IMEI Extraction Ladder
        # --------------------------------------------------------------------
        imei1 = ""
        imei2: Optional[str] = None

        # Layer 1: Parcel Bypass with com.android.shell token
        _, parcel1, _ = run_cmd(
            [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "1", "s16", "com.android.shell"],
            timeout=2.0
        )
        candidate1 = parse_imei_from_service_call(parcel1)

        # Fallback without token for older Android 6-9
        if not candidate1:
            _, parcel1_leg, _ = run_cmd(
                [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "1"],
                timeout=2.0
            )
            candidate1 = parse_imei_from_service_call(parcel1_leg)

        if candidate1:
            imei1 = candidate1
            # Query secondary SIM for Dual-SIM devices (transaction indices 3, 4, 2)
            for idx in ["3", "4", "2"]:
                _, parcel2, _ = run_cmd(
                    [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", idx, "s16", "com.android.shell"],
                    timeout=2.0
                )
                candidate2 = parse_imei_from_service_call(parcel2)
                if not candidate2:
                    _, parcel2_leg, _ = run_cmd(
                        [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", idx],
                        timeout=2.0
                    )
                    candidate2 = parse_imei_from_service_call(parcel2_leg)
                if candidate2 and candidate2 != candidate1:
                    imei2 = candidate2
                    break

        # Fallback: dumpsys iphonesubinfo
        if not imei1:
            _, subinfo_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "dumpsys", "iphonesubinfo"], timeout=2.0)
            imei_matches = re.findall(r'(?:Device\s*ID|IMEI(?:\s*\[?\d+\]?)?)\s*[:=]\s*(\d{15})', subinfo_out, re.IGNORECASE)
            valid_subinfo = [m for m in imei_matches if validate_luhn(m)]
            if valid_subinfo:
                imei1 = valid_subinfo[0]
                if len(valid_subinfo) > 1 and valid_subinfo[1] != imei1:
                    imei2 = valid_subinfo[1]

        # Layer 2: OEM Property Matrix Fallback
        if not imei1:
            prop_imei1, prop_imei2 = extract_imei_from_properties(props)
            if prop_imei1:
                imei1 = prop_imei1
                if prop_imei2:
                    imei2 = prop_imei2

        if not imei1:
            imei1 = "Restricted (Scan Barcode)"

        # --------------------------------------------------------------------
        # Multi-OEM Color Resolver
        # --------------------------------------------------------------------
        color = resolve_oem_color_from_props(props, imei1=imei1, model_code=model_code)
        if color == "Unknown":
            color = props.get("ro.boot.hardware.color", "Standard")
            if color == "Unknown":
                color = "Standard"

        os_ver = f"Android {props.get('ro.build.version.release', '')}".strip()
        serial_no = props.get("ro.serialno") or props.get("ro.boot.serialno") or serial

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=marketing_name,
            model_code=model_code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial_no,
            imei1=imei1,
            imei2=imei2,
            battery_health=battery_health,
            battery_cycles=battery_cycles,
            sales_region=props.get("ro.csc.sales_code") or None,
            bootloader_locked=bootloader_locked,
            condition_grade="A+",
            remarks="",
            raw_properties=props
        )
```

---

## 5. Verification Plan

To verify that the implementation meets all requirements without breaking existing functionality:

1. **Unit Test Suite (`tests/test_adb_reader.py`)**:
   Add test cases covering:
   - `test_parcel_bypass_with_token`: Verifies parcel string parsing with both Strategy A (quoted) and Strategy B (hex words).
   - `test_luhn_rejection_of_all_zeros`: Confirms `000000000000000` is rejected.
   - `test_samsung_product_code_decoder`: Verifies `SM-S928BZKG` (Black), `SM-S928BZTA` (Titanium Gray), `SM-S928BZKGEUX` (Black with CSC).
   - `test_multi_oem_color_resolver`: Tests Xiaomi, Oppo, Pixel, and Huawei color resolution.
   - `test_oem_properties_matrix_fallback`: Tests extraction from `ro.ril.oem.imei`, `ril.IMEI`, etc.
   - `test_fastboot_imei_extraction`: Tests `extract_imei_from_fastboot`.
   Command: `python -m unittest tests/test_adb_reader.py`

2. **Full Tier 1–4 Test Suite**:
   Command: `python -m unittest discover tests`
   Must pass all 521+ tests with zero regressions.
