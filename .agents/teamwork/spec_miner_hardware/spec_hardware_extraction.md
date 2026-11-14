# Zero-Click Hardware Data Extraction Engine (Android & iOS)
## Comprehensive Technical Specification & Protocol Mining Document

---

## 1. Executive Summary & Architectural Overview

The **Zero-Click Hardware Data Extraction Engine** is a core subsystem of the Mobile Phone Sales & Repair Lab Thermal Label Application. Its primary objective is to autonomously detect, connect to, query, and extract comprehensive hardware telemetry from any connected Android (via ADB / Fastboot) or Apple iOS device (via `libimobiledevice`) immediately upon physical USB connection.

Extraction operates in a 100% non-blocking, zero-latency manner relative to the PyQt6 user interface. The user never needs to click "Refresh", "Detect", or "Query". When a technician connects a device via USB cable, the application detects the physical connection, negotiates communications, bypasses modern Android security fences (Android 6 through Android 16), queries hardware telemetry, resolves commercial retail marketing nomenclature, verifies checksums, and populates UI fields within **under 1.2 seconds**.

```
+=============================================================================+
|                      ZERO-CLICK HARDWARE EXTRACTION PIPELINE                |
+=============================================================================+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+------------------+                                      +------------------+
|  USB PHY Layer   |                                      | Windows WMI Host |
| (VBUS/Data Pins) |                                      | Win32_PnPEntity  |
+------------------+                                      +------------------+
         |                                                         |
         +----------------------------+----------------------------+
                                      |
                                      v
                      +-------------------------------+
                      |   Hybrid Connection Listener  |
                      |  - WMI Creation/Deletion Event|
                      |  - adb track-devices Stream   |
                      |  - idevice_id -l Fast Poller  |
                      |  - 600ms Jitter Debouncer     |
                      +-------------------------------+
                                      |
                                      v
                      +-------------------------------+
                      |   Connection State Machine    |
                      | [DISCONNECTED -> CONNECTING]  |
                      +-------------------------------+
                                      |
                +---------------------+---------------------+
                |                                           |
                v                                           v
+-------------------------------+           +-------------------------------+
|     Android / Fastboot Path   |           |           iOS Path            |
+-------------------------------+           +-------------------------------+
| 1. Portable Key Vault Active  |           | 1. usbmuxd / lockdown socket  |
| 2. Layer 1: Parcel Bypass     |           | 2. ideviceinfo -x (XML Plist) |
|    (service call iphonesubinfo|           | 3. AppleSmartBattery IOReg    |
| 3. Layer 2: OEM Props Matrix  |           | 4. ProductType / RAM Mapper   |
| 4. Layer 3: Fastboot getvar   |           | 5. Hex Color Resolver         |
| 5. Multi-OEM Color Resolver   |           | 6. Region Part Number Parser  |
| 6. df /data & meminfo Parsers |           | 7. Lockdown Error Handler     |
+-------------------------------+           +-------------------------------+
                |                                           |
                +---------------------+---------------------+
                                      |
                                      v
                      +-------------------------------+
                      |   Canonical DeviceSpecs Model |
                      |  - 15-Digit Luhn IMEI Verified|
                      |  - Commercial Storage Rounded |
                      |  - Clean Marketing Brand/Name |
                      |  - Battery Health & Cycles    |
                      +-------------------------------+
                                      |
                                      v
                      +-------------------------------+
                      |  QThread Thread-Safe Dispatch |
                      |   pyqtSignal(DeviceSpecs)     |
                      +-------------------------------+
                                      |
                                      v
                      +-------------------------------+
                      |  PyQt6 UI Specs & Print Auto  |
                      +-------------------------------+
```

---

## 2. Zero-Click Hardware Detection Architecture

### 2.1 Background Detection Strategy: Hybrid Polling vs. Event-Driven

Standard naive ADB / iOS polling approaches repeatedly invoke `adb devices` or `idevice_id -l` in tight loops. This causes CPU spikes, subprocess creation overhead (spawning new processes every 500ms), and potential console window flashing. The Zero-Click architecture uses a **tri-channel hybrid listener**:

1. **Channel A: Windows WMI PnP Device Event Interceptor (Zero-Latency Trigger)**
   - Connects to Windows Management Instrumentation (WMI) namespace `root\cimv2` using COM events via `win32com` / `pythoncom` or WQL event notification queries.
   - Listens for `__InstanceCreationEvent` and `__InstanceDeletionEvent` targeting `Win32_PnPEntity`.
   - Filters hardware hardware IDs by vendor prefixes:
     * **Apple Mobile Device VID**: `USB\VID_05AC`
     * **Android Google VID**: `USB\VID_18D1`
     * **Samsung Mobile VID**: `USB\VID_04E8`
     * **Xiaomi VID**: `USB\VID_2717`
     * **Oppo / Realme / OnePlus VID**: `USB\VID_22D9`
     * **Huawei / Honor VID**: `USB\VID_12D1`
     * **MediaTek Preloader / ADB VID**: `USB\VID_0E8D`
     * **Qualcomm HS-USB VID**: `USB\VID_05C6`
   - *Behavior*: When a USB cable is plugged in, Windows PnP manager notifies WMI within 10–50ms. WMI immediately fires a Python event, waking the worker thread to initiate protocol verification without waiting for a periodic timer tick.

2. **Channel B: ADB Device Streaming Socket (`host:track-devices`)**
   - Protocol specification: ADB client connects to the ADB server daemon over TCP loopback `127.0.0.1:5037`.
   - Client sends initial packet: `0012host:track-devices` (12 hex = 18 bytes: length prefix + command string).
   - Server responds with status: `OKAY` (4 bytes).
   - Server holds socket open indefinitely. Whenever an Android device state changes (plugged, unplugged, authorized, recovery, fastboot, sideload), the server pushes a 4-hex-digit length followed by the payload:
     ```
     0019R5CX109876U	device\n
     001f00008140-001928374650001E	offline\n
     0000 (empty when no devices connected)
     ```
   - *Advantage*: Zero CPU polling overhead. Notifications arrive asynchronously via socket read.

3. **Channel C: Asynchronous Periodic Backup Poller (1.0s Debounced Guard)**
   - Operates as a fail-safe fallback in the event that WMI service is disabled, blocked by restrictive Windows Group Policy (GPO), or if an intermediate USB hub absorbs PnP events.
   - Evaluates fast non-blocking status probes:
     * Fast `idevice_id -l` (execution time ~15–30ms).
     * Fast `fastboot devices` (execution time ~10–20ms).
     * ADB device cache verification.

### 2.2 PyQt6 Threading & QThread Architecture

To guarantee the PyQt6 GUI thread never stutters, drops frames, or triggers the Windows OS "Not Responding" dialog:

