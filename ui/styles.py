"""
ui/styles.py — Modern Obsidian Black & Metallic Gold Design System & Stylesheet
Conforming to modern desktop UI/UX standards (Linear, Raycast, Figma Studio).

Palette Tokens:
- Background Root: #121212 / #0D0D11 (Deep Obsidian Space)
- Surface 1 (Panels): #16161D / #1E1E1E
- Surface 2 (Elevated Cards): #1A1A26
- Input Surface: #1E1E2B
- Border Default: #282838 (Subtle Glass Edge)
- Border Focus: #D4AF37 (Metallic Gold)
- Accent Gold: #D4AF37 (Brushed Metallic Gold)
- Accent Gold Hover: #E5C158
- Text White / Primary: #F4F4F6
- Text Silver / Secondary: #9CA3AF
- Text Muted: #64748B
- Status Connected / Emerald: #10B981
- Status Alert / Crimson: #EF4444
- Status Warning / Amber: #F59E0B
"""

# Core Design Tokens (Backward-compatible with M4/M5 tests)
BG_ROOT = "#121212"
BG_SURFACE = "#1E1E1E"
BG_OBSIDIAN = "#0D0D11"
BG_PANEL = "#16161D"
BG_PANEL_ALT = "#1A1A24"
BG_CARD = "#1A1A26"
BG_INPUT = "#1E1E28"
BORDER_GLASS = "#282834"
BORDER_FOCUS = "#D4AF37"
ACCENT_GOLD = "#D4AF37"
ACCENT_GOLD_HOVER = "#E5C158"
TEXT_WHITE = "#F4F4F6"
TEXT_SILVER = "#9CA3AF"
TEXT_MUTED = "#64748B"
STATUS_CONNECTED = "#10B981"
STATUS_ALERT = "#EF4444"
STATUS_WARNING = "#F59E0B"

