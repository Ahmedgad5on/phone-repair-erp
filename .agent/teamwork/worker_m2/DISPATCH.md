## 2026-11-08T16:45:04Z
You are teamwork_worker. Your assigned working directory is:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\worker_m2

MANDATORY FIRST STEP:
Read the authoritative user request at:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\Eng_Ahmed\Desktop\label\PROJECT.md
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\explorer_m2_1\analysis.md
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\explorer_m2_2\analysis.md
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\explorer_m2_3\analysis.md
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_hardware\spec_hardware_extraction.md

YOUR EXCLUSIVE WRITE OWNERSHIP:
- `core/paths.py`
- `core/adb_reader.py`
- `core/ios_reader.py`
- `core/device_detector.py`
- `tests/test_adb_reader.py`
- `tests/test_ios_reader.py`
- `tests/test_device_detector.py`

YOUR IMPLEMENTATION MISSION:
1. Portable ADB Key Vault (`core/paths.py` & `core/adb_reader.py`):
   - In `core/paths.py`: Implement `get_adb_keys_dir() -> Path` resolving `./data/adb_keys` relative to application root (frozen or dev).
   - Implement `setup_adb_environment() -> Dict[str, str]` setting `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` to the keys directory.
   - Implement `ensure_adb_keypair_exists() -> Tuple[Path, Path]` ensuring `adbkey` and `adbkey.pub` exist and are persistent.
   - In `core/adb_reader.py`: Call `setup_adb_environment()` in `run_cmd` and initialize vault in `AdbReader.__init__`.
2. Android Multi-Layer Extraction (`core/adb_reader.py`):
   - Implement Layer 1 parcel bypass with shell token: `service call iphonesubinfo 1 s16 com.android.shell` (IMEI 1) and `iphonesubinfo 3/4` (Dual-SIM IMEI 2).
   - Implement dual-strategy parcel parsing (regex ASCII clean + UTF-16 hex extraction).
   - Implement 15-digit Luhn checksum validation function `validate_luhn_imei(imei: str) -> bool`.
   - Implement Layer 2 OEM properties fallback matrix (`ro.ril.oem.imei`, etc.).
   - Implement Layer 3 Fastboot fallback (`fastboot getvar imei, imei1, imei2`).
   - Implement Samsung product code decoder (`ril.product_code` 3-letter variant/color mapping e.g. ZKG/ZKA=Black, ZWG/ZWA=White, ZGA=Green, ZVA=Violet, ZBA=Blue, ZDA=Gold, ZTA=Titanium Gray).
   - Implement decimal storage tiers mapping (32/64/128/256/512GB/1TB) from `df /data`.
3. iOS Telemetry Fixes (`core/ios_reader.py`):
   - Strip CLI banner noise before parsing raw XML in `calculate_ios_battery_health`.
   - Formula: `round((NominalChargeCapacity / DesignCapacity) * 100)` clamped to max 100%.
   - Ensure region parsing handles suffixes accurately (`LL/A`, etc.).
4. Zero-Click Background USB Detector (`core/device_detector.py`):
   - Production-grade Tri-Channel detector (WMI `__InstanceOperationEvent`, `adb track-devices`, periodic fallback).
   - 600ms debouncing.
   - Non-blocking `QThread` worker `DeviceDetectorWorker(QObject)` emitting signals (`specs_received`, `device_disconnected`, `status_changed`, `error_occurred`).
5. Tests & Verification:
   - Run `python -m unittest tests/test_adb_reader.py tests/test_ios_reader.py`.
   - Run `python -m unittest discover tests`.
   - Run `python -m unittest discover -s tests/e2e -p "test_*.py"`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

DOCUMENTATION:
- Write `handoff.md` in your working directory and notify the orchestrator via `send_message`.
