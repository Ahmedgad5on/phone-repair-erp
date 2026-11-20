"""
ui/styles.py — Modern Obsidian Titanium & Cyber-Gold Design System & Stylesheet
Conforming to modern desktop UI/UX standards (Linear, Raycast, Figma Studio).

Palette Tokens:
- Background Root: #08090E (Deep Obsidian Space)
- Surface 1 (Base Cards / Panels): #11141F
- Surface 2 (Elevated Containers): #151924
- Input Surface: #151924
- Border Subtle: #1D2333 (Glass Hairline)
- Border Card: #252D42
- Border Focus: #F59E0B (Cyber-Gold Glow)
- Accent Gold: #F59E0B (Radiant Cyber-Gold)
- Accent Gold Hover: #FBBF24
- Text White / Primary: #FFFFFF
- Text Silver / Secondary: #94A3B8
- Text Muted: #64748B
- Status Connected / Emerald: #10B981
- Status Alert / Crimson: #F43F5E
- Status Warning / Amber: #F59E0B
- Status Info / Cyan: #06B6D4
"""
from pathlib import Path

# Core Design Tokens (Backward-compatible with tests and dialog imports)
BG_ROOT = "#121212"
BG_SURFACE = "#1E1E1E"
BG_OBSIDIAN = "#08090E"
BG_PANEL = "#0B0D14"
BG_PANEL_ALT = "#151924"
BG_CARD = "#11141F"
BG_CARD_ELEVATED = "#151924"
BG_INPUT = "#151924"
BORDER_GLASS = "#1D2333"
BORDER_CARD = "#252D42"
BORDER_FOCUS = "#F59E0B"
ACCENT_GOLD = "#D4AF37"
ACCENT_CYBER_GOLD = "#F59E0B"
ACCENT_GOLD_HOVER = "#FBBF24"
TEXT_WHITE = "#FFFFFF"
TEXT_SILVER = "#94A3B8"
TEXT_MUTED = "#64748B"
STATUS_CONNECTED = "#10B981"
STATUS_ALERT = "#F43F5E"
STATUS_WARNING = "#F59E0B"
STATUS_INFO = "#06B6D4"

# Studio High-End Tokens
BG_VOID = "#08090E"
BG_CONSOLE = "#0B0D14"
BG_CARD_GLASS = "#11141F"
BG_ELEVATED = "#151924"
BORDER_HAIRLINE = "#1D2333"
CYBER_GOLD = "#F59E0B"
CYBER_GOLD_BRIGHT = "#FBBF24"
CYBER_GOLD_DEEP = "#D97706"
NEON_CYAN = "#06B6D4"
CYBER_EMERALD = "#10B981"
NEON_ROSE = "#F43F5E"


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
/* Base: #121212, Surface: #1E1E1E, Accent: #D4AF37 */
QMainWindow, QDialog {
    background-color: #08090E;
    color: #F1F5F9;
    font-family: 'Segoe UI', 'Cairo', -apple-system, sans-serif;
    font-size: 13px;
}

QWidget {
    background-color: transparent;
    color: #F1F5F9;
    font-family: 'Segoe UI', 'Cairo', -apple-system, sans-serif;
    selection-background-color: #F59E0B;
    selection-color: #08090E;
}

QFrame.card, QWidget.card, QFrame#card {
    background-color: #11141F;
    border: 1px solid #1D2333;
    border-radius: 8px;
    padding: 12px;
}

QPushButton {
    background-color: #151924;
    color: #F1F5F9;
    border: 1px solid #252D42;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: 600;
}

QPushButton:hover {
    background-color: #1B2030;
    border-color: #F59E0B;
    color: #FBBF24;
}

QPushButton.primary {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #F59E0B, stop:1 #D97706);
    color: #08090E;
    border: 1px solid #F59E0B;
    font-weight: 800;
}

QLineEdit, QTextEdit {
    background-color: #151924;
    color: #F1F5F9;
    border: 1px solid #252D42;
    border-radius: 6px;
    padding: 7px 12px;
}

QLineEdit:focus, QTextEdit:focus {
    border: 1.5px solid #F59E0B;
    background-color: #1B2030;
}
"""


def load_theme() -> str:
    """Loads ui/theme.qss or returns fallback LUXURY_DARK_QSS."""
    content = _read_theme_qss()
    return content if content else LUXURY_DARK_QSS