LUXURY_DARK_QSS = """
/* ==============================================================================
   ProLab Studio: Obsidian & Metallic Gold Master Stylesheet
   Modern Desktop UI Architecture (High Contrast, Fluent & Glass Elevation)
   Base: #121212, Surface: #1E1E1E, Accent: #D4AF37
   ============================================================================== */

QMainWindow, QDialog {
    background-color: #0D0D11;
    color: #F4F4F6;
    font-family: "Segoe UI", "Cairo", "Segoe UI Arabic", -apple-system, Arial, sans-serif;
    font-size: 13px;
}

QWidget {
    background-color: transparent;
    color: #F4F4F6;
    font-family: "Segoe UI", "Cairo", "Segoe UI Arabic", -apple-system, Arial, sans-serif;
    selection-background-color: #D4AF37;
    selection-color: #0D0D11;
}

QToolTip {
    background-color: #1A1A26;
    color: #F4F4F6;
    border: 1px solid #D4AF37;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 500;
}

QScrollArea {
    border: none;
    background-color: transparent;
}

/* Custom Ultra-Slim Smooth Scrollbars */
QScrollBar:vertical {
    background: #111116;
    width: 8px;
    margin: 0px;
    border-radius: 4px;
}

QScrollBar::handle:vertical {
    background: #2E2E3E;
    min-height: 24px;
    border-radius: 4px;
}

QScrollBar::handle:vertical:hover {
    background: #D4AF37;
}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}

QScrollBar:horizontal {
    background: #111116;
    height: 8px;
    margin: 0px;
    border-radius: 4px;
}

QScrollBar::handle:horizontal {
    background: #2E2E3E;
    min-width: 24px;
    border-radius: 4px;
}

QScrollBar::handle:horizontal:hover {
    background: #D4AF37;
}

QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {
    width: 0px;
}

/* Splitter Styling */
QSplitter::handle {
    background-color: #1F1F2B;
    width: 4px;
    height: 4px;
    border-radius: 2px;
}

QSplitter::handle:hover {
    background-color: #D4AF37;
}

/* ==============================================================================
   Card & Panel Containers (Fluent Elevation)
   ============================================================================== */

QFrame.CardFrame, QFrame#CardFrame, QFrame#PanelCard {
    background-color: #16161D;
    border: 1px solid #282834;
    border-radius: 8px;
}

QFrame.CardFrame:hover, QFrame#PanelCard:hover {
    border-color: #38384A;
}

QFrame#GlassHighlight {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 rgba(212, 175, 55, 0.15), stop:1 rgba(212, 175, 55, 0.02));
    border: 1px solid rgba(212, 175, 55, 0.35);
    border-radius: 8px;
}

QGroupBox {
    background-color: #16161D;
    border: 1px solid #282834;
    border-radius: 8px;
    margin-top: 14px;
    font-weight: bold;
    color: #D4AF37;
    padding-top: 14px;
}

QGroupBox::title {
    subcontrol-origin: margin;
    subcontrol-position: top left;
    left: 12px;
    padding: 0 8px;
    background-color: #16161D;
    border-radius: 4px;
}

/* ==============================================================================
   Input Controls & Spinners
   ============================================================================== */

QLineEdit, QTextEdit, QPlainTextEdit, QSpinBox, QDoubleSpinBox {
    background-color: #1E1E28;
    border: 1px solid #282834;
    border-radius: 6px;
    padding: 6px 10px;
    color: #F4F4F6;
    font-size: 12px;
}

QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {
    border: 1px solid #D4AF37;
    background-color: #242434;
}

QLineEdit:disabled, QTextEdit:disabled, QSpinBox:disabled, QDoubleSpinBox:disabled {
    background-color: #14141C;
    color: #64748B;
    border-color: #20202A;
}

QComboBox {
    background-color: #1E1E28;
    border: 1px solid #282834;
    border-radius: 6px;
    padding: 5px 10px;
    color: #F4F4F6;
    min-height: 24px;
    font-size: 12px;
}

QComboBox:focus, QComboBox:hover {
    border: 1px solid #D4AF37;
    background-color: #242434;
}

QComboBox::drop-down {
    subcontrol-origin: padding;
    subcontrol-position: top right;
    width: 24px;
    border-left: 1px solid #282834;
}

QComboBox::down-arrow {
    image: none;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid #D4AF37;
    margin-right: 6px;
}

QComboBox QAbstractItemView {
    background-color: #16161D;
    border: 1px solid #D4AF37;
    selection-background-color: #D4AF37;
    selection-color: #0D0D11;
    padding: 4px;
    border-radius: 4px;
}

/* ==============================================================================
   Buttons & Interactive Elements
   ============================================================================== */

QPushButton {
    background-color: #1E1E28;
    color: #F4F4F6;
    border: 1px solid #2E2E3E;
    border-radius: 6px;
    padding: 4px 8px;
    min-width: 0px;
    font-weight: 600;
    font-size: 12px;
}

QPushButton:hover {
    background-color: #272738;
    border-color: #D4AF37;
    color: #F4F4F6;
}

QPushButton:pressed {
    background-color: #15151E;
}

QPushButton:disabled {
    background-color: #14141C;
    color: #4B5563;
    border-color: #20202A;
}

/* Gold Primary Accent Buttons (Hero CTA) */
QPushButton.PrimaryButton, QPushButton#PrimaryButton, QPushButton#GoldBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #E5C158, stop:1 #D4AF37);
    color: #0D0D11;
    border: 1px solid #D4AF37;
    border-radius: 6px;
    font-weight: bold;
    font-size: 13px;
    padding: 8px 16px;
}

QPushButton.PrimaryButton:hover, QPushButton#PrimaryButton:hover, QPushButton#GoldBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #F3D270, stop:1 #E5C158);
    border-color: #F3D270;
}

QPushButton.PrimaryButton:pressed, QPushButton#PrimaryButton:pressed, QPushButton#GoldBtn:pressed {
    background: #B8972E;
}

/* Danger / Crimson Buttons */
QPushButton.DangerButton, QPushButton#DangerButton {
    background-color: #EF4444;
    color: #FFFFFF;
    border: 1px solid #EF4444;
    border-radius: 6px;
    font-weight: bold;
}

QPushButton.DangerButton:hover, QPushButton#DangerButton:hover {
    background-color: #DC2626;
    border-color: #DC2626;
}

/* Success / Emerald Buttons */
QPushButton.SuccessButton, QPushButton#SuccessButton {
    background-color: #10B981;
    color: #0D0D11;
    border: 1px solid #10B981;
    border-radius: 6px;
    font-weight: bold;
}

QPushButton.SuccessButton:hover, QPushButton#SuccessButton:hover {
    background-color: #059669;
}

/* Addable Option Chip Buttons */
QPushButton#ChipButton {
    background-color: #1A1A24;
    color: #9CA3AF;
    border: 1px solid #282834;
    border-radius: 12px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
}

QPushButton#ChipButton:hover {
    background-color: #252538;
    color: #D4AF37;
    border-color: #D4AF37;
}

QPushButton#ActionLink {
    background-color: transparent;
    color: #D4AF37;
    border: none;
    padding: 2px 6px;
    text-decoration: underline;
    font-weight: 600;
}

QPushButton#ActionLink:hover {
    color: #E5C158;
}

/* Preset Paper Pills */
QPushButton.PresetPill, QPushButton#PresetPill {
    background-color: #1A1A24;
    color: #9CA3AF;
    border: 1px solid #282838;
    border-radius: 14px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: bold;
}

QPushButton.PresetPill:hover, QPushButton#PresetPill:hover {
    border-color: #D4AF37;
    color: #F4F4F6;
    background-color: #232332;
}

QPushButton.PresetPill:checked, QPushButton#PresetPill[active="true"] {
    background-color: #D4AF37;
    color: #0D0D11;
    border-color: #D4AF37;
}

/* ==============================================================================
   Segmented Tab Bar & Tab Widgets
   ============================================================================== */

QTabWidget::pane {
    border: 1px solid #282834;
    background-color: #16161D;
    border-radius: 0px 0px 8px 8px;
    top: -1px;
}

QTabBar::tab {
    background-color: #121217;
    color: #9CA3AF;
    padding: 6px 10px;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    margin-right: 2px;
    font-weight: bold;
    font-size: 11px;
    border: 1px solid #20202C;
    border-bottom: none;
}

QTabBar::tab:hover {
    color: #F4F4F6;
    background-color: #1A1A26;
    border-color: #2D2D3D;
}

QTabBar::tab:selected {
    background-color: #16161D;
    color: #D4AF37;
    border-bottom: 2px solid #D4AF37;
    border-color: #282834;
    border-bottom-color: #D4AF37;
}

/* ==============================================================================
   Table Widget & Header
   ============================================================================== */

QTableWidget {
    background-color: #16161D;
    border: 1px solid #282834;
    border-radius: 8px;
    gridline-color: #242432;
    color: #F4F4F6;
    selection-background-color: #28283C;
    selection-color: #D4AF37;
    font-size: 12px;
    outline: none;
}

QTableWidget::item {
    padding: 4px 6px;
    border-bottom: 1px solid #1E1E2B;
}

QTableWidget::item:selected {
    background-color: #28283C;
    color: #D4AF37;
}

QHeaderView::section {
    background-color: #1A1A26;
    color: #D4AF37;
    font-weight: bold;
    padding: 6px 10px;
    border: 1px solid #242432;
    border-top: none;
    font-size: 11px;
}

/* ==============================================================================
   Checkboxes & Radios
   ============================================================================== */

QCheckBox, QRadioButton {
    spacing: 8px;
    color: #F4F4F6;
    font-size: 12px;
    font-weight: 500;
}

QCheckBox::indicator, QRadioButton::indicator {
    width: 16px;
    height: 16px;
    border: 1px solid #3A3A4E;
    border-radius: 4px;
    background-color: #1E1E28;
}

QRadioButton::indicator {
    border-radius: 9px;
}

QCheckBox::indicator:hover, QRadioButton::indicator:hover {
    border-color: #D4AF37;
}

QCheckBox::indicator:checked, QRadioButton::indicator:checked {
    background-color: #D4AF37;
    border-color: #D4AF37;
}

/* ==============================================================================
   Typography & Badges
   ============================================================================== */

QLabel.MutedLabel {
    color: #9CA3AF;
    font-size: 11px;
}

QLabel.SectionHeader, QLabel#SectionTitle {
    color: #D4AF37;
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 2px;
}

QLabel.StatusPill {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: bold;
}

QLabel.BadgeSuccess {
    background-color: rgba(16, 185, 129, 0.15);
    color: #10B981;
    border: 1px solid #10B981;
    border-radius: 6px;
    padding: 3px 8px;
    font-weight: bold;
}

QLabel.BadgeAlert {
    background-color: rgba(239, 68, 68, 0.15);
    color: #EF4444;
    border: 1px solid #EF4444;
    border-radius: 6px;
    padding: 3px 8px;
    font-weight: bold;
}

QLabel.BadgeGold {
    background-color: rgba(212, 175, 55, 0.15);
    color: #D4AF37;
    border: 1px solid #D4AF37;
    border-radius: 6px;
    padding: 3px 8px;
    font-weight: bold;
}
"""

def load_theme() -> str:
    """Loads ui/theme.qss or returns fallback LUXURY_DARK_QSS."""
    import os
    theme_file = os.path.join(os.path.dirname(__file__), "theme.qss")
    if os.path.exists(theme_file):
        try:
            with open(theme_file, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            pass
    return LUXURY_DARK_QSS

