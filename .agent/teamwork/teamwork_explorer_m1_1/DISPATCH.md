## 2026-11-07T14:27:52Z
You are Explorer 1 for Milestone 1 (M1: Core Hardware Extraction Engine).

Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_1
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Project Specification Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md completely.

YOUR FOCUS FOR MILESTONE 1 (Android Extraction & Runtime Tooling):
1. Review findings from Phase 0 (`.agents/teamwork/teamwork_explorer_survey_2/analysis.md`).
2. Design the exact implementation specification for `core/paths.py` (runtime resolution for development and frozen PyInstaller `_MEIPASS` modes, locating `/bin` and `/data`).
3. Design the exact implementation specification for `core/models.py` (`DeviceSpecs` and `RepairTicket` dataclasses conforming to PROJECT.md interface contracts).
4. Design the setup for the `/bin` directory: exact copy commands and source paths to copy `adb.exe`, `fastboot.exe`, and companion DLLs from `C:\Users\Eng_Ahmed\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\` to `c:\Users\Eng_Ahmed\Desktop\label\bin\`.
5. Design `core/adb_reader.py`:
   - Polling thread loop (2-second interval, graceful stop flag).
   - `subprocess.Popen` / `run` wrapped with `CREATE_NO_WINDOW` (`creationflags=0x08000000`).
   - Daemon resilience (filtering out "daemon started" lines).
   - Model resolution: `ro.product.model`, `ro.product.manufacturer`, regex prefix mapping for Samsung (`SM-S928*` -> Galaxy S24 Ultra, `SM-A546*` -> Galaxy A54 5G), Xiaomi marketname fallback, Oppo/Realme resolver.
   - Storage parsing: deterministic boundary threshold mapping for `df /data` or `df -h /data` / `dumpsys diskstats` to commercial sizes (16GB, 32GB, 64GB, 128GB, 256GB, 512GB, 1TB).
   - RAM parsing: deterministic boundary threshold mapping for `/proc/meminfo` MemTotal to commercial sizes (2GB, 3GB, 4GB, 6GB, 8GB, 12GB, 16GB, 24GB).
   - IMEI 1 & 2 extraction: `service call iphonesubinfo 1`, `dumpsys iphonesubinfo`, `getprop gsm.baseband.imei`, with regex digit extraction and Luhn checksum validation.
   - Battery parsing: `dumpsys battery` (level, health, charge_counter, cycle_count).
   - Bootloader status: `ro.boot.flash.locked`, `ro.boot.verifiedbootstate`.
   - Fastboot mode detection: `fastboot devices` and parsing `fastboot getvar all` / `product`.

OUTPUT:
- Write your detailed implementation recommendation to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_1\analysis.md`.
- Write your structured completion report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_1\handoff.md`.
- Send a completion message to the parent orchestrator with reference to your handoff path.
REMEMBER: You are read-only. Do not write or modify source code files directly. Recommend fix and implementation strategies for the Worker.