1. **Thread Isolation**:
   - `WorkerThread` subclasses `QObject` and is transferred to a dedicated `QThread` instance via `worker.moveToThread(thread)`.
   - Polling workers and subprocess executions run exclusively on this secondary OS thread.
2. **Subprocess Sandboxing**:
   - All CLI binary invocations (`adb.exe`, `fastboot.exe`, `ideviceinfo.exe`, `idevicediagnostics.exe`) specify Windows creation flag `CREATE_NO_WINDOW = 0x08000000`.
   - This suppresses temporary console prompt flash artifacts.
   - Every execution enforces a hard timeout of `3.0s` via `subprocess.run(..., timeout=3.0)` to prevent indefinite hangs on unresponsive hardware or broken USB cables.
3. **Thread-Safe Signal Communication**:
   - Telemetry data is packaged into an immutable `DeviceSpecs` dataclass and dispatched across thread boundaries strictly through `pyqtSignal`:
     * `specs_received = pyqtSignal(DeviceSpecs)`: Delivers verified hardware telemetry to UI.
     * `device_disconnected = pyqtSignal()`: Notifies UI to update status badge.
     * `status_changed = pyqtSignal(dict)`: Updates connection pill colors and diagnostic tooltips.
     * `error_occurred = pyqtSignal(str, str)`: Reports user-actionable lockdown prompts (e.g. "Tap Trust This Computer").

```
+--------------------------------------------------------------------------------+
|                               PyQt6 MAIN / GUI THREAD                          |
|                                                                                |
|  [Main Window] <------+                    +-------> [WYSIWYG Live Preview]    |
|  [Status Bar]  <---+  |                    |                                   |
|  [Specs Form]  <-+ |  |                    |                                   |
+------------------|-|--|--------------------|-----------------------------------+
                   | |  |                    |
        pyqtSignal | |  | pyqtSignal         | pyqtSignal
   specs_received  | |  | status_changed     | specs_received
                   | |  |                    |
+------------------|-|--|--------------------|-----------------------------------+
|                  | |  |                    |                                   |
|                  v v  v                    |                                   |
|  +--------------------------------------+  |                                   |
|  |           PollingWorker              |  |                                   |
|  |      (Moved to dedicated QThread)    |--+                                   |
|  +--------------------------------------+                                      |
|                     |                                                          |
|       +-------------+-------------+                                            |
|       |                           |                                            |
|       v                           v                                            |
| +-------------------+     +-------------------+                                |
| |   AdbReader       |     |   IOSReader       |                                |
| | (adb / fastboot)  |     | (libimobiledevice)|                                |
| +-------------------+     +-------------------+                                |
|                                                                                |
|                           BACKGROUND QTHREAD                                   |
+--------------------------------------------------------------------------------+
```

### 2.3 Debouncing, Reconnection & State Machine Transitions

USB physical plug insertions frequently generate transient electrical noise and rapid connection flaps (2–5 transitions within 200–400ms as physical pins seat). Without debouncing, the extraction engine would trigger multiple concurrent extraction processes, crashing ADB or causing race conditions.

#### Finite State Machine (FSM) States:
1. `DISCONNECTED`: No active device detected. Polling listeners listening.
2. `CONNECTING`: Device detected on physical bus. Debounce timer (600ms) initiated.
3. `CONNECTED_ANDROID_ADB`: Device recognized in ADB `device` state. Full extraction executing.
4. `CONNECTED_ANDROID_UNAUTHORIZED`: Device connected but RSA handshake pending user confirmation on screen.
5. `CONNECTED_FASTBOOT`: Device connected in bootloader / fastboot mode.
6. `CONNECTED_IOS_NORMAL`: iOS device recognized and paired via lockdownd.
7. `CONNECTED_IOS_LOCKED`: iOS device locked with passcode (`-17` error).
8. `CONNECTED_IOS_PAIRING_PENDING`: iOS device awaiting "Trust This Computer" confirmation (`-19` error).
9. `ERROR`: Hardware communication failure or broken descriptor.

```
       +-----------------------+
       |     DISCONNECTED      |<-----------------------------------+
       +-----------------------+                                    |
                   |                                                |
                   | USB Device Insertion (WMI / track-devices)     |
                   v                                                |
       +-----------------------+                                    |
       |      CONNECTING       |                                    |
       |  (Debounce 600ms)     |                                    |
       +-----------------------+                                    |
                   |                                                |
         +---------+---------+---------+                            |
         |                   |         |                            |
  [ADB Status]        [Fastboot]   [iOS Status]                     |
         |                   |         |                            |
         +--> device         |         +--> Paired                  | USB Disconnect
         |    |              |         |    |                       | (Any State)
         |    v              |         |    v                       |
         | +---------------+ |         | +---------------+          |
         | |CONNECTED_ADB  | |         | | CONNECTED_IOS |          |
         | +---------------+ |         | +---------------+          |
         |                   |         |                            |
         +--> unauthorized   |         +--> PasswordProtected (-17) |
         |    |              |         |    |                       |
         |    v              |         |    v                       |
         | +---------------+ |         | +---------------+          |
         | | UNAUTHORIZED  | |         | |  IOS_LOCKED   |          |
         | +---------------+ |         | +---------------+          |
         |                   |         |                            |
         |                   |         +--> TrustPending (-19)      |
         |                   v         |    |                       |
         |           +---------------+ |    v                       |
         |           |CONNECTED_FB   | | +---------------+          |
         |           +---------------+ | | PAIRING_PEND  |          |
         |                             | +---------------+          |
         |                             |                            |
         +-----------------------------+----------------------------+
```

#### Debounce Algorithm & Idempotency Rules:
- When a device is first detected with serial/UDID $S_1$, a timer of $T_{\text{debounce}} = 600\text{ ms}$ is started.
- If a disconnect occurs before $T_{\text{debounce}}$ expires, the transition is discarded as transient contact bounce.
- If $T_{\text{debounce}}$ elapses with device still connected:
  * Check `last_processed_serial`.
  * If $S_1 == \text{last\_processed\_serial}$ AND time since last extraction $< 2.0\text{s}$, suppress duplicate extraction (idempotent reconnection guard).
  * Otherwise, transition to the respective `CONNECTED_*` state and execute extraction ladder.

---

## 3. Portable ADB Key Vault Specification

### 3.1 Security & Portability Rationale

Standard Android Debug Bridge behavior stores RSA authentication keys in `%USERPROFILE%\.android\adbkey` (private key) and `adbkey.pub` (public key). In a mobile phone repair lab and retail store context, this causes major operational issues:
1. **Multi-User / Machine Switching**: If the software is deployed on a USB drive, moved to another repair bench PC, or run under different technician Windows user accounts, new ADB keys are generated.
2. **Re-Authorization Impediment**: Phones previously authorized by the store will suddenly present an authorization prompt: *"Allow USB debugging? The computer's RSA key fingerprint is..."*.
3. **Broken Screen Intake Barrier**: Customers frequently bring devices with broken, black, or unresponsive touch screens. If the RSA key changes, the technician **cannot** tap "Allow", completely blocking hardware extraction and diagnostic inspection!

