## 2026-11-07T16:03:57Z
You are the Worker for Milestone 1 Iteration 2 (M1 Remediation).

Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m1_r2
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Project Specification Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md completely.

REMEDIATION BLUEPRINTS TO READ AND IMPLEMENT:
1. `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_r2_1\analysis.md`
2. `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_r2_3\handoff.md` and `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_m1_r2_3\core_adb_reader.patch`

FILES OWNED BY YOU (EXCLUSIVE WRITE OWNERSHIP):
- `core/ios_reader.py`
- `core/adb_reader.py`
- `tests/test_adversarial_m1.py`

TASKS:
1. Apply the drop-in patches to `core/ios_reader.py`:
   - `resolve_apple_model`: Add guard `if not product_type or not isinstance(product_type, str): return "Apple Device"`.
   - `calculate_ios_battery_health`: Cast `nominal_cap` and `design_cap` to float in try-except block, support `nom == 0` (depleted batteries), and safely parse `cycles`.
   - `parse_ideviceinfo_xml`: Add guard `if not isinstance(plist, dict): return None` and robust multi-type conversion for `TotalDiskCapacity`.
2. Apply the drop-in patches to `core/adb_reader.py`:
   - `parse_battery_info`: Ensure empty output or failed dumpsys returns `(0, None, None)` by initializing `health_code: Optional[int] = None` and checking `if not clean: return 0, None, None`.
   - `parse_storage_from_df`: Add upfront defensive guard for `None` or non-str, and search `clean` instead of `df_output`.
   - `resolve_samsung_model` & `resolve_marketing_name`: Guard against `model_code=None` and `manufacturer=None` before `.strip()`.
3. Run the test suite:
   - `python -m unittest tests/test_adversarial_m1.py -v` (Must pass 23/23 tests!)
   - `python -m unittest discover tests -v` (Must pass all 273 tests!)
4. Document test commands and verbatim outputs in your handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

OUTPUT:
- Write your completion handoff report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_worker_m1_r2\handoff.md`.
- Send a completion message to the parent orchestrator with reference to your handoff path.
