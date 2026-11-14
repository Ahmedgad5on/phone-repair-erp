# E2E Test Infra: Mobile Phone Sales & Repair Lab Smart Labeler

## Test Philosophy
- Opaque-box, requirement-driven verification derived directly from `ORIGINAL_REQUEST.md`.
- No direct dependencies on implementation internals; exercise components through public APIs and CLI interfaces.
- Progressive testability: Verification mechanism must not require features more complex than what is being tested.
- Methodology: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Workload Testing.

## Feature Inventory & Test Coverage Goals
| # | Feature | Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|--------|:----------------:|:-----------------:|:-----------------:|:-----------------:|
| F1 | Vector Logo & Multi-res ICO/PNG | R1 | ≥5 | ≥5 | ✓ | ✓ |
| F2 | Windows AppUserModelID & Taskbar | R1 | ≥5 | ≥5 | ✓ | ✓ |
| F3 | Desktop Shortcut Creator | R1 | ≥5 | ≥5 | ✓ | ✓ |
| F4 | Portable ADB Key Vault | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F5 | Multi-Layer Android IMEI & Luhn | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F6 | Multi-OEM Color Resolver & Samsung | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F7 | Android Hardware Specs & Battery | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F8 | iOS Telemetry & Battery Health % | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F9 | Zero-Click USB Background Listener | R3 | ≥5 | ≥5 | ✓ | ✓ |
| F10 | SQLite Relational Schema & Migration | R5 | ≥5 | ≥5 | ✓ | ✓ |
| F11 | TAC-to-Color Learning Engine | R2/R5 | ≥5 | ≥5 | ✓ | ✓ |
| F12 | Store Inventory Audit Engine | R2 | ≥5 | ≥5 | ✓ | ✓ |
| F13 | Audit Report Excel Export | R2 | ≥5 | ≥5 | ✓ | ✓ |
| F14 | 1-Click Visual Color Chips Bar | R2 | ≥5 | ≥5 | ✓ | ✓ |
| F15 | Tab 3 Store Inventory Audit UI | R2 | ≥5 | ≥5 | ✓ | ✓ |
| F16 | Luxury Dark Mode UI & Brand Header | R2 | ≥5 | ≥5 | ✓ | ✓ |
| F17 | 203 DPI Thermal Label Canvas & Arabic CTL | R4 | ≥5 | ≥5 | ✓ | ✓ |
| F18 | Compact Smart Merge Layout | R2/R4 | ≥5 | ≥5 | ✓ | ✓ |
| F19 | Direct Windows GDI Silent Printing | R4 | ≥5 | ≥5 | ✓ | ✓ |
| F20 | Standalone PyInstaller Packaging | R5 | ≥5 | ≥5 | ✓ | ✓ |
| F21 | Mock Device & Hardware Emulation | R3 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Python standard `unittest` via `python -m unittest discover -s tests -p "test_*.py"` and `python -m unittest discover -s tests/e2e -p "test_*.py"`.
- **Pass/Fail Semantics**: All test suites must exit with status code 0 and 0 failures/errors.
- **Fixtures & Mock Data**:
  - `core/mock_device.py` provides realistic raw output strings for ADB shell, Fastboot, ideviceinfo, and idevicediagnostics.
  - Virtual GDI printer and bitmap analyzer verify 203 DPI pixel dimensions and barcode readability without physical printer hardware.
- **Directory Layout**:
  - `tests/`: Module unit tests.
  - `tests/e2e/`: Requirement-driven end-to-end tests across Tiers 1–4.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Description |
|---|----------|--------------------|-------------|
| 1 | Used iPhone Intake & Sales Labeling | F8, F11, F17, F18, F19, F10 | Connect iPhone 14 Pro, auto-extract specs & battery health 88%, verify color, print 38x25mm compact label, log to inventory as "In Stock" |
| 2 | Dead Android Device Service Intake | F15, F16, F10 | Customer brings dead Samsung S22, enter service intake ticket with fault, passcode, security checkboxes, print repair intake label |
| 3 | Dual-SIM Samsung S23 Auto-Extraction & TAC Learning | F5, F6, F7, F11, F14, F10 | Read Dual-SIM IMEI 1 & 2 via parcel bypass, decode Samsung color ZGA, click Green chip to confirm TAC learning, store in database |
| 4 | Store Inventory Barcode Audit Session | F10, F12, F13, F15 | Populate 50 inventory items, scan 45 with barcode scanner, verify beep audio, identify 5 missing, export Excel audit report |
| 5 | Small Label (38x25mm) Compact Smart Merge Printing | F17, F18, F19 | Verify exact 304x200 px canvas, verify model/storage/color/battery merge and scannable Code128 barcode placement with quiet zone |
| 6 | Arabic Customer Name & Fault CTL Rendering | F16, F17, F19 | Service intake with Arabic customer name and fault (قاطع باور، الشاشة مكسورة), verify proper connected RTL rendering without reversals |
| 7 | Fastboot Unbrick Telemetry & Barcode Label | F5, F7, F17 | Device connected in Fastboot mode, extract serial/IMEI via fastboot getvar, print diagnostic label |
| 8 | Portable ADB Key Vault Persistence | F4, F9 | Verify keys in `./data/adb_keys`, ensure adb restart preserves keypair, no unauthorized prompt on trusted devices |
| 9 | Brand Identity & Multi-Resolution Icon Export | F1, F2, F3 | Execute asset generator, verify all 6 ico layers, verify header logo, verify AppUserModelID registration |
| 10 | Stock Status Lifecycle Transition | F10, F12 | In Stock -> Sold -> Returned for Repair -> Re-audited in stock |
| 11 | Excel Audit Integrity & Format Validation | F12, F13 | Open generated .xlsx using openpyxl, verify headers, formulas, cell styles, timestamps, and row counts |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (105+ tests)
- Tier 2: ≥5 boundary/error test cases per feature (105+ tests)
- Tier 3: Pairwise feature combinations (≥25 tests)
- Tier 4: Realistic business workflows (≥11 scenarios)
- **Total E2E Target**: ≥250 tests with 100% pass rate.