### 3.2 Vault File Structure & Persistence

The Portable ADB Key Vault enforces strict local persistence inside the application directory structure:

```
[Application Root Directory]
├── bin/
│   ├── adb.exe
│   ├── AdbWinApi.dll
│   └── AdbWinUsbApi.dll
└── data/
    └── adb_keys/
        ├── adbkey          <-- 2048-bit RSA Private Key (OpenSSH / Android format)
        └── adbkey.pub      <-- Base64 RSA Public Key + Comment
```

Both files are marked with standard Windows user read/write file permissions. Because `./data/adb_keys` resides next to the executable (or in the designated local writable application directory resolved by `core.paths.get_app_data_dir()`), the keys persist indefinitely across app updates, folder moves, and Windows account changes.

### 3.3 Environment Variable Configuration

Prior to initiating any process execution with `adb.exe`, the process environment dictionary (`os.environ`) is injected with the following mandatory environment variables:

| Variable Name | Required Value | Technical Purpose |
|---------------|----------------|-------------------|
| `ANDROID_SDK_HOME` | `<AppDir>\data\adb_keys` | Legacy fallback for older ADB binaries directing base configuration root. |
| `ANDROID_PREFS_ROOT` | `<AppDir>\data\adb_keys` | Modern Android platform tools root pointing to preference storage. |
| `ADB_VENDOR_KEYS` | `<AppDir>\data\adb_keys\adbkey` | **Authoritative ADB Variable**. Points directly to the private RSA key file. ADB uses this key to sign auth authentication challenges sent by the device `adbd` daemon. Multiple keys can be separated by semicolons (`;`) on Windows. |
| `HOME` | `<AppDir>\data\adb_keys` | POSIX emulation fallback for MSYS2/Cygwin built ADB tools. |
| `USERPROFILE` (Isolated Subprocess Only) | `<AppDir>\data\adb_keys` | Overrides standard Windows user profile directory for the ADB subprocess environment only. |

#### Exact Environment Setup Code Pattern:
```python
def configure_portable_adb_environment() -> Dict[str, str]:
    keys_dir = os.path.abspath(os.path.join(get_app_data_dir(), "adb_keys"))
    os.makedirs(keys_dir, exist_ok=True)
    
    env = os.environ.copy()
    env["ANDROID_SDK_HOME"] = keys_dir
    env["ANDROID_PREFS_ROOT"] = keys_dir
    env["ADB_VENDOR_KEYS"] = os.path.join(keys_dir, "adbkey")
    return env
```

### 3.4 ADB Server Lifecycle Management & Port Clash Resolution

ADB architecture relies on a local background server daemon listening on TCP port `5037`. Port conflicts are common in mobile workshops due to competing tools (e.g. Samsung Smart Switch, 3uTools, Android Studio, emulator daemons).

#### Protocol for Lifecycle & Conflict Management:
1. **Version Mismatch Detection**:
   When invoking ADB commands, standard output / standard error may return:
   `"adb server version (41) doesn't match this client (40); killing..."`
   *Handling*: The parser detects `killing...` or `* daemon started successfully *`, sanitizes the response string, and retries the command after a 300ms backoff.
2. **Server Verification & Graceful Start**:
   - Check if daemon is active: `adb.exe start-server` with vault environment variables.
   - If port 5037 is held by an incompatible process:
     * Option A (Default): Execute `adb.exe kill-server`, sleep 400ms, execute `adb.exe start-server`.
     * Option B (Dedicated Port Isolation): Configure `ADB_SERVER_SOCKET=tcp:localhost:5038` in the injected environment dictionary, ensuring a completely isolated server daemon that never clashes with external software.

---

## 4. Android Multi-Layer Extraction Engine

### 4.1 Multi-Layer IMEI Extraction Hierarchy (Android 6 to 16)

Modern Android versions (Android 10+) strictly enforce SELinux access policies. `TelephonyManager.getDeviceId()` and `getImei()` require `READ_PRIVILEGED_PHONE_STATE`, a permission granted exclusively to platform-signed system apps. Standard ADB shell commands like `dumpsys iphonesubinfo` frequently return:
`SecurityException: Neither user 2000 nor current process has android.permission.READ_PRIVILEGED_PHONE_STATE`

The Zero-Click Engine implements a robust **3-Layer IMEI Extraction Hierarchy**:

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

#### Layer 1: Binder Parcel Bypass Protocol & Parsing
The Android Binder command-line tool `service call` talks directly to the `iphonesubinfo` IPC interface registered in `servicemanager`. Passing the caller identity token `s16 com.android.shell` (UTF-16 string representing the authorized shell package UID 2000) bypasses the client-side permission check on most Android versions up through Android 16!

- **Command Syntax**:
  * Primary SIM (IMEI 1):
    `adb shell service call iphonesubinfo 1 s16 com.android.shell`
    *(Fallback for Android 6–9: `adb shell service call iphonesubinfo 1`)*
  * Secondary SIM (IMEI 2 Dual-SIM):
    `adb shell service call iphonesubinfo 3 s16 com.android.shell`
    *(Alternative method index depending on chipset: `iphonesubinfo 4` or `iphonesubinfo 1 i32 2 s16 com.android.shell`)*

- **Raw Output Format (Binder Hex Parcel)**:
  ```
  Result: Parcel(
    0x00000000: 00000000 0000000f 00380033 00310035 '........3.5.8.9.'
    0x00000010: 00380032 00310031 00300032 00390033 '.0.1.2.3.4.5.6.7.'
    0x00000020: 00380034 00000036                   '.8.9.6..        ')
  ```

- **Protocol Breakdown of Parcel Byte Stream**:
  * `0x00000000`:
    - Word 0 (`00000000`): Binder status header (`0` = `NO_ERROR` / Transaction OK).
    - Word 1 (`0000000f`): Character length of UTF-16 payload in hex (`0x0000000f` = 15 characters).
    - Word 2 (`00380033`): Packed 32-bit integer containing two little-endian UTF-16 code units: `0x0033` ('3') followed by `0x0038` ('5').
    - Word 3 (`00310035`): Two UTF-16 code units: `0x0035` ('8') followed by `0x0031` ('1').
  * Quoted ASCII Field on Right:
    `'........3.5.8.9.'`: Notice the null byte (`0x00`) in UTF-16 renders as `.` in standard terminal dumps.

