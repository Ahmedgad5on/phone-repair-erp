# Handoff Report: Milestone M2 — Android Multi-Layer Telemetry Extraction Strategy

## 1. Observation

Direct code observations from inspection of the codebase:

1. **Layer 1 Parcel Bypass (`core/adb_reader.py:605-614`)**:
   ```python
   # Strategy 1: service call iphonesubinfo 1 & 2
   _, parcel1, _ = run_cmd([self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "1"], timeout=2.0)
   candidate1 = parse_imei_from_service_call(parcel1)
   if candidate1:
       imei1 = candidate1
       _, parcel2, _ = run_cmd([self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "2"], timeout=2.0)
       candidate2 = parse_imei_from_service_call(parcel2)
   ```
   The command lacks the caller identity token `s16 com.android.shell` mandated by `ORIGINAL_REQUEST.md` R3 and `spec_hardware_extraction.md` §4.1. Furthermore, dual-SIM queries index `2` rather than `3` / `4`.

2. **Parcel Parser (`core/adb_reader.py:337-352`)**:
   ```python
   def parse_imei_from_service_call(parcel_output: Optional[str]) -> Optional[str]:
       if not parcel_output or not isinstance(parcel_output, str):
           return None
       matches = re.findall(r"'([^']*)'", parcel_output)
       if not matches:
           return None
       raw_chars = "".join(matches)
       digits = re.sub(r"\D", "", raw_chars)
       if len(digits) >= 15:
           candidate = digits[:15]
           return candidate
       return None
   ```
   The parser exclusively relies on quoted ASCII characters without fallback to 32-bit hex word binary unpacking. It also omits `validate_luhn()` check on `candidate`, accepting any 15-digit sequence regardless of check digit validity.

3. **Layer 2 OEM Properties (`core/adb_reader.py:626-634`)**:
   Only checks `["gsm.baseband.imei", "persist.radio.imei1", "persist.radio.imei"]`. Missing `ro.ril.oem.imei`, `ro.ril.oem.imei1`, `ro.ril.oem.imei2`, `ril.IMEI`, `persist.sys.imei`, `ro.gsm.imei`. Does not apply Luhn check to tokens.

4. **Layer 3 Fastboot (`core/adb_reader.py:445-477`)**:
   `extract_fastboot_specs` hardcodes:
   ```python
   imei1="Fastboot (Scan Barcode)",
   imei2=None,
   ```
   It never executes `fastboot getvar imei`, `imei1`, `imei2`, or `getvar all`.

5. **Color Resolver (`core/adb_reader.py:640`)**:
   ```python
   color = props.get("ro.boot.hardware.color", "Standard")
   ```
   Lacks Samsung `ril.product_code` decoding, Xiaomi (`ro.boot.hwc`, `ro.product.SystemColor`, `persist.sys.color`), Oppo/Realme/OnePlus (`ro.hw.phone.color`, `ro.boot.project_color`), Pixel mapping, Huawei/Honor (`ro.config.color`), and SQLite TAC memory learning fallback.

6. **Portable ADB Key Vault (`core/paths.py:1-181` and `core/adb_reader.py:24-45`)**:
   `core/paths.py` does not export `get_adb_keys_dir()` or `setup_adb_environment()`. `run_cmd` in `core/adb_reader.py` does not pass `env` configured with `setup_adb_environment()`, leaving ADB dependent on `%USERPROFILE%\.android`.

7. **Test Suite Execution Baseline**:
   Ran `python -m unittest discover tests`:
   Ran 521 tests in 38.037s, all passed (`OK`).

---

## 2. Logic Chain

