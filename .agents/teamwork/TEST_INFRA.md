# E2E Test Infra: Mobile Phone Sales & Repair Lab Thermal Label Application

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md`.
- No reliance on internal UI state or unexposed functions.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory Coverage Matrix
| # | Feature | Requirement Source | Tier 1 (>=5) | Tier 2 (>=5) | Tier 3 (Pairwise) | Tier 4 (Workloads) |
|---|---------|-------------------|:------------:|:------------:|:-----------------:|:------------------:|
| F01 | Luxury Dark Theme UI | R1 | 5 | 5 | ✓ | ✓ |
| F02 | Status Bar & Connection Listener | R1 | 5 | 5 | ✓ | ✓ |
| F03 | Device Specs Form Panel | R1 | 5 | 5 | ✓ | ✓ |
| F04 | Service & Repair Intake Panel | R1 | 5 | 5 | ✓ | ✓ |
| F05 | Live WYSIWYG Label Preview | R1 | 5 | 5 | ✓ | ✓ |
| F06 | Barcode & QR Code Engine | R1, R3 | 5 | 5 | ✓ | ✓ |
| F07 | Compact Smart Merge | R1, R3 | 5 | 5 | ✓ | ✓ |
| F08 | Printer & Preset Manager Panel | R1 | 5 | 5 | ✓ | ✓ |
| F09 | Local History & Log Table | R1 | 5 | 5 | ✓ | ✓ |
| F10 | Android Extraction Engine | R2 | 5 | 5 | ✓ | ✓ |
| F11 | OEM Model Code Resolver | R2 | 5 | 5 | ✓ | ✓ |
| F12 | iOS Extraction Engine | R2 | 5 | 5 | ✓ | ✓ |
| F13 | Apple ProductType Mapping | R2 | 5 | 5 | ✓ | ✓ |
| F14 | Simulation / Mock Device Engine | R2 | 5 | 5 | ✓ | ✓ |
| F15 | 203 DPI Native 1-Bit Canvas | R3 | 5 | 5 | ✓ | ✓ |
| F16 | Arabic Reshaping & BiDi Layout | R3 | 5 | 5 | ✓ | ✓ |
| F17 | Direct Windows Silent Printing | R3 | 5 | 5 | ✓ | ✓ |
| F18 | Alignment Calibration Generator | R3 | 5 | 5 | ✓ | ✓ |
| F19 | SQLite3 Persistence & Indexing | R4 | 5 | 5 | ✓ | ✓ |
| F20 | Standalone Packaging (.exe) | R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Python `unittest` / `pytest` executable from PowerShell.
- Headless UI Verification: PyQt6 `QTest` and offscreen platform mode (`QT_QPA_PLATFORM=offscreen`).
- Mock Injection: Direct hardware socket/subprocess mocking and `MockDeviceManager` telemetry injection.
- Directory Layout: `tests/e2e/`.

## Real-World Application Scenarios (Tier 4)
1. **Intake of Used iPhone 15 Pro Max for Resale**: Auto-detected via iOS mock, verified capacity (512GB), battery health (89%), cycles (342), generates 38x25mm label with Compact Smart Merge and Code128 barcode, prints silently, logs to SQLite history.
2. **Samsung S24 Ultra Screen Repair Intake**: Customer intake with Arabic name, phone number, passcode pattern, cracked back checkbox, estimates cost, prints 50x30mm intake ticket with QR code, exports to Excel.
3. **Xiaomi Fastboot Intake**: Device in Fastboot mode detected, displays Fastboot indicator, manual IMEI scanner input, generates stock label.
4. **Thermal Printer Alignment Calibration**: Technician triggers calibration test label on 40x25mm roll, verifies dimensional border box (exact 320x200 px) and alignment ticks.
5. **High-Volume Search and 1-Click Reprint**: Filter 1,000 history records by customer phone or IMEI, instant UI table update, triggers 1-click reprint without re-entering data.

## Coverage Thresholds
- N = 20 features
- Tier 1: $\ge 100$ test cases (5 per feature)
- Tier 2: $\ge 100$ test cases (boundary & corner cases)
- Tier 3: $\ge 20$ test cases (cross-feature interactions)
- Tier 4: $\ge 10$ real-world application workload scenarios
- **Total Minimum Expected**: $\ge 230$ tests in E2E test suite.