- **Deterministic Parcel Parsing Algorithm**:
  ```python
  def parse_imei_from_service_parcel(parcel_raw: str) -> Optional[str]:
      if not parcel_raw or "Result: Parcel" not in parcel_raw:
          return None
      
      # Strategy A: Extract quoted character regions and filter digits
      quoted_blocks = re.findall(r"'([^']*)'", parcel_raw)
      if quoted_blocks:
          combined_text = "".join(quoted_blocks)
          digits_only = re.sub(r"\D", "", combined_text)
          if len(digits_only) >= 15:
              candidate = digits_only[:15]
              if validate_luhn_checksum(candidate):
                  return candidate
      
      # Strategy B: Binary word unpacking (when ASCII dump is truncated)
      hex_words = []
      for line in parcel_raw.splitlines():
          line = line.strip()
          m = re.match(r'0x[0-9a-fA-F]{8}:\s+([0-9a-fA-F\s]+)\s+\'', line)
          if m:
              words = m.group(1).split()
              hex_words.extend(words)
      
      if len(hex_words) >= 3:
          # Word 1 is length
          try:
              length = int(hex_words[1], 16)
              if length == 15:
                  extracted_chars = []
                  for word in hex_words[2:]:
                      val = int(word, 16)
                      char1 = chr(val & 0xFFFF)
                      char2 = chr((val >> 16) & 0xFFFF)
                      extracted_chars.extend([char1, char2])
                  candidate = "".join([c for c in extracted_chars if c.isdigit()])[:15]
                  if len(candidate) == 15 and validate_luhn_checksum(candidate):
                      return candidate
          except Exception:
              pass
      return None
  ```

#### 15-Digit Luhn Checksum Validation Algorithm:
The 15th digit of an IMEI is a Check Digit calculated via the Luhn formula (mod 10). Validating this eliminates false positives from random memory strings.

$$\text{CheckDigit}(d_1 \dots d_{14}) = \left( 10 - \left( \sum_{i=1}^{14} f(i, d_i) \pmod{10} \right) \right) \pmod{10}$$
where:
$$f(i, d_i) = \begin{cases} d_i & \text{if } i \text{ is odd (1-indexed)} \\ 2d_i - 9 & \text{if } i \text{ is even and } 2d_i > 9 \\ 2d_i & \text{if } i \text{ is even and } 2d_i \le 9 \end{cases}$$

```python
def validate_luhn_checksum(imei: str) -> bool:
    digits = re.sub(r"\D", "", str(imei))
    if len(digits) != 15:
        return False
    total = 0
    for i, char in enumerate(digits):
        n = int(char)
        if i % 2 == 1:  # 0-indexed even is 1-indexed odd
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0
```

#### Layer 2: OEM Property Matrix Fallback
If Layer 1 is blocked by vendor kernel patches, query system properties via `adb shell getprop`:
1. `ro.ril.oem.imei` (HTC / Sony / Asus)
2. `ro.ril.oem.imei1` / `ro.ril.oem.imei2`
3. `ril.IMEI` / `ril.imei1` / `ril.imei2` (Samsung, MediaTek)
4. `persist.radio.imei` / `persist.radio.imei1` / `persist.radio.imei2` (Qualcomm reference)
5. `ro.gsm.imei`
6. `persist.sys.imei`
7. `gsm.baseband.imei`

*Matching Rule*: Extract value, split by comma or whitespace, strip non-digits. The first token satisfying `len == 15 and validate_luhn_checksum(token)` is assigned to `imei1`; any distinct second token is assigned to `imei2`.

#### Layer 3: Fastboot Bootloader Fallback
When a phone is bricked, in a boot loop, or booted into Fastboot mode:
- Query: `fastboot getvar imei`
- Query Dual-SIM: `fastboot getvar imei1`, `fastboot getvar imei2`
- Fallback: `fastboot getvar all` (search lines for `(bootloader) imei.*: (\d{15})`)

---

### 4.2 Multi-OEM Commercial Color Resolver

Smartphones do not have a standard `ro.color` property in AOSP. Instead, each major OEM stores the casing/enclosure color in custom bootloader flags or radio product codes. The Zero-Click Engine implements vendor-specific decoders:

#### 1. Samsung Product Code Decoder (`ril.product_code`)
On Samsung Galaxy devices, the baseband property `ril.product_code` contains the exact 14-character factory product code.
- **Format**: `[Model: 7-8 chars][Color/Variant: 2-3 chars][CSC Region: 3 chars]`
  * Example: `SM-S928BZKGEUX` -> Model `SM-S928B` (Galaxy S24 Ultra), Color code `ZKG`, CSC `EUX` (Europe).
- **Samsung Color Code Lookup Matrix**:

| Color Code Tokens | Commercial Marketing Color Name |
|-------------------|--------------------------------|
| `ZKG`, `ZKA`, `ZK`, `BLK` | Phantom Black / Titanium Black / Onyx Black |
| `ZWG`, `ZWA`, `ZW`, `WHT` | Cream / Cotton White / Titanium White |
| `ZGA`, `ZGG`, `ZG`, `GRN` | Titanium Green / Mint Green / Olive |
| `ZVA`, `ZVG`, `ZV`, `VIO` | Titanium Violet / Bora Purple / Lavender |
| `ZBA`, `ZBB`, `ZB`, `BLU` | Titanium Blue / Sky Blue / Sapphire Blue |
| `ZDA`, `ZDG`, `ZD`, `YEL` | Amber Yellow / Titanium Yellow / Gold |
| `ZTA`, `ZTG`, `ZT`, `GRY` | Titanium Gray / Graphite Gray |
| `ZSA`, `ZS`, `SLV` | Phantom Silver / Silver Shadow |
| `ZOA`, `ZO`, `ORG` | Sunset Orange / Coral |

#### 2. Xiaomi / Redmi / POCO Color Resolver
- Property Priority:
  1. `ro.boot.hwc` (Hardware Color token, e.g. `BLACK`, `BLUE`, `GOLD`, `GREEN`)
  2. `ro.product.SystemColor`
  3. `persist.sys.color`
  4. `ro.boot.color`

#### 3. Oppo / Realme / OnePlus Color Resolver
- Property Priority:
  1. `ro.hw.phone.color`
  2. `ro.boot.project_color`
  3. `ro.boot.hardware.color`
  4. `persist.sys.oppo.color`

#### 4. Google Pixel Color Resolver
- Property: `ro.boot.hardware.color`
- Standard Mappings:
  * `obsidian` -> Obsidian Black
  * `porcelain` -> Porcelain White
  * `bay` -> Bay Blue
  * `hazel` -> Hazel
  * `rose` -> Rose
  * `mint` -> Mint
  * `snow` -> Snow
  * `stormy_black` -> Stormy Black
  * `kinda_coral` -> Kinda Coral

#### 5. Huawei / Honor Color Resolver
- Property Priority: `ro.config.color`, `ro.hw.phone.color`

