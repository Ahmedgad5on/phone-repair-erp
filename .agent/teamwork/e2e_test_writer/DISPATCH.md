## 2026-11-08T14:19:53Z
You are teamwork_test_writer. Your assigned working directory is:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\e2e_test_writer

MANDATORY FIRST STEP:
Read the authoritative user request at:
c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\Eng_Ahmed\Desktop\label\PROJECT.md
c:\Users\Eng_Ahmed\Desktop\label\TEST_INFRA.md

YOUR MISSION:
Implement the comprehensive, requirement-driven, opaque-box E2E Test Suite (Tiers 1 through 4) in `tests/e2e/` according to `TEST_INFRA.md`.

REQUIREMENTS & TEST TIERS TO IMPLEMENT:
1. Tier 1 - Feature Coverage (≥5 tests per feature):
   - Exhaustively test each of the 21 features in `PROJECT.md § Feature Inventory` in isolation with clean equivalence class representatives.
2. Tier 2 - Boundary & Corner Cases (≥5 tests per feature):
   - Extreme inputs, max/min storage, invalid IMEIs (Luhn failure), empty customer fields, corrupt barcodes, missing battery keys, locked iOS devices, unsupported models, disconnected printer DC.
3. Tier 3 - Cross-Feature Combinations (Pairwise Interaction Coverage):
   - State-sharing and data-flow combinations (e.g. Dual-SIM extraction + 1-Click Color Chip + TAC learning + 38x25mm label rendering + SQLite stock logging; Barcode scanning in audit + real-time counter updates + Excel export + SQLite status mutation).
4. Tier 4 - Real-World Application Scenarios (all 11 realistic workloads in `TEST_INFRA.md § Real-World Application Scenarios`):
   - Scenario 1: Used iPhone Intake & Sales Labeling
   - Scenario 2: Dead Android Device Service Intake
   - Scenario 3: Dual-SIM Samsung S23 Auto-Extraction & TAC Learning
   - Scenario 4: Store Inventory Barcode Audit Session
   - Scenario 5: Small Label (38x25mm) Compact Smart Merge Printing
   - Scenario 6: Arabic Customer Name & Fault CTL Rendering
   - Scenario 7: Fastboot Unbrick Telemetry & Barcode Label
   - Scenario 8: Portable ADB Key Vault Persistence
   - Scenario 9: Brand Identity & Multi-Resolution Icon Export
   - Scenario 10: Stock Status Lifecycle Transition
   - Scenario 11: Excel Audit Integrity & Format Validation

5. Opaque-Box & Non-Destructive Principles:
   - Use mock devices (`core/mock_device.py`), virtual printer DC / PIL image buffers, and temporary/in-memory SQLite databases for isolation so tests do not rely on physical hardware.
   - Do NOT modify application implementation source files; write test code only under `tests/e2e/`.

6. Completion & Publication:
   - Run the E2E suite via `python -m unittest discover -s tests/e2e -p "test_*.py"` and ensure tests pass.
   - Once complete, create `c:\Users\Eng_Ahmed\Desktop\label\TEST_READY.md` at the project root summarizing test commands, counts, and tier breakdown as specified in TEST_INFRA.md.
   - Write `handoff.md` and message the orchestrator (`send_message`).