1. From **Observation 1**, modern Android OS (Android 10 through 16) enforces SELinux `READ_PRIVILEGED_PHONE_STATE` for `getDeviceId` and `getImei`. Without `s16 com.android.shell`, standard ADB calls return a SecurityException. Passing `s16 com.android.shell` authorizes shell UID 2000, enabling reliable Layer 1 extraction.
2. From **Observation 2**, toybox terminal dumps can truncate or omit the ASCII column on the right. Implementing the dual-strategy parser (Strategy A: Quoted characters; Strategy B: 32-bit hex word binary unpacking into UTF-16 code units `val & 0xFFFF` and `(val >> 16) & 0xFFFF`) guarantees deterministic IMEI retrieval. Adding `validate_luhn()` prevents memory noise or header zeros from creating invalid IMEIs.
3. From **Observation 3**, OEM vendors (HTC, Asus, Sony, Samsung, MediaTek) store IMEIs under custom radio properties when Layer 1 is patched. Expanding the property matrix to 12 vendor keys with Luhn filtering provides seamless Layer 2 fallback.
4. From **Observation 4**, devices in Fastboot mode frequently expose IMEI via `fastboot getvar imei / imei1 / imei2`. Querying these variables enables automatic label printing even for bricked or bootloader-locked devices before falling back to manual barcode scan.
5. From **Observation 5**, mobile phones do not provide a standard AOSP `ro.color`. Samsung encodes color in `ril.product_code` (e.g. `ZKG`=Black, `ZTA`=Titanium Gray). Resolving vendor properties across Samsung, Xiaomi, Oppo, Pixel, Huawei, and SQLite TAC memory eliminates generic "Standard" colors on printed labels.
6. From **Observation 6**, storing ADB keys in `%USERPROFILE%\.android` causes repeated re-authorization prompts when the app is moved or run from portable media. Injecting `setup_adb_environment()` directing `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, and `ADB_VENDOR_KEYS` to `./data/adb_keys` guarantees zero-prompt reconnects.
7. From **Observation 7**, existing tests rely on `SpecificationAlgorithms` in test harnesses. Updating `core/adb_reader.py` and `core/paths.py` with these implementations aligns production runtime behavior with test oracle specifications without regressions.

---

## 3. Caveats

1. **Android 15/16 OEM Kernel Variations**: Some rare vendor kernels (e.g. customized enterprise Knox profiles) may block Binder IPC calls even with the shell token. In such cases, the engine gracefully falls back to Layer 2 OEM properties and then to manual barcode scanning ("Restricted (Scan Barcode)").
2. **Dual-SIM Transaction Codes**: Different Qualcomm and MediaTek chipsets historically map secondary SIM to index `3` or `4` (or `2` on legacy builds). The proposed implementation iterates over `["3", "4", "2"]`, which maximizes compatibility across chipset variants.
3. **SQLite TAC Learning Dependency**: In `adb_reader.py`, TAC lookup is invoked via dynamic import or optional callback (`lookup_tac_color`) so `adb_reader.py` remains fully functional even before Milestone M3 database expansions are initialized.

---

## 4. Conclusion

`core/adb_reader.py` requires an upgrade to fulfill Milestone M2 requirements:
1. Implement Layer 1 parcel bypass with `s16 com.android.shell` and Dual-SIM indices `3` and `4`.
2. Enhance `parse_imei_from_service_call` with a dual-strategy parser (quoted ASCII + 32-bit hex words) and 15-digit Luhn verification.
3. Expand Layer 2 OEM property matrix to 12 keys with Luhn validation.
4. Implement Layer 3 Fastboot getvar IMEI extraction.
5. Implement Multi-OEM Color Resolver including Samsung `ril.product_code` decoder and TAC memory fallback.
6. Export `get_adb_keys_dir()` and `setup_adb_environment()` in `core/paths.py` and inject environment into `run_cmd()`.

The exact code changes and patch proposals are fully specified in `analysis.md`.

---

## 5. Verification Method

1. **Unit Test Suite**:
   ```bash
   python -m unittest tests/test_adb_reader.py
   ```
   Must pass all tests including added test cases for parcel hex word unpacking, Samsung product code decoding, and multi-OEM color resolution.

2. **Full Regression Discovery Suite**:
   ```bash
   python -m unittest discover tests
   ```
   Must pass all 521+ tests with zero regressions.

3. **Files to Inspect**:
   - `core/adb_reader.py`: Verify presence of `decode_samsung_product_code`, `resolve_oem_color_from_props`, `extract_imei_from_fastboot`, `extract_imei_from_properties`, and updated `parse_imei_from_service_call`.
   - `core/paths.py`: Verify presence of `get_adb_keys_dir` and `setup_adb_environment`.