#### 6. SQLite TAC Memory Fallback
When all OEM properties fail or return generic strings (e.g. "Standard" or empty):
- The first 8 digits of any IMEI represent the **Type Allocation Code (TAC)**.
- Every device model and specific color batch shares the same TAC.
- Whenever a technician clicks one of the **8 Visual Color Chips** in Tab 1, the app writes `(tac_prefix, model_code, color)` to the SQLite table `tac_color_map`.
- If an unknown device of that same model and TAC is connected in the future, the engine automatically resolves the learned color from SQLite memory in **0.001 seconds**.

---

### 4.3 Storage, RAM, Serial & Battery Telemetry Extraction

#### Deterministic Commercial Storage Tier Rounding
Commercial phone manufacturers sell storage in decimal gigabytes ($1\text{ GB} = 10^9\text{ bytes}$). However, `df` inside Android Linux displays partition capacity of the `/data` filesystem in binary kibibytes (1K-blocks). Additionally, the system OS, recovery, and vendor partitions consume 10GB to 30GB of the flash chip before `/data` begins.

- **Command**: `adb shell df -k /data`
- **Calculation Formula**:
  $$\text{Decimal GB} = \frac{\text{1K-Blocks} \times 1024}{10^9}$$
- **Retail Partition Boundary Table**:

| Lower Bound (GB) | Upper Bound (GB) | Commercial Retail Tier | Typical Raw /data 1K-Blocks |
|------------------|------------------|------------------------|-----------------------------|
| $0.0$ | $\le 18.0$ | **16GB** | $10,000,000 - 15,000,000$ |
| $> 18.0$ | $\le 36.0$ | **32GB** | $22,000,000 - 30,000,000$ |
| $> 36.0$ | $\le 72.0$ | **64GB** | $48,000,000 - 60,000,000$ |
| $> 72.0$ | $\le 145.0$ | **128GB** | $105,000,000 - 122,000,000$ |
| $> 145.0$ | $\le 290.0$ | **256GB** | $220,000,000 - 250,000,000$ |
| $> 290.0$ | $\le 580.0$ | **512GB** | $450,000,000 - 510,000,000$ |
| $> 580.0$ | $\le 1150.0$ | **1TB** | $920,000,000 - 1,020,000,000$ |
| $> 1150.0$ | $\le 2300.0$ | **2TB** | $1,850,000,000 - 2,050,000,000$ |

#### Commercial RAM Calculation (/proc/meminfo)
Android Linux `MemTotal` excludes hardware carveouts for modem DSPs, GPU framebuffers, and hypervisor memory.
- **Command**: `adb shell cat /proc/meminfo`
- **Extraction**: Match regex `MemTotal:\s*(\d+)\s*kB`
- **Carveout Compensation Table**:

| Reported `MemTotal` (MB) | Commercial RAM Rating |
|--------------------------|-----------------------|
| $\le 2,300\text{ MB}$ | **2GB** |
| $2,301 - 3,400\text{ MB}$ | **3GB** |
| $3,401 - 4,600\text{ MB}$ | **4GB** |
| $4,601 - 6,800\text{ MB}$ | **6GB** |
| $6,801 - 9,500\text{ MB}$ | **8GB** |
| $9,501 - 14,000\text{ MB}$ | **12GB** |
| $14,001 - 19,000\text{ MB}$ | **16GB** |
| $19,001 - 28,000\text{ MB}$ | **24GB** |

#### Battery Metrics Parsing
- **Command**: `adb shell dumpsys battery`
- **Fields Extracted**:
  * `level: <int>`: Current battery charge percentage.
  * `scale: <int>`: Scale denominator (usually 100). $\text{Percent} = \frac{\text{level} \times 100}{\text{scale}}$.
  * `health: <int>`: Battery health status (2 = Good -> 95% default; other codes -> 70%).
  * `cycle_count: <int>`: Native Android 14+ HAL cycle count.
  * `mSavedBatteryAsoc: <int>`: Samsung Actual State of Charge (ASOC) = **Exact Battery Health %** (0–100).
  * `mSavedBatteryUsage: <int>`: Samsung lifetime charge cycle count.

---

## 5. iOS Telemetry Extraction Engine (libimobiledevice)

### 5.1 `ideviceinfo -x` XML Plist Protocol

The engine interfaces with Apple devices over USB using the `libimobiledevice` companion tool `ideviceinfo.exe`. Executing `ideviceinfo.exe -x` prompts the device `lockdownd` service to return an XML Property List (plist) conforming to Apple DTD:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductType</key>
    <string>iPhone17,2</string>
    <key>ProductVersion</key>
    <string>18.1</string>
    <key>SerialNumber</key>
    <string>H2LGD0987XMY</string>
    <key>UniqueDeviceID</key>
    <string>00008140-001928374650001E</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>358901230192830</string>
    <key>InternationalMobileEquipmentIdentity2</key>
    <string>358901230192848</string>
    <key>TotalDiskCapacity</key>
    <integer>256071352320</integer>
    <key>DeviceColor</key>
    <string>#505e6b</string>
    <key>DeviceEnclosureColor</key>
    <string>Desert Titanium</string>
    <key>ModelNumber</key>
    <string>MYWV3</string>
    <key>RegionInfo</key>
    <string>LL/A</string>
</dict>
</plist>
```

#### Extraction Key Mapping Table:

| Plist Key | Dataclass Field | Format / Parsing Rule |
|-----------|-----------------|-----------------------|
| `ProductType` | `marketing_name` / `model_code` | Mapped via ProductType dictionary (e.g. `iPhone17,2` -> `iPhone 16 Pro Max`). |
| `ProductVersion` | `os_version` | Prefixed with "iOS" (e.g. `iOS 18.1`). |
| `SerialNumber` | `serial_number` | Direct string (10–12 uppercase alphanumeric). |
| `UniqueDeviceID` | `device_id` | 40-hex chars or formatted UDID. |
| `InternationalMobileEquipmentIdentity` | `imei1` | Direct 15-digit string (validated via Luhn). |
| `InternationalMobileEquipmentIdentity2` | `imei2` | Direct 15-digit string for dual-SIM/eSIM. |
| `TotalDiskCapacity` | `storage` | Raw byte count -> Decimal Gigabytes ($B / 10^9$) mapped to retail tiers (128GB, 256GB, etc.). |
| `DeviceEnclosureColor` / `DeviceColor` | `color` | Hex or name string resolved via Color dictionary. |
| `ModelNumber` + `RegionInfo` | `model_code` / `sales_region` | Combined part number (e.g. `MYWV3LL/A`) and sales region decoded. |

---

### 5.2 Battery Diagnostics & Health % Derivation

Apple does not expose battery health in the standard root plist of `ideviceinfo`. The Zero-Click Engine queries the Apple Mobile Diagnostic Daemon using a 3-tier fallback ladder:

```
+=============================================================================+
|                      iOS BATTERY DIAGNOSTICS LADDER                         |
+=============================================================================+
                                      |
         +----------------------------v----------------------------+
         | TIER 1: idevicediagnostics ioregentry AppleSmartBattery |
         | Queries IORegistry power plane for battery controller   |
         +----------------------------+----------------------------+
                                      |
                         [Got XML Plist Response?]
                                      |
                       +--------------+--------------+
                       | YES                         | NO
                       v                             v
               [Parse Plist Keys]   +--------------------------------+
                                    | TIER 2: idevicediagnostics     |
                                    | diagnostics GasGauge           |
                                    +----------------+---------------+
                                                     |
                                        [Got XML Plist Response?]
                                                     |
                                      +--------------+--------------+
                                      | YES                         | NO
                                      v                             v
                              [Parse Plist Keys]   +----------------+----------------+
                                                   | TIER 3: ideviceinfo             |
                                                   | -q com.apple.mobile.battery -x  |
                                                   +----------------+----------------+
                                                                    |
                                                            [Extract Capacity]
