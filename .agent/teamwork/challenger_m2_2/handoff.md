# Handoff Report — Empirical Challenger 2 (Milestone M2)

**Agent**: teamwork_challenger (`challenger_m2_2`)  
**Parent / Dispatcher**: `9c9a6d6c-cf83-4608-838b-5dbc0e8a9dae`  
**Milestone**: M2 (Hardware Extraction & Zero-Click USB Detection)  
**Date**: 2026-11-08T20:03:00Z  
**Verdict**: **APPROVE**

---

## 1. Observation

### Implementation Files Inspected
1. **`core/ios_reader.py`**:
   - `calculate_ios_battery_health(battery_data_or_bytes: Any)` (lines 345–425):
     - Resilient XML extraction uses `xml_start = payload.find(b"<?xml")` (falling back to `<plist`) and `xml_end = payload.rfind(b"</plist>")`, extracting `payload[xml_start : xml_end + 8]`.
     - Handles malformed/truncated XML cleanly with `try: plistlib.loads(...) except Exception: return None, None`.
     - Key lookup uses recursive traversal `find_key(obj, key)` supporting arbitrary dictionary nesting and list nesting.
     - Formula: `calculated = (nom / des) * 100` guarded with `des > 0`, clamped to `[0, 100]` via `min(100, max(0, int(round(calculated))))`.
     - `MaximumCapacityPercent` evaluated with boundary filter `1 <= parsed_max_pct <= 100`; out-of-range or 0 values fall back to `NominalChargeCapacity / DesignCapacity`.
   - `parse_apple_part_and_region(model_num: Optional[str], region_info: Optional[str])` (lines 318–343):
     - Normalizes bare region code `len(region) <= 3` to `{region}/A`.
     - Checks `re.search(r'([A-Z]{1,3}/A)$', model)` to identify if part number already contains a region suffix.
     - Checks `model.endswith(region.replace("/A", ""))` to prevent duplicate bare code combinations.
     - Safely returns `(model, final_region)`.

2. **`core/device_detector.py`**:
   - `DeviceDetectorWorker(QObject)` (lines 82–392):
     - Tri-channel detection: Channel A (Windows WMI `Win32_PnPEntity` notification query for mobile VIDs `05AC`, `18D1`, `04E8`, `2717`, etc.), Channel B (persistent ADB `host:track-devices` streaming socket on `127.0.0.1:5037`), and Channel C (fallback polling timer / thread).
     - 600ms software debouncing via `time.sleep(0.6)` in WMI and track-devices stream workers.
     - Idempotency guard: `if current_id != self._last_device_id or (now - self._last_processed_time) > 2.0:` suppresses duplicate queries for identical devices within 2.0 seconds.
     - State reset on disconnect: when `active_specs` becomes `None`, `self._last_device_id = None`, emitting `device_disconnected` and resetting idempotency for immediate reconnect.
     - Mock mode switching: `set_mock_mode()` properly transitions among `"mock_s24"`, `"mock_iphone16"`, `"mock_fastboot"`, and `"mock_offline"`.
     - Signal and callback dual dispatch: emits Qt signals (`specs_received`, `device_disconnected`, `status_changed`, `error_occurred`) and invokes headless Python callbacks (`on_device_connected`, `on_device_disconnected`, `on_status_changed`, `on_error`).

### Empirical Verification Test Results
Executed programmatically via `python -m unittest tests/test_challenger_m2_2.py`:
```
..................................
----------------------------------------------------------------------
Ran 34 tests in 4.915s

OK
```

All 34 stress and boundary tests passed with zero failures:
1. **`calculate_ios_battery_health`**:
   - Prepended CLI banners before `<?xml`: PASSED (returns exact health & cycles).
   - Prepended status noise before `<plist`: PASSED.
   - Prepended banner containing fake XML tags: PASSED.
   - Missing closing `</plist>` tag: PASSED (safely returns `(None, None)` without throwing exceptions).
   - Corrupted closing tag `</plis>`: PASSED (returns `(None, None)`).
   - Empty/garbage input (`b""`, `None`, int, list): PASSED (returns `(None, None)`).
   - Nominal > Design overprovisioning (3500/3200 -> 109%, 5000/2500 -> 200%): PASSED (clamped to 100%).
   - Negative nominal capacity (`Nominal = -500, Design = 3000`): PASSED (clamped to 0%).
   - Zero nominal capacity (`Nominal = 0, Design = 3000`): PASSED (0%).
   - Zero design capacity (`Nominal = 3000, Design = 0`): PASSED (returns `(None, cycles)`, zero division prevented).
   - Negative design capacity (`Nominal = 3000, Design = -3000`): PASSED (returns `(None, cycles)`).
   - Both zero: PASSED (returns `(None, None)`).
   - Deeply nested plist dictionaries/lists: PASSED (keys extracted recursively).
   - Stringified numbers (`"3100"`, `"3274"`, `"150"`): PASSED.
   - Stringified invalid numbers: PASSED (safely returns `(None, None)`).

