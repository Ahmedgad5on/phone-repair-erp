## 2026-11-08T16:20:44Z
You are teamwork_explorer. Your assigned working directory is:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\explorer_m2_3

MANDATORY FIRST STEP:
Read the authoritative user request at:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\Eng_Ahmed\Desktop\label\PROJECT.md
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\spec_miner_hardware\spec_hardware_extraction.md (Section 2: Zero-Click Detection & Section 5: iOS Telemetry)

YOUR MISSION:
Investigate and design the exact technical implementation strategy for Milestone M2 - Focus on iOS Telemetry & Zero-Click Background Listener (`core/ios_reader.py` and `core/device_detector.py`):
1. iOS Telemetry Extraction:
   - `ideviceinfo` and `idevicediagnostics ioregentry AppleSmartBattery`.
   - Complete ProductType dictionary mapping up to iPhone 16 series (`iPhone17,1` to `iPhone17,4`).
   - Battery health % calculation: `NominalChargeCapacity / DesignCapacity * 100` (clamped to max 100%).
   - Sales Region parsing (e.g. `LL/A`, `Middle East`, etc.).
   - Cycle count, serial, IMEI, capacity, color.
2. Zero-Click Background USB Listener:
   - Persistent QThread monitoring without UI freezing.
   - WMI USB events (`SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity'`) or polling.
   - Debouncing transitions (connecting, connected ADB, Fastboot, iOS, disconnected).
3. Inspect current `core/ios_reader.py` and `core/device_detector.py`, identify any gaps vs `ORIGINAL_REQUEST.md`.
4. Output your analysis to `analysis.md` and deliver `handoff.md` in your working directory, then notify orchestrator via `send_message`.
NOTE: Do not modify source code directly. Propose the exact code changes in your report.