```

#### Battery Health Calculation Formula:
When the XML plist is parsed via `plistlib.loads()`, the engine searches for the following dictionary keys:
1. `MaximumCapacityPercent`: Present on iOS 11.3+. If found and $1 \le \text{val} \le 100$, **this is the exact Apple Battery Health %**.
2. If `MaximumCapacityPercent` is omitted, calculate from GasGauge mAh:
   * `NominalChargeCapacity` (Current full charge capacity in mAh)
   * `DesignCapacity` (Factory design capacity in mAh)
   * Formula:
     $$\text{Battery Health \%} = \min\left(100, \max\left(0, \operatorname{round}\left( \frac{\text{NominalChargeCapacity}}{\text{DesignCapacity}} \times 100 \right)\right)\right)$$
     *(Clamping to 100 is mandatory because brand-new overprovisioned batteries may report Nominal > Design, e.g. 102%).*
3. `CycleCount`: Integer cycle count from gas gauge hardware counter.

---

### 5.3 Complete Apple ProductType Resolution Dictionary

The engine bundles a comprehensive mapping covering every iPhone generation up through the latest iPhone 16 family:

| ProductType Identifier | Commercial Marketing Name | Factory RAM Rating |
|------------------------|---------------------------|--------------------|
| `iPhone17,1` | **iPhone 16 Pro** | 8GB |
| `iPhone17,2` | **iPhone 16 Pro Max** | 8GB |
| `iPhone17,3` | **iPhone 16** | 8GB |
| `iPhone17,4` | **iPhone 16 Plus** | 8GB |
| `iPhone16,1` | **iPhone 15 Pro** | 8GB |
| `iPhone16,2` | **iPhone 15 Pro Max** | 8GB |
| `iPhone15,4` | **iPhone 15** | 6GB |
| `iPhone15,5` | **iPhone 15 Plus** | 6GB |
| `iPhone15,2` | **iPhone 14 Pro** | 6GB |
| `iPhone15,3` | **iPhone 14 Pro Max** | 6GB |
| `iPhone14,7` | **iPhone 14** | 6GB |
| `iPhone14,8` | **iPhone 14 Plus** | 6GB |
| `iPhone14,2` | **iPhone 13 Pro** | 6GB |
| `iPhone14,3` | **iPhone 13 Pro Max** | 6GB |
| `iPhone14,4` | **iPhone 13 mini** | 4GB |
| `iPhone14,5` | **iPhone 13** | 4GB |
| `iPhone14,6` | **iPhone SE (3rd Gen)** | 4GB |
| `iPhone13,1` | **iPhone 12 mini** | 4GB |
| `iPhone13,2` | **iPhone 12** | 4GB |
| `iPhone13,3` | **iPhone 12 Pro** | 6GB |
| `iPhone13,4` | **iPhone 12 Pro Max** | 6GB |
| `iPhone12,8` | **iPhone SE (2nd Gen)** | 3GB |
| `iPhone12,1` | **iPhone 11** | 4GB |
| `iPhone12,3` | **iPhone 11 Pro** | 4GB |
| `iPhone12,5` | **iPhone 11 Pro Max** | 4GB |
| `iPhone11,2` | **iPhone XS** | 4GB |
| `iPhone11,4`, `iPhone11,6` | **iPhone XS Max** | 4GB |
| `iPhone11,8` | **iPhone XR** | 3GB |
| `iPhone10,1`, `iPhone10,4` | **iPhone 8** | 2GB |
| `iPhone10,2`, `iPhone10,5` | **iPhone 8 Plus** | 3GB |
| `iPhone10,3`, `iPhone10,6` | **iPhone X** | 3GB |
| `iPhone9,1`, `iPhone9,3` | **iPhone 7** | 2GB |
| `iPhone9,2`, `iPhone9,4` | **iPhone 7 Plus** | 3GB |
| `iPhone8,4` | **iPhone SE (1st Gen)** | 2GB |
| `iPhone8,1` | **iPhone 6s** | 2GB |
| `iPhone8,2` | **iPhone 6s Plus** | 2GB |
| `iPhone7,2` | **iPhone 6** | 1GB |
| `iPhone7,1` | **iPhone 6 Plus** | 1GB |
| `iPhone6,1`, `iPhone6,2` | **iPhone 5s** | 1GB |
| `iPhone5,3`, `iPhone5,4` | **iPhone 5c** | 1GB |
| `iPhone5,1`, `iPhone5,2` | **iPhone 5** | 1GB |

---

### 5.4 Sales Region Parsing & Retail Mapping Table

Apple part numbers end with a 1-to-3 letter country code before `/A` indicating the target market, hardware variance (e.g. physical SIM vs eSIM, camera shutter lock):

| Region Token | Sales Region Description & Hardware Variance |
|--------------|----------------------------------------------|
| `LL/A` or `LL` | **USA (eSIM only on iPhone 14 / 15 / 16 series, mmWave 5G)** |
| `CH/A` or `CH` | **China Mainland (Dual physical nano-SIM, no FaceTime Audio)** |
| `ZP/A` or `ZP` | **Hong Kong / Macau / Singapore (Dual physical nano-SIM in HK)** |
| `J/A` or `J` | **Japan (Permanent hardware camera shutter sound)** |
| `KH/A` or `KH` | **South Korea (Camera shutter sound enforcement)** |
| `AE/A` or `AE` | **United Arab Emirates (UAE)** |
| `AB/A` or `AB` | **Egypt / Saudi Arabia / Middle East** |
| `B/A` or `B` | **United Kingdom / Ireland** |
| `ZD/A` or `ZD` | **Germany / Austria / Switzerland** |
| `FD/A` or `FD` | **France** |
| `EU/A` or `EU` | **European Union Open** |
| `HN/A` or `HN` | **India** |
| `VN/A` or `VN` | **Vietnam** |
| `MY/A` or `MY` | **Malaysia** |
| `X/A` or `X` | **Australia / New Zealand** |
| `C/A` or `C` | **Canada** |
| `TA/A` or `TA` | **Taiwan** |

---

### 5.5 Lockdown Error State Machine & Guidance

When an iPhone is connected via USB, communication with `lockdownd` may encounter device protection barriers. The engine traps return codes and standard error strings, presenting exact actionable instructions to the technician:

```
+-----------------------------------------------------------------------------------+
| iOS LOCKDOWN ERROR INTERCEPTION MATRIX                                            |
+------------------------------+--------------+-------------------------------------+
| Standard Error / Return Code | State Enum   | User Action Guidance                |
+------------------------------+--------------+-------------------------------------+
| "PasswordProtected" or "-17" | LOCKED       | "Device Locked - Enter Passcode on  |
|                              |              | iPhone Screen"                      |
+------------------------------+--------------+-------------------------------------+
| "PairingDialogResponse-      | TRUST_PENDING| "Tap 'Trust This Computer' on       |
| Pending" or "-19"            |              | iPhone Screen"                      |
+------------------------------+--------------+-------------------------------------+
| "UserDeniedPairing" or "-18" | DENIED       | "Pairing Denied - Re-plug cable and |
|                              |              | accept Trust prompt"                |
+------------------------------+--------------+-------------------------------------+
| Returncode != 0, empty out   | NO_RESPONSE  | "Lockdownd error - Verify cable or  |
|                              |              | Apple Mobile Device Service"        |
+------------------------------+--------------+-------------------------------------+
```

---

## 6. Automated Mock Device Framework

### 6.1 Mock Runner Interface Architecture

To ensure 100% test coverage and continuous integration without physical USB devices, the architecture abstracts CLI process execution behind a `CommandRunner` protocol. The mock device engine can operate in two distinct modes:

1. **Protocol Stream Mocking (`MockDeviceRunner`)**: Intercepts `run_cmd` subprocess calls and returns authentic raw CLI strings (exact Toybox `df`, hex `service call` parcels, XML plists).
2. **Interactive UI Mock Profiles**: Provides a UI combo-box in the Status Bar allowing instant switching between flagship devices for demoing, UI testing, and thermal label design calibration.

```python
class CommandRunner(typing.Protocol):
    def run(self, args: List[str], timeout: float = 3.0) -> Tuple[int, str, str]: ...

