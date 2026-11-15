"""
ui/styles.py — Modern Obsidian Black & Brushed Gold Design System & Stylesheet
Conforming to modern desktop UI/UX standards (Linear, Raycast, Figma Studio).

Palette Tokens:
- Background Root: #0A0A0E (Deep Obsidian Space)
- Surface 1 (Base Cards / Panels): #13131A
- Surface 2 (Elevated Containers): #181822
- Input Surface: #171720
- Border Subtle: #242432 (Glass Edge)
- Border Card: #2E2E3E
- Border Focus: #D4AF37 (Metallic Gold Glow)
- Accent Gold: #D4AF37 (Brushed Metallic Gold)
- Accent Gold Hover: #E5C158
- Text White / Primary: #F4F4F7
- Text Silver / Secondary: #9CA3AF
- Text Muted: #64748B
- Status Connected / Emerald: #10B981
- Status Alert / Crimson: #EF4444
- Status Warning / Amber: #F59E0B
"""
from pathlib import Path

# Core Design Tokens (Backward-compatible with tests and dialog imports)
BG_ROOT = "#121212"
BG_SURFACE = "#1E1E1E"
BG_OBSIDIAN = "#0A0A0E"
BG_PANEL = "#0E0E14"
BG_PANEL_ALT = "#181822"
BG_CARD = "#13131A"
BG_CARD_ELEVATED = "#181822"
BG_INPUT = "#171720"
BORDER_GLASS = "#242432"
BORDER_CARD = "#2E2E3E"
BORDER_FOCUS = "#D4AF37"
ACCENT_GOLD = "#D4AF37"
ACCENT_GOLD_HOVER = "#E5C158"
TEXT_WHITE = "#F4F4F7"
TEXT_SILVER = "#9CA3AF"
TEXT_MUTED = "#64748B"
STATUS_CONNECTED = "#10B981"
STATUS_ALERT = "#EF4444"
STATUS_WARNING = "#F59E0B"
STATUS_INFO = "#0EA5E9"


def _read_theme_qss() -> str:
    """Reads ui/theme.qss directly from disk."""
    theme_file = Path(__file__).parent / "theme.qss"
    if theme_file.exists():
        try:
            return theme_file.read_text(encoding="utf-8")
        except Exception:
            pass
    return ""


# Fallback embedded stylesheet if theme.qss is not on disk
LUXURY_DARK_QSS = _read_theme_qss() or """
QMainWindow, QDialog {
    background-color: #0A0A0E;
    color: #F4F4F7;
    font-family: 'Segoe UI', 'Cairo', -apple-system, sans-serif;
    font-size: 13px;
}

QWidget {
    background-color: transparent;
    color: #F4F4F7;
    font-family: 'Segoe UI', 'Cairo', -apple-system, sans-serif;
    selection-background-color: #D4AF37;
    selection-color: #0A0A0E;
}

QFrame.card, QWidget.card, QFrame#card {
    background-color: #13131A;
    border: 1px solid #242432;
    border-radius: 8px;
    padding: 12px;
}

QPushButton {
    background-color: #171720;
    color: #F4F4F7;
    border: 1px solid #282836;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: 600;
}

QPushButton:hover {
    background-color: #20202C;
    border-color: #D4AF37;
    color: #E5C158;
}

QPushButton.primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #D4AF37, stop:1 #E5C158);
    color: #0A0A0E;
    border: 1px solid #D4AF37;
    font-weight: 800;
}

QLineEdit, QTextEdit {
    background-color: #171720;
    color: #F4F4F7;
    border: 1px solid #282836;
    border-radius: 6px;
    padding: 7px 12px;
}

QLineEdit:focus, QTextEdit:focus {
    border: 1.5px solid #D4AF37;
    background-color: #1C1C26;
}
"""


def load_theme() -> str:
    """Loads ui/theme.qss or returns fallback LUXURY_DARK_QSS."""
    content = _read_theme_qss()
    return content if content else LUXURY_DARK_QSS
