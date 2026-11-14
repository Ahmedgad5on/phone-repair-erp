## 2026-11-08T14:01:35Z
You are teamwork_spec_miner. Your assigned working directory is:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_hardware

MANDATORY FIRST STEP:
Read the authoritative user request at:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md

YOUR MISSION:
Mine and document exhaustive technical specifications, exact command formats, protocol parsing algorithms, and fallbacks for the Zero-Click Hardware Data Extraction Engine (Android & iOS).

SPECIFIC SPECIFICATION TOPICS TO DOCUMENT:
1. Zero-Click Hardware Detection Architecture:
   - Persistent background listener design using `adb track-devices`, `idevice_id -l`, and Windows WMI USB events (`Win32_PnPEntity`).
   - Threading / QThread architecture ensuring PyQt6 UI never blocks or freezes during detection or query commands.
   - Debouncing, reconnection, and state machine transitions (Disconnected -> Connecting -> Connected Android ADB / Fastboot / iOS Normal -> Error).
2. Portable ADB Key Vault:
   - Setting environment variables `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, `ADB_VENDOR_KEYS` pointing to `./data/adb_keys`.
   - Managing `adbkey` and `adbkey.pub` persistence across app folder moves and restarts.
   - Managing adb server lifecycle (`adb start-server`, `adb kill-server`, port conflicts).
3. Android Multi-Layer Extraction:
   - Multi-Layer IMEI (Android 6 to 16):
     * Layer 1 parcel bypass: `service call iphonesubinfo 1 s16 com.android.shell` (IMEI 1) and `iphonesubinfo 3 / 4` (Dual-SIM IMEI 2). Exact parsing logic for UTF-16 hex parcel format (e.g. `Result: Parcel(...)` with hex numbers). Full 15-digit Luhn checksum validation algorithm.
     * Layer 2 OEM properties: `ro.ril.oem.imei`, `ro.ril.oem.imei1`, `ro.ril.oem.imei2`, `ril.IMEI`, `persist.radio.imei`, `ro.gsm.imei`, `persist.sys.imei`.
     * Layer 3 Fastboot fallback: `fastboot getvar imei`, `imei1`, `imei2`.
   - Multi-OEM Color Resolver:
     * Xiaomi (`ro.boot.hwc`, `ro.product.SystemColor`, `persist.sys.color`).
     * Oppo/Realme/OnePlus (`ro.hw.phone.color`, `ro.boot.project_color`).
     * Pixel (`ro.boot.hardware.color`).
     * Huawei/Honor (`ro.config.color`).
     * Samsung Product Code Decoder (`ril.product_code` 3-letter variant/color mapping e.g. ZKG/ZKA=Black, ZWG/ZWA=White, ZGA=Green, ZVA=Violet, ZBA=Blue, ZDA=Gold, ZTA=Titanium Gray, etc.).
     * SQLite TAC memory fallback (first 8 digits of IMEI + Model).
   - Specs & Battery:
     * Commercial storage tier rounding (mapping `df /data` 1K-blocks or bytes to 32/64/128/256/512GB/1TB).
     * RAM extraction from `/proc/meminfo` (`MemTotal`).
     * Serial number (`ro.serialno` or `getprop no.such.serial`).
     * Battery metrics from `dumpsys battery` (level, charge counter, cycle count where available).
4. iOS Extraction:
   - `ideviceinfo` keys and format (`ProductType`, `ProductVersion`, `SerialNumber`, `InternationalMobileEquipmentIdentity`, `UniqueDeviceID`, `ModelNumber`, `DeviceColor`, etc.).
   - `idevicediagnostics ioregentry AppleSmartBattery` parsing for `CycleCount`, `DesignCapacity`, `NominalChargeCapacity` / `MaximumCapacityPercent` to derive exact Battery Health %.
   - Complete ProductType dictionary mapping (iPhone1,1 up to iPhone17,4 / iPhone 16 Pro Max).
   - Sales Region parsing from ModelNumber (e.g. `MQ8D3LL/A` -> `LL/A`, Middle East, etc.).
5. Automated Mock Device Framework:
   - Design mock ADB/Fastboot/idevice outputs and mock runner interface so full extraction logic can be thoroughly unit- and integration-tested without physical devices.
6. Documentation & Output:
   - Create and maintain `progress.md` in your working directory.
   - Write comprehensive spec to:
     `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_hardware\spec_hardware_extraction.md`
   - Write `handoff.md` and send completion message to orchestrator (`send_message`).