class MockDeviceRunner:
    """Simulates raw CLI stdout/stderr responses for ADB, Fastboot, and idevice tools."""
    def __init__(self, active_profile: str = "s24_ultra"):
        self.profile = active_profile
        self.call_history: List[List[str]] = []

    def run(self, args: List[str], timeout: float = 3.0) -> Tuple[int, str, str]:
        self.call_history.append(args)
        cmd_str = " ".join(args)
        
        # Route to simulated device output dictionaries...
```

### 6.2 Pre-Configured Mock Telemetry Fixtures

1. **Galaxy S24 Ultra (`mock_s24_ultra`)**:
   - Model: `SM-S928B`
   - Telemetry: 512GB Storage, 12GB RAM, Titanium Gray, Android 14, Battery 98%, 45 Cycles, EUX Region.
   - Dual-SIM Luhn IMEIs: `351782110293840` / `351782110293857`.
2. **iPhone 16 Pro Max (`mock_iphone16_promax`)**:
   - ProductType: `iPhone17,2`
   - Telemetry: 256GB Storage, 8GB RAM, Desert Titanium, iOS 18.1, Battery 100%, 12 Cycles, `LL/A` (USA eSIM).
   - Dual-SIM Luhn IMEIs: `358901230192830` / `358901230192848`.
3. **iPhone 15 Pro (`mock_iphone15_pro`)**:
   - ProductType: `iPhone16,1`
   - Telemetry: 128GB Storage, 8GB RAM, Natural Titanium, iOS 17.5, Battery 89%, 342 Cycles, `J/A` (Japan).
4. **Google Pixel 8 Pro Fastboot (`mock_fastboot_device`)**:
   - Product: `husky`
   - Telemetry: Fastboot mode, Bootloader Locked, Serial: `3A211FDH20000A`.

---

## 7. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Detection | WMI USB Event Interceptor | Real-time Win32_PnPEntity insertion/deletion listener | Windows PnP bus signals | Instant notification callback | Falls back to 1.0s periodic polling if WMI disabled | `ORIGINAL_REQUEST.md` R3, WMI API |
| 2 | Detection | ADB Device Streaming | `host:track-devices` persistent loopback socket stream | TCP loopback port 5037 | Real-time device state packets | Gracefully reconnects on socket drop | ADB Protocol Specification |
| 3 | Detection | Non-Blocking QThread Worker | Dedicated QThread isolates all subprocess I/O from UI | Polling triggers | `pyqtSignal` events to GUI thread | Thread interrupt token on window close | PyQt6 Architecture, `PROJECT.md` |
| 4 | Key Vault | Portable Vault Environment | Sets `ANDROID_SDK_HOME`, `ANDROID_PREFS_ROOT`, `ADB_VENDOR_KEYS` | Relative path `./data/adb_keys` | Isolated ADB environment | Automatically creates `./data/adb_keys` dir | `ORIGINAL_REQUEST.md` R3 |
| 5 | Key Vault | Key Pair Persistence | Retains `adbkey` / `adbkey.pub` across moves and reboots | Private/public RSA keys | Stable RSA fingerprint presented to devices | Auto-generates keypair if missing | ADB Cryptographic Protocol |
| 6 | Android IMEI | Binder Parcel Bypass (Layer 1) | `service call iphonesubinfo 1 s16 com.android.shell` bypasses Android 10-16 restrictions | Binder transaction call | UTF-16 Hex Parcel string | Falls back to Layer 2 if permission denied | AOSP IPC Binder Source Code |
| 7 | Android IMEI | Dual-SIM Parcel Parsing | Queries `iphonesubinfo 3` / `4` for secondary IMEI | Binder transaction call | Second 15-digit Luhn IMEI | Returns `None` if device is single-SIM | AOSP Telephony Subinfo Service |
| 8 | Android IMEI | Luhn Checksum Verifier | Mathematical validation of 15-digit IMEI check digit | 15-digit numeric string | Boolean (True/False) | Rejects corrupted or non-digit strings | ITU-T E.118 & 3GPP TS 23.003 |
| 9 | Android IMEI | OEM Property Matrix (Layer 2) | Fallback getprop inspection across 7 OEM property keys | Device `getprop` dictionary | 15-digit Luhn IMEI | Falls back to Layer 3 if properties empty | Vendor AOSP RIL Implementations |
| 10 | Android IMEI | Fastboot IMEI Query (Layer 3) | `fastboot getvar imei` for bootloader/bricked phones | Fastboot serial & command | IMEI string from bootloader | Emits "Fastboot (Scan Barcode)" fallback | Fastboot Protocol Spec |
| 11 | Color | Samsung Product Code Decoder | Decodes 3-letter color token from `ril.product_code` | Product code (e.g. `SM-S928BZKGEUX`) | Commercial color (e.g. "Titanium Black") | Falls back to TAC SQLite memory if code unknown | Samsung Radio Interface Layer |
| 12 | Color | Multi-OEM Property Resolver | Decodes properties for Xiaomi (`hwc`), Oppo (`phone.color`), Pixel (`hardware.color`) | System property values | Normalized color string | Falls back to generic "Standard" | Vendor AOSP Props Analysis |
| 13 | Color | SQLite TAC Memory Learning | First 8 digits of IMEI (TAC) + Model cached with color | User color chip click | Saved SQLite TAC mapping | Returns None if TAC not previously observed | Architecture Requirement R3/R5 |
| 14 | Telemetry | Commercial Storage Rounder | Maps `/data` 1K-blocks to 16/32/64/128/256/512GB/1TB/2TB | `df -k /data` output | Retail commercial tier string | Returns "Unknown" on permission error | Flash NAND Decimal vs Binary Specs |
| 15 | Telemetry | Commercial RAM Rounder | Maps `/proc/meminfo` MemTotal to 2/3/4/6/8/12/16/24GB | `cat /proc/meminfo` output | Retail commercial RAM string | Returns "Unknown" on unreadable meminfo | Linux Kernel Memory Manager |
| 16 | Telemetry | Battery Health & Cycle Extractor | Parses `dumpsys battery` level, scale, cycles, ASOC | dumpsys text dump | `(level, health_pct, cycles)` | Returns `(0, None, None)` on error | Android BatteryService Dumpsys |
| 17 | iOS Extraction | XML Plist Deserializer | `ideviceinfo -x` XML parsed via `plistlib.loads` | XML plist byte stream | Strongly typed `DeviceSpecs` | Traps `-17`, `-19`, `-18` lockdown errors | `libimobiledevice` Protocol Spec |
| 18 | iOS Battery | Diagnostics Battery Ladder | Fallback ladder: AppleSmartBattery -> GasGauge -> MobileBattery | Diagnostics XML plists | `(health_pct, cycle_count)` | Returns `(None, None)` if locked/denied | Apple MobileGestalt & IORegistry |
| 19 | iOS Resolution | ProductType Dictionary | Maps `iPhone1,1` through `iPhone17,4` to marketing name | ProductType string | Commercial name & RAM | Gracefully returns raw identifier if unknown | Apple Model Database |
| 20 | iOS Region | Part Number & Region Decoder | Splits `ModelNumber` & `RegionInfo` into retail market | Plist region tokens | Descriptive region string (e.g. "LL/A (USA eSIM)") | Retains raw token if code unrecognized | Apple Retail Sales SKU System |
| 21 | Testing | Automated Mock Engine | Complete simulated telemetry payloads for offline testing | Target mock profile string | Synthetic `DeviceSpecs` & raw CLI stdout | Supports automated headless test runners | `PROJECT.md` M1/M_FINAL |

---

## 8. Edge Cases & Failure Modes Matrix

| # | Feature | Input / Condition | Observed / Documented Engine Behavior |
|---|---------|-------------------|---------------------------------------|
| 1 | WMI Detection | WMI Service disabled or restricted by Windows GPO | Engine catches COM exception silently and seamlessly falls back to 1.0s periodic debounced polling loop. |
| 2 | USB Cable Flap | Cable loose, disconnecting and reconnecting 4 times in 250ms | 600ms debounce timer restarts on each bounce; query execution deferred until connection stabilizes. |
| 3 | ADB Version Clash | External 3uTools/emulator running ADB server version 41 vs bundled version 40 | Sanitizer filters `"killing..."` notices; engine restarts bundled server daemon without raising exceptions. |
| 4 | Android 14+ IMEI | `dumpsys iphonesubinfo` blocked by SELinux `READ_PRIVILEGED_PHONE_STATE` | Layer 1 Binder Parcel bypass invokes `service call` with token `s16 com.android.shell`, successfully bypassing restriction. |
| 5 | Binder Parcel Parsing | Truncated parcel output or missing ASCII representation on right | Parser falls back to 32-bit hex word binary unpacking, shifting and decoding UTF-16 code units directly. |
| 6 | IMEI Luhn Checksum | Phone returns tampered IMEI or invalid check digit (e.g. `358901234567895`) | `validate_luhn_checksum()` returns False; engine rejects candidate and attempts Layer 2 / Layer 3 extraction. |
| 7 | Storage Parsing | `df /data` returns permission denied on secure KNOX or locked work profile | Parser returns `"Unknown"`, allowing technician manual override or SQLite model lookup. |
| 8 | Samsung Color Code | Brand new unlisted Samsung model suffix in `ril.product_code` | Engine strips suffix, attempts 2-letter color matching; if unmatched, falls back to SQLite TAC memory. |
| 9 | iOS Passcode Locked | iPhone connected with lockscreen passcode active (`-17` error) | Engine traps returncode, suppresses unparsed plist error, and displays status pill: *"Device Locked - Enter Passcode on iPhone"*. |
| 10 | iOS Untrusted Host | iPhone connected for first time, awaiting "Trust" prompt (`-19` error) | Engine displays status pill: *"Tap 'Trust This Computer' on iPhone screen"*; auto-refreshes immediately once user taps Trust. |
| 11 | iOS Battery Overprovision | Brand-new iPhone where NominalChargeCapacity > DesignCapacity (e.g. 102%) | Engine clamps calculated percentage to exact maximum of `100%`, preventing invalid label print values. |
| 12 | Future iPhone Model | Unreleased Apple ProductType connected (e.g. `iPhone18,1`) | Resolver returns `"Unknown iPhone (iPhone18,1)"` without crashing; parses storage, color, serial, and battery normally. |

---

## 9. Verification & Automated Test Commands

To verify all hardware extraction components against the comprehensive specification:

```bash
# 1. Run complete unit test suite for ADB, Fastboot & Android extraction
python -m unittest tests/test_adb_reader.py

# 2. Run complete unit test suite for iOS extraction & libimobiledevice plists
python -m unittest tests/test_ios_reader.py

# 3. Run full E2E test suite (Tiers 1-5)
python -m unittest discover tests

# 4. Verify standalone mock device simulation profiles
python -c "from core.mock_device import MOCK_S24_ULTRA, MOCK_IPHONE16_PROMAX; print(MOCK_S24_ULTRA.marketing_name, MOCK_IPHONE16_PROMAX.marketing_name)"
```
