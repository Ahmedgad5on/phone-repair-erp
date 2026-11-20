"""
ui/status_bar.py — Sleek Executive Top Telemetry & Command Bar (48px)
Features:
- Left: Active Workspace Section Breadcrumb + Live USB Hardware Status Pill.
- Center: Clean breathing space (No cramped or overlapping text).
- Right: Dedicated Active Thermal Printer Selector, Auto-Print Toggle, and Driver Doctor Badge.
- Preserves all background worker signals and driver health inspection.
"""
import logging
import subprocess
import sys
from typing import Optional, Dict, Any

from PyQt6.QtCore import QObject, QThread, pyqtSignal, pyqtSlot, QTimer, Qt
from PyQt6.QtWidgets import (
    QWidget, QHBoxLayout, QLabel, QComboBox, QCheckBox, QPushButton, QFrame, QMessageBox
)
from PyQt6.QtGui import QPixmap, QFont, QColor

from core.models import DeviceSpecs
from core.device_detector import DeviceDetectorWorker, ConnectionState
from core.driver_manager import check_driver_health, DriverDoctorDialog
from core.paths import get_asset_path, get_binary_path
from ui.icons import get_icon

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


class StatusBarPanel(QFrame):
    """
    Sleek, uncluttered Top Command Bar conforming to Obsidian & Gold ERP design.
    """
    device_detected = pyqtSignal(object)       # DeviceSpecs
    device_lost = pyqtSignal()
    auto_print_triggered = pyqtSignal(object)  # DeviceSpecs
    language_changed = pyqtSignal(str)
    shop_settings_changed = pyqtSignal()
    print_labels_requested = pyqtSignal()
    reread_requested = pyqtSignal()
    printer_selected = pyqtSignal(str)
    role_switched = pyqtSignal(str, str)  # (role, username)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("PanelCard")
        self.setFixedHeight(48)
        self.setStyleSheet("""
            QFrame#PanelCard {
                background-color: #0B0D14;
                border-bottom: 1px solid #1D2333;
                border-radius: 6px;
            }
        """)

        self._auto_print_enabled = False
        self._last_auto_printed_id: Optional[str] = None
        self._current_specs: Optional[DeviceSpecs] = None
        self._driver_dialog: Optional[DriverDoctorDialog] = None
        self.current_role = "Owner"

        self._init_ui()
        self._init_thread()
        self._check_driver_badge()

    def _init_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 4, 12, 4)
        layout.setSpacing(12)

        # -------------------------------------------------------------------
        # LEFT: Breadcrumb & Clean Device Connection Pill
        # -------------------------------------------------------------------
        left_box = QHBoxLayout()
        left_box.setSpacing(8)

        self.lbl_section = QLabel("المخزن والإدخال الذكي")
        self.lbl_section.setStyleSheet("color: #F59E0B; font-weight: 700; font-size: 13px;")
        left_box.addWidget(self.lbl_section)

        sep1 = QFrame()
        sep1.setFrameShape(QFrame.Shape.VLine)
        sep1.setStyleSheet("color: #1D2333; margin: 4px 0;")
        left_box.addWidget(sep1)

        # Telemetry Pill
        center_pill = QFrame()
        center_pill.setObjectName("TelemetryPill")
        center_pill.setStyleSheet("""
            QFrame#TelemetryPill {
                background-color: #11141F;
                border: 1px solid #1D2333;
                border-radius: 4px;
                padding: 1px 6px;
            }
        """)
        pill_layout = QHBoxLayout(center_pill)
        pill_layout.setContentsMargins(6, 2, 6, 2)
        pill_layout.setSpacing(6)

        self.lbl_conn_dot = QLabel("●")
        self.lbl_conn_dot.setStyleSheet("color: #F43F5E; font-size: 12px;")
        pill_layout.addWidget(self.lbl_conn_dot)

        self.lbl_conn_text = QLabel("في انتظار توصيل هاتف عبر USB...")
        self.lbl_conn_text.setStyleSheet("color: #94A3B8; font-size: 11px; font-weight: 600;")
        pill_layout.addWidget(self.lbl_conn_text)

        self.btn_reread = QPushButton("تحديث")
        self.btn_reread.setIcon(get_icon("refresh", color="#F59E0B", size=13))
        self.btn_reread.setFixedHeight(24)
        self.btn_reread.setToolTip("إعادة قراءة بيانات الهاتف عبر USB (F1)")
        self.btn_reread.setStyleSheet("""
            QPushButton {
                background-color: #151924;
                color: #F59E0B;
                border: 1px solid #252D42;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #1B2030;
                border-color: #F59E0B;
                color: #FBBF24;
            }
        """)
        self.btn_reread.clicked.connect(self._on_reread_clicked)
        pill_layout.addWidget(self.btn_reread)

        left_box.addWidget(center_pill)
        layout.addLayout(left_box)

        layout.addStretch()

        # -------------------------------------------------------------------
        # RIGHT: Printer Selector, Auto-Print & Driver Doctor
        # -------------------------------------------------------------------
        right_box = QHBoxLayout()
        right_box.setSpacing(10)

        # Dedicated Active Printer Selector
        printer_pill = QFrame()
        printer_pill.setObjectName("PrinterPill")
        printer_pill.setStyleSheet("""
            QFrame#PrinterPill {
                background-color: #11141F;
                border: 1px solid #1D2333;
                border-radius: 4px;
                padding: 1px 4px;
            }
        """)
        p_layout = QHBoxLayout(printer_pill)
        p_layout.setContentsMargins(4, 2, 4, 2)
        p_layout.setSpacing(4)

        lbl_p_icon = QLabel()
        lbl_p_icon.setPixmap(get_icon("printer", color="#F59E0B", size=14).pixmap(14, 14))
        p_layout.addWidget(lbl_p_icon)

        self.combo_printer = QComboBox()
        self.combo_printer.setMinimumWidth(140)
        self.combo_printer.setMaximumWidth(190)
        self.combo_printer.setFixedHeight(26)
        self.combo_printer.setToolTip("اختيار طابعة الملصقات الحرارية النشطة")
        self.combo_printer.setStyleSheet("""
            QComboBox {
                background-color: #151924;
                color: #F59E0B;
                border: 1px solid #252D42;
                border-radius: 4px;
                padding: 2px 6px;
                font-weight: bold;
                font-size: 11px;
            }
            QComboBox:hover { border-color: #F59E0B; background-color: #1B2030; }
            QComboBox::drop-down { border: none; }
        """)
        self.combo_printer.currentTextChanged.connect(self._on_printer_changed)
        p_layout.addWidget(self.combo_printer)
        right_box.addWidget(printer_pill)

        # Auto-Print Toggle Switch
        self.chk_autoprint = QCheckBox("طباعة فورية")
        self.chk_autoprint.setToolTip("طباعة تلقائية للملصق بمجرد توصيل الهاتف")
        self.chk_autoprint.setStyleSheet("""
            QCheckBox {
                color: #F1F5F9;
                font-size: 11px;
                font-weight: 600;
            }
            QCheckBox::indicator:checked {
                background-color: #F59E0B;
                border: 1px solid #FBBF24;
            }
        """)
        self.chk_autoprint.setChecked(False)
        self.chk_autoprint.toggled.connect(self._on_autoprint_toggled)
        right_box.addWidget(self.chk_autoprint)

        # Driver Doctor Badge Button
        self.btn_driver_doctor = QPushButton("فحص التعريفات")
        self.btn_driver_doctor.setIcon(get_icon("shield", color="#08090E", size=13))
        self.btn_driver_doctor.setFixedHeight(26)
        self.btn_driver_doctor.setToolTip("فحص وتثبيت تعريفات USB بنقرة واحدة (ADB, Apple, Samsung)")
        self.btn_driver_doctor.setStyleSheet("""
            QPushButton {
                background-color: #10B981;
                color: #08090E;
                border: 1px solid #059669;
                border-radius: 4px;
                padding: 3px 10px;
                font-size: 11px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #34D399;
                border-color: #10B981;
            }
        """)
        self.btn_driver_doctor.clicked.connect(self._open_driver_doctor)
        right_box.addWidget(self.btn_driver_doctor)

        layout.addLayout(right_box)

    def set_active_section(self, section_name: str):
        """Updates the breadcrumb section title."""
        self.lbl_section.setText(section_name)

    def populate_printers(self, printers: list, current: Optional[str] = None):
        """Populates the top bar printer selector dropdown."""
        self.combo_printer.blockSignals(True)
        self.combo_printer.clear()
        for p in printers:
            self.combo_printer.addItem(p)
        if current and current in printers:
            self.combo_printer.setCurrentText(current)
        elif self.combo_printer.count() > 0:
            self.combo_printer.setCurrentIndex(0)
        self.combo_printer.blockSignals(False)

    def set_current_printer(self, printer_name: str):
        """Synchronizes selected printer into the top bar combobox."""
        self.combo_printer.blockSignals(True)
        idx = self.combo_printer.findText(printer_name)
        if idx >= 0:
            self.combo_printer.setCurrentIndex(idx)
        self.combo_printer.blockSignals(False)

    def get_selected_printer(self) -> str:
        return self.combo_printer.currentText()

    def set_role(self, role: str):
        self.current_role = role

    def _init_thread(self):
        self.thread = QThread(self)
        self.worker = DeviceDetectorWorker()
        self.worker.moveToThread(self.thread)

        self.thread.started.connect(self.worker.start_polling)
        self.worker.status_changed.connect(self._on_status_changed)
        self.worker.specs_received.connect(self._on_specs_received)
        self.worker.device_disconnected.connect(self._on_device_lost)

        self.thread.start()

    def stop_worker(self):
        if hasattr(self, 'worker'):
            self.worker.stop_polling()
        if hasattr(self, 'thread'):
            self.thread.quit()
            self.thread.wait(2000)

    @pyqtSlot(dict)
    def _on_status_changed(self, status: dict):
        desc = status.get("description", "")
        if "Checking" in desc or "فحص" in desc or "جاري" in desc:
            self.lbl_conn_dot.setStyleSheet("color: #F59E0B; font-size: 12px;")
            self.lbl_conn_text.setText(desc)
            self.lbl_conn_text.setStyleSheet("color: #F59E0B; font-size: 11px; font-weight: 600;")

    @pyqtSlot(object)
    def _on_specs_received(self, specs: DeviceSpecs):
        self._current_specs = specs
        display_name = specs.marketing_name or f"{specs.brand} {specs.model_code}"
        storage_str = f" ({specs.storage})" if specs.storage else ""
        self.lbl_conn_dot.setStyleSheet("color: #10B981; font-size: 12px;")
        self.lbl_conn_text.setText(f"متصل: {display_name}{storage_str}")
        self.lbl_conn_text.setStyleSheet("color: #10B981; font-size: 11px; font-weight: bold;")
        self.device_detected.emit(specs)

        if self._auto_print_enabled:
            cur_id = specs.serial_number or specs.imei1 or specs.model_code
            if cur_id and cur_id != self._last_auto_printed_id:
                self._last_auto_printed_id = cur_id
                self.auto_print_triggered.emit(specs)

    @pyqtSlot()
    def _on_device_lost(self):
        self._current_specs = None
        self._last_auto_printed_id = None
        self.lbl_conn_dot.setStyleSheet("color: #EF4444; font-size: 12px;")
        self.lbl_conn_text.setText("في انتظار توصيل هاتف عبر USB...")
        self.lbl_conn_text.setStyleSheet("color: #9CA3AF; font-size: 11px; font-weight: 600;")
        self.device_lost.emit()

    def _on_reread_clicked(self):
        self.lbl_conn_dot.setStyleSheet("color: #F59E0B; font-size: 12px;")
        self.lbl_conn_text.setText("جاري إعادة الفحص...")
        self.worker.trigger_detection_check()
        self.reread_requested.emit()

    def _on_autoprint_toggled(self, checked: bool):
        self._auto_print_enabled = checked

    def _on_printer_changed(self, text: str):
        if text:
            self.printer_selected.emit(text)

    def _check_driver_badge(self):
        try:
            health = check_driver_health()
            missing = [v["name"] for k, v in health.items() if not v.get("installed")]
            if missing:
                self.btn_driver_doctor.setText("🩺 فحص التعريفات")
                self.btn_driver_doctor.setStyleSheet("""
                    QPushButton {
                        background-color: #2D2410; color: #D4AF37; border: 1px solid #D4AF37;
                        border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: bold;
                    }
                    QPushButton:hover { background-color: #D4AF37; color: #0D0D11; }
                """)
            else:
                self.btn_driver_doctor.setText("🩺 التعريفات جاهزة ✔")
                self.btn_driver_doctor.setStyleSheet("""
                    QPushButton {
                        background-color: #10B981; color: #0D0D11; border: none;
                        border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: bold;
                    }
                    QPushButton:hover { background-color: #34D399; }
                """)
        except Exception:
            self.btn_driver_doctor.setText("🩺 فحص التعريفات")

    def _open_driver_doctor(self):
        self._driver_dialog = DriverDoctorDialog(self)
        self._driver_dialog.drivers_installed.connect(self._check_driver_badge)
        self._driver_dialog.exec()