2. **`parse_apple_part_and_region`**:
   - Standard region codes: `LL/A`, `ZP/A`, `B/A`, `J/A`, `KH/A`, `CH/A`: PASSED.
   - Bare codes expanded: `LL` -> `LL/A`, `ZP` -> `ZP/A`, `B` -> `B/A`, `J` -> `J/A`, `KH` -> `KH/A`, `CH` -> `CH/A`: PASSED.
   - Pre-combined part numbers: `MYWV3LL/A` with `LL/A`, `MLQ73ZP/A` with `ZP/A`, `MN9D2B/A` with `B/A`, `MG8Y3J/A` with `J/A`, `MQ9X3KH/A` with `KH/A`, `MU1E3CH/A` with `CH/A`: PASSED (zero double-suffix duplications like `MYWV3LL/ALL/A`).
   - Pre-combined with bare region info or `None`: `MYWV3LL/A` with `None` -> `("MYWV3LL/A", "LL/A")`: PASSED.
   - Part numbers ending in bare region code: `MYWV3LL` + `LL/A` -> `("MYWV3LL/A", "LL/A")`: PASSED.
   - Extended regions: `AB/A` (Middle East), `FD/A` (France), `VN/A` (Vietnam), `HN/A` (India): PASSED.
   - Edge cases (`None`, `""`, empty strings): PASSED.

3. **`DeviceDetectorWorker`**:
   - Mock mode switching cycle (`mock_s24` -> `mock_iphone16` -> `mock_fastboot` -> `mock_offline` -> `mock_s24`): PASSED (all status flags and dataclasses matched).
   - Rapid connect/disconnect stress test: 20 rapid flips between connected and offline yielded exactly 20 connected events and 20 disconnected events: PASSED (no dropped events, no deadlocks).
   - Idempotency guard (<2s repeated serial): 15 consecutive triggers in <0.1s for same device yielded exactly 1 emitted event: PASSED (14 suppressed).
   - Idempotency expiration: elapsed time >2s re-enables event emission for same device: PASSED.
   - Serial change override: changing device serial immediately emits new event even if <2s: PASSED.
   - Qt signals vs Python callbacks parity: identical payloads received by both: PASSED.
   - Debouncing: 600ms sleep confirmed in WMI and track-devices listener loops: PASSED.
   - Concurrency & lifecycle: 5 threads firing triggers concurrently and multiple start/stop polling calls executed safely without exceptions: PASSED.

---

## 2. Logic Chain

1. **iOS Battery Health Robustness**:
   - Observation: `calculate_ios_battery_health` slices XML using byte offsets `xml_start` and `xml_end` and wraps deserialization in `try...except`.
   - Inference: CLI banner text prepended by libimobiledevice tools cannot corrupt XML parsing because non-XML prefixes before `<?xml` or `<plist` are omitted. Truncated XML lacking `</plist>` cleanly triggers the exception handler, returning `(None, None)`.
   - Observation: The calculation arithmetic uses `min(100, max(0, int(round(calculated))))` guarded by `des > 0`.
   - Inference: Overprovisioned capacities (`Nominal > Design`) are clamped to 100%. Division by zero is impossible when `DesignCapacity <= 0`. Negative nominal values clamp to 0%.

2. **Apple Part & Region Deduplication**:
   - Observation: `parse_apple_part_and_region` applies regex `([A-Z]{1,3}/A)$` to detect pre-existing region codes in the model string.
   - Inference: Pre-combined part numbers like `MYWV3LL/A` preserve their suffix without appending another `/A` or region string. Bare codes like `LL` are normalized to `LL/A`.

3. **DeviceDetectorWorker Reliability**:
   - Observation: Rapid switching of mock modes triggers discrete, paired connect and disconnect events.
   - Inference: The state machine accurately tracks `_last_device_id` and cleanly emits disconnect signals when active specs become `None`.
   - Observation: The idempotency guard compares `current_id != self._last_device_id or (now - self._last_processed_time) > 2.0`.
   - Inference: Rapid repeated queries on the same connected device do not flood the UI with duplicate signals. When the device disconnects or is replaced, the check immediately passes.

---

## 3. Caveats

- Physical USB contact bounce on real hardware involves analog electrical fluctuations; this was evaluated via source-level verification of the 600ms sleep debounce and simulated rapid event loops.
- No caveats regarding software correctness or interface contracts.

---

## 4. Conclusion

**Verdict: APPROVE**

The iOS hardware extraction logic (`calculate_ios_battery_health`, `parse_apple_part_and_region`, `decode_apple_region`) and `DeviceDetectorWorker` state machine fully withstand empirical adversarial testing across all specified stress vectors. All 34 adversarial tests in `tests/test_challenger_m2_2.py` and all 97 combined M2 unit tests pass with 100% success.

---

## 5. Verification Method

To independently reproduce and verify this assessment:

```powershell
# 1. Run Challenger 2 empirical test suite (34 tests)
python -m unittest tests/test_challenger_m2_2.py

# 2. Run all M2 extraction and detector unit tests (97 tests)
python -m unittest tests/test_adb_reader.py tests/test_ios_reader.py tests/test_device_detector.py tests/test_challenger_m2_2.py
```
