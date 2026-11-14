"""
ui/about_dialog.py — Professional System Information & Release Changelog Dialog
Obsidian & Gold Premium ERP Styling.
"""
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QFrame, QScrollArea, QWidget, QSizePolicy
)
from PyQt6.QtGui import QIcon, QPixmap

from core.version import (
    get_version, get_version_display, get_full_version,
    get_build_date, BUILD_CODENAME, APP_NAME, APP_SUBTITLE, get_changelog
)
from core.paths import get_asset_path


class AboutDialog(QDialog):
    """Displays software version, system specifications, and detailed release changelog."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("حول البرنامج وسجل التحديثات — ProLab")
        self.setFixedSize(580, 520)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        icon_path = get_asset_path("app_icon.ico")
        if icon_path.exists():
            self.setWindowIcon(QIcon(str(icon_path)))

        self.setStyleSheet("""
            QDialog {
                background-color: #0E0E12;
                color: #F3F4F6;
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            }
            QFrame.card {
                background-color: #16161D;
                border: 1px solid #282834;
                border-radius: 8px;
            }
            QLabel {
                color: #E5E7EB;
            }
            QPushButton#btnClose {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #D4AF37, stop:1 #E5C158);
                color: #0D0D11;
                font-weight: 800;
                font-size: 13px;
                padding: 8px 24px;
                border-radius: 6px;
                border: none;
            }
            QPushButton#btnClose:hover {
                background: #F5D77F;
            }
        """)

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)

        # Header Card: App Logo, Name, Version Badge
        hdr_card = QFrame()
        hdr_card.setProperty("class", "card")
        hdr_card.setStyleSheet("""
            background-color: #16161D;
            border: 1px solid #D4AF37;
            border-radius: 8px;
            padding: 12px;
        """)
        h_layout = QHBoxLayout(hdr_card)
        h_layout.setContentsMargins(8, 8, 8, 8)
        h_layout.setSpacing(14)

        # Icon
        icon_path = get_asset_path("logo_header.png")
        lbl_icon = QLabel()
        if icon_path.exists():
            pix = QPixmap(str(icon_path)).scaled(54, 54, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            lbl_icon.setPixmap(pix)
        else:
            lbl_icon.setText("👑")
            lbl_icon.setStyleSheet("font-size: 38px; color: #D4AF37;")
        h_layout.addWidget(lbl_icon)

        # App Info
        info_lay = QVBoxLayout()
        info_lay.setSpacing(3)

        lbl_app = QLabel(f"👑 {APP_NAME}")
        lbl_app.setStyleSheet("font-size: 16px; font-weight: 800; color: #D4AF37;")
        info_lay.addWidget(lbl_app)

        lbl_sub = QLabel(APP_SUBTITLE)
        lbl_sub.setStyleSheet("font-size: 11px; color: #9CA3AF;")
        info_lay.addWidget(lbl_sub)

        # Version Badge
        lbl_ver = QLabel(f"🏷️ {get_full_version()}  •  {BUILD_CODENAME}")
        lbl_ver.setStyleSheet("""
            background-color: #21212B;
            color: #10B981;
            font-size: 11px;
            font-weight: bold;
            padding: 2px 8px;
            border-radius: 4px;
            border: 1px solid #10B981;
        """)
        info_lay.addWidget(lbl_ver)

        h_layout.addLayout(info_lay)
        h_layout.addStretch()
        layout.addWidget(hdr_card)

        # Changelog Header
        lbl_log_title = QLabel("📋 سجل التحديثات وتاريخ الإصدارات (Release History):")
        lbl_log_title.setStyleSheet("font-size: 13px; font-weight: bold; color: #D4AF37; margin-top: 4px;")
        layout.addWidget(lbl_log_title)

        # Scrollable Changelog Area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("""
            QScrollArea { background: transparent; border: none; }
            QScrollBar:vertical { width: 6px; background: #16161D; border-radius: 3px; }
            QScrollBar::handle:vertical { background: #28283C; border-radius: 3px; }
            QScrollBar::handle:vertical:hover { background: #D4AF37; }
        """)

        container = QWidget()
        container.setStyleSheet("background: transparent;")
        c_layout = QVBoxLayout(container)
        c_layout.setContentsMargins(0, 0, 6, 0)
        c_layout.setSpacing(10)

        releases = get_changelog()
        for idx, rel in enumerate(releases):
            card = QFrame()
            card.setStyleSheet("""
                background-color: #16161D;
                border: 1px solid #282834;
                border-radius: 6px;
                padding: 10px;
            """)
            c_inner = QVBoxLayout(card)
            c_inner.setContentsMargins(10, 8, 10, 8)
            c_inner.setSpacing(6)

            # Release Header
            r_hdr = QHBoxLayout()
            is_latest = (idx == 0)
            tag = " [الإصدار الحالي الأحدث]" if is_latest else ""
            lbl_r_title = QLabel(f"📦 الإصدار v{rel['version']} ({rel.get('codename', '')}){tag}")
            lbl_r_title.setStyleSheet("font-weight: bold; color: #D4AF37; font-size: 12px;")
            r_hdr.addWidget(lbl_r_title)

            r_hdr.addStretch()

            lbl_r_date = QLabel(f"📅 {rel.get('date', '')}")
            lbl_r_date.setStyleSheet("font-size: 11px; color: #9CA3AF;")
            r_hdr.addWidget(lbl_r_date)
            c_inner.addLayout(r_hdr)

            # Release summary
            lbl_summary = QLabel(rel.get("title", ""))
            lbl_summary.setStyleSheet("font-size: 11px; color: #E5E7EB; font-weight: 600;")
            c_inner.addWidget(lbl_summary)

            # Bullet changes
            for ch in rel.get("changes", []):
                lbl_ch = QLabel(f"  • {ch}")
                lbl_ch.setStyleSheet("font-size: 11px; color: #9CA3AF;")
                lbl_ch.setWordWrap(True)
                c_inner.addWidget(lbl_ch)

            c_layout.addWidget(card)

        c_layout.addStretch()
        scroll.setWidget(container)
        layout.addWidget(scroll, 1)

        # Footer with System Specs and Close Button
        footer = QHBoxLayout()
        lbl_sys = QLabel("⚙️ 203 DPI Thermal CAD  •  SQLite WAL  •  Windows 64-bit")
        lbl_sys.setStyleSheet("font-size: 10px; color: #6B7280;")
        footer.addWidget(lbl_sys)

        footer.addStretch()

        btn_close = QPushButton("إغلاق")
        btn_close.setObjectName("btnClose")
        btn_close.clicked.connect(self.accept)
        footer.addWidget(btn_close)

        layout.addLayout(footer)
