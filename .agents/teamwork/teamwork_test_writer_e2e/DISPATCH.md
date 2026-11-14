## 2026-11-07T14:29:20Z
From: 70b940b4-7f9a-48a3-bfe3-7b5686c9a37b (orchestrator)
Content:
You are the E2E Test Writer (teamwork_test_writer) for the Mobile Phone Sales & Repair Lab Thermal Label Application.

Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_test_writer_e2e
Parent Orchestrator Working Directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\orchestrator
Original Request Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md
Project Specification Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md
Test Infrastructure Plan Path: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\TEST_INFRA.md

MANDATORY FIRST STEP:
Read c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md, c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\PROJECT.md, and c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\TEST_INFRA.md completely.

YOUR MISSION:
Implement the foundational E2E Testing Framework in `tests/e2e/` based strictly on user requirements and opaque-box specifications:
1. `tests/e2e/test_harness.py`:
   - Headless test execution environment (supporting `QT_QPA_PLATFORM=offscreen`).
   - Mock injection fixtures and simulated device feeds.
   - Virtual print verification harness (verifying generated 203 DPI bitmaps, exact pixel dimensions, Code128 barcode decodability, QR code readability, and Arabic text layout).
2. `tests/e2e/test_tier1_features.py`:
   - Write comprehensive Tier 1 tests (>= 5 test cases per feature for features F01 through F20 where applicable, totaling >= 100 test cases).
   - Test each feature requirement in isolation using the simplest available verification mechanism.
3. `tests/e2e/test_tier2_boundaries.py`:
   - Write comprehensive Tier 2 tests (>= 5 boundary & corner cases per feature: max storage, negative battery, null IMEI, corrupt XML, tiny label sizes 38x25mm, extreme Arabic RTL strings, empty search, 50,000 row simulation).
4. Run the test suite using Python unittest / pytest:
   - Report test execution results in your handoff report.
   - When ready, publish the draft `TEST_READY.md` summarizing the runner command, tier coverage, and feature checklist.

OUTPUT:
- Write your tests to `tests/e2e/`.
- Write your handoff report to `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_test_writer_e2e\handoff.md`.
- Send a completion message to the parent orchestrator with reference to your handoff path.
REMEMBER: You write tests only. Do NOT modify production application code in `core/` or `ui/`.
