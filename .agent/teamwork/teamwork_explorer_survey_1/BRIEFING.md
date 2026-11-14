# BRIEFING — 2026-11-07T14:12:15Z

## Mission
Investigate Desktop UI & Visual Identity, Layout Architecture & Live WYSIWYG Preview (Requirement R1) for Mobile Phone Sales & Repair Lab Desktop Application.

## 🔒 My Identity
- Archetype: explorer
- Roles: UI & Layout Architecture Investigation, Framework Comparison, WYSIWYG & Thread Safety Synthesis
- Working directory: c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\teamwork_explorer_survey_1
- Original parent: 70b940b4-7f9a-48a3-bfe3-7b5686c9a37b
- Milestone: Phase 0 (Survey)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT write or edit production source code
- Write only to .agents/teamwork/teamwork_explorer_survey_1/
- No source code, tests, or data in .agents/teamwork/

## Current Parent
- Conversation ID: 70b940b4-7f9a-48a3-bfe3-7b5686c9a37b
- Updated: 2026-11-07T14:12:15Z

## Investigation State
- **Explored paths**:
  - `c:\Users\Eng_Ahmed\Desktop\label\.agents\teamwork\ORIGINAL_REQUEST.md`
  - `c:\Users\Eng_Ahmed\Desktop\label` (workspace root directory listing)
  - Python runtime environment (`Python 3.12.10`, pip packages)
  - Windows screen resolution (`1280x720`, working area `1280x672`)
  - Windows printer subsystem (`Get-Printer`: `Microsoft Print to PDF` installed)
- **Key findings**:
  - PyQt6 is decisively superior to CustomTkinter across High-DPI scaling, QSS luxury styling, live WYSIWYG canvas performance, virtualized table views, thread-safe signal loops, and PyInstaller bundling.
  - Native 203 DPI thermal printhead density equals exactly 8.0 dots/mm (e.g., 50x30 mm = 400x240 px, 38x25 mm = 304x200 px).
  - Screen height constraint (working area 672px) requires left and right panels to be wrapped in responsive `QScrollArea` controls with minimum window size `1200x640`.
  - Background 2-second ADB and iOS polling loops must be encapsulated inside a `QThread` emitting `pyqtSignal` events to avoid freezing the GUI event loop.
- **Unexplored areas**: Production hardware USB devices (ADB/libimobiledevice physical connections will be handled in Phase 1/2 via mock mode and live tests).

## Key Decisions Made
- Selected **PyQt6** as the UI framework.
- Designed 5-panel layout with Luxury Dark Theme tokens (`#121212`, `#1E1E1E`, `#D4AF37`).
- Defined 203 DPI 1-bit monochrome rendering pipeline with Arabic Bidi reshaping.
- Established `QThread` + `pyqtSignal` architecture for background device polling.

## Artifact Index
- `DISPATCH.md` — Initial dispatch message and requirements
- `BRIEFING.md` — Persistent agent briefing and memory
- `progress.md` — Liveness heartbeat and milestone checklist
- `analysis.md` — Comprehensive technical analysis and UI architecture specifications
- `handoff.md` — 5-component completion handoff report
