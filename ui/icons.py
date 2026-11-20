"""
ui/icons.py — High-Precision Vector SVG Iconography Suite for ThermalLabPro
Conforming to modern desktop UI standards (Lucide / Phosphor / Linear).
Renders crisp, high-DPI vector icons as QIcon and QPixmap with dynamic stateful tinting.
"""
from typing import Dict, Optional
from PyQt6.QtCore import QByteArray, QSize, Qt
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor
from PyQt6.QtSvg import QSvgRenderer

# Cache for generated QIcon objects: (name, color, active_color, size) -> QIcon
_ICON_CACHE: Dict[tuple, QIcon] = {}

# Clean vector SVG path geometry (viewBox 0 0 24 24, stroke-width 2, round linecap/join)
SVG_PATHS = {
    # 1. Smartphone / Device Mobile
    "device_mobile": """
        <rect x="5" y="2" width="14" height="20" rx="3" ry="3"/>
        <line x1="12" y1="18" x2="12.01" y2="18" stroke-width="2.5"/>
        <line x1="10" y1="5" x2="14" y2="5"/>
    """,

    # 2. Package / Inventory Box
    "package": """
        <path d="M16.5 9.4 7.55 4.24a1.78 1.78 0 0 0-2.5 1.55v12.42a1.78 1.78 0 0 0 2.5 1.55L16.5 14.6"/>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.29 7 12 12 20.71 7"/>
        <line x1="12" y1="22" x2="12" y2="12"/>
    """,

    # 3. Shopping Cart / POS Cash Register
    "pos": """
        <circle cx="9" cy="21" r="1"/>
        <circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    """,

    # 4. Exchange / Trade-In (Arrows Repeat)
    "trade_in": """
        <path d="m17 2 4 4-4 4"/>
        <path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
        <path d="m7 22-4-4 4-4"/>
        <path d="M21 13v1a4 4 0 0 1-4 4H3"/>
    """,

    # 5. Handshake / Traders
    "traders": """
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    """,

    # 6. Reports / Document
    "reports": """
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
    """,

    # 7. Analytics / Bar Chart Trend
    "analytics": """
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
        <path d="m3 3 6 6 4-4 8 8"/>
    """,

    # 8. Audit / Barcode Scanner Target
    "audit": """
        <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
        <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
        <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
        <line x1="7" y1="8" x2="7" y2="16"/>
        <line x1="11" y1="8" x2="11" y2="16"/>
        <line x1="14" y1="8" x2="14" y2="16"/>
        <line x1="17" y1="8" x2="17" y2="16"/>
    """,

    # 9. Designer CAD / Tag Studio
    "designer": """
        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
        <path d="M7 7h.01"/>
    """,

    # 10. Telegram / Robot Bot
    "telegram": """
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4"/>
        <line x1="8" y1="16" x2="8.01" y2="16" stroke-width="2.5"/>
        <line x1="16" y1="16" x2="16.01" y2="16" stroke-width="2.5"/>
    """,

    # 11. Security Shield & Lock
    "security": """
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <rect x="9" y="11" width="6" height="4" rx="1"/>
        <path d="M10 11V9a2 2 0 0 1 4 0v2"/>
    """,

    # 12. Thermal Printer
    "printer": """
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
    """,

    # 13. Crown (Owner / Sovereign)
    "crown": """
        <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/>
    """,

    # 14. User Avatar
    "user": """
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
    """,

    # 15. Shield (License Status)
    "shield": """
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
    """,

    # 16. Sync / Refresh Dual Arrows
    "sync": """
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
        <path d="M16 16h5v5"/>
    """,

    # 17. Info Circle
    "info": """
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8" stroke-width="2.5"/>
    """,

    # 18. Lightning / Fast ADB
    "zap": """
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    """,

    # 19. Refresh Single Loop
    "refresh": """
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        <polyline points="21 3 21 9 15 9"/>
    """,

    # 20. USB Cable / Trident
    "usb": """
        <circle cx="12" cy="19" r="2"/>
        <line x1="12" y1="17" x2="12" y2="8"/>
        <line x1="7" y1="8" x2="17" y2="8"/>
        <polyline points="5 5 7 8 9 5"/>
        <polyline points="15 5 17 8 19 5"/>
        <line x1="12" y1="8" x2="12" y2="3"/>
    """,

    # 21. Search / Lens
    "search": """
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    """,

    # 22. Checkmark Circle
    "check_circle": """
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
    """,

    # 23. Alert Triangle
    "alert": """
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2.5"/>
    """,

    # 24. Key / Authentication
    "key": """
        <path d="m21 2-2 2m-1.5 1.5L16 7l-2 2-2 2-2-2-4 4a6 6 0 1 1-4-4l4-4 2 2 2-2 2-2 1.5-1.5M21 2v4h-4"/>
    """
}


def _render_svg_pixmap(svg_inner: str, stroke_color: str, px_size: int) -> QPixmap:
    """Renders SVG path markup into a high-DPI QPixmap with the requested stroke color."""
    svg_xml = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        fill="none" stroke="{stroke_color}" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        {svg_inner}
    </svg>"""

    scale = 2  # 2x supersampling for high-DPI crystal-clear edges
    render_size = px_size * scale

    renderer = QSvgRenderer(QByteArray(svg_xml.encode("utf-8")))
    pixmap = QPixmap(render_size, render_size)
    pixmap.fill(QColor(0, 0, 0, 0))

    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)
    renderer.render(painter)
    painter.end()

    # Set device pixel ratio for native high-DPI rendering
    pixmap.setDevicePixelRatio(scale)
    return pixmap


def get_icon(
    name: str,
    color: str = "#94A3B8",
    active_color: Optional[str] = "#F59E0B",
    size: int = 20
) -> QIcon:
    """
    Returns a stateful QIcon configured with normal and checked/active state pixmaps.
    When a button is checked (active), Qt automatically switches to active_color.
    """
    cache_key = (name, color, active_color, size)
    if cache_key in _ICON_CACHE:
        return _ICON_CACHE[cache_key]

    svg_inner = SVG_PATHS.get(name)
    if not svg_inner:
        # Fallback circle if icon name not found
        svg_inner = '<circle cx="12" cy="12" r="9"/>'

    icon = QIcon()

    # Normal State Pixmap
    normal_pm = _render_svg_pixmap(svg_inner, color, size)
    icon.addPixmap(normal_pm, QIcon.Mode.Normal, QIcon.State.Off)

    # Active / Checked State Pixmap
    if active_color:
        active_pm = _render_svg_pixmap(svg_inner, active_color, size)
        icon.addPixmap(active_pm, QIcon.Mode.Normal, QIcon.State.On)
        icon.addPixmap(active_pm, QIcon.Mode.Active, QIcon.State.On)
        icon.addPixmap(active_pm, QIcon.Mode.Selected, QIcon.State.On)
    else:
        icon.addPixmap(normal_pm, QIcon.Mode.Normal, QIcon.State.On)

    _ICON_CACHE[cache_key] = icon
    return icon


def get_pixmap(name: str, color: str = "#D4AF37", size: int = 20) -> QPixmap:
    """Returns a standalone single-state QPixmap for labels, badges, or dialog icons."""
    svg_inner = SVG_PATHS.get(name, '<circle cx="12" cy="12" r="9"/>')
    return _render_svg_pixmap(svg_inner, color, size)
