"""
ui/audit_tab.py — 5-Minute Hybrid Store Inventory Audit (الجرد الذكي بالباركود والكاميرا)
Module 6: Multi-Scanner Blind Audit with USB Barcode & Telegram Camera Integration
"""
from datetime import datetime, date
import logging
import os
import sys
from typing import Any, Dict, List, Optional

from PyQt6.QtCore import Qt, pyqtSignal, pyqtSlot
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QPushButton, QTableWidget, QTableWidgetItem,
    QHeaderView, QFrame, QMessageBox, QFileDialog, QSplitter,
    QComboBox
)

from core.database import DatabaseManager

logger = logging.getLogger(__name__)


def play_chime(sound_type: str = "match"):
    """Auditory feedback for warehouse/store scanning operations."""
    if sys.platform == "win32":
        try:
            import winsound
            if sound_type == "match":
                winsound.Beep(1800, 120)  # High-pitch positive chime
            elif sound_type == "duplicate":
                winsound.Beep(1200, 90)
                winsound.Beep(1200, 90)   # Double tone
            else:
                winsound.Beep(550, 250)   # Low tone alert
        except Exception:
            pass


class InventoryAuditTab(QWidget):
    """5-Minute Hybrid Inventory Audit Terminal."""
    audit_completed = pyqtSignal(int)

    def __init__(self, db: DatabaseManager, current_role: str = "Owner", current_user: str = "Staff", parent=None):
        super().__init__(parent)
        self.db = db
        self.current_role = current_role
        self.current_user = current_user
        self.audit_id: Optional[int] = None

        self._init_ui()
        self.start_new_audit()

    def set_user_role(self, role: str, user_name: str):
        self.current_role = role
        self.current_user = user_name

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 12, 12, 12)
        main_layout.setSpacing(10)

        # ----------------------------------------------------------------------
        # Top Header & Fast Filter Bar
        # ----------------------------------------------------------------------
        top_card = QFrame()
        top_card.setObjectName("card")
        top_layout = QHBoxLayout(top_card)

        lbl_title = QLabel("🔍 جرد المخزن السريع خلال 5 دقائق (5-Minute Hybrid Audit)")
        lbl_title.setObjectName("title")
        top_layout.addWidget(lbl_title)

        top_layout.addStretch()

        top_layout.addWidget(QLabel("تصفية نطاق الجرد:"))
        self.cb_filter_cond = QComboBox()
        self.cb_filter_cond.addItems(["ALL (كامل المخزن)", "New (الجديد فقط)", "Used (المستعمل فقط)"])
        top_layout.addWidget(self.cb_filter_cond)

        self.cb_filter_brand = QComboBox()
        self.cb_filter_brand.addItems(["ALL (جميع الماركات)", "Apple", "Samsung", "Xiaomi", "Oppo", "Realme", "Other"])
        top_layout.addWidget(self.cb_filter_brand)

        self.btn_restart = QPushButton("🔄 بدء جلسة جرد جديدة")
        self.btn_restart.clicked.connect(self.start_new_audit)
        top_layout.addWidget(self.btn_restart)

        main_layout.addWidget(top_card)

        # ----------------------------------------------------------------------
        # Fast Barcode / USB Scanner Bar
        # ----------------------------------------------------------------------
        scan_card = QFrame()
        scan_card.setObjectName("card-highlight")
        s_layout = QHBoxLayout(scan_card)

        lbl_scan = QLabel("⚡ مسح الباركود / IMEI:")
        lbl_scan.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 14px;")
        s_layout.addWidget(lbl_scan)

        self.txt_scan = QLineEdit()
        self.txt_scan.setPlaceholderText("وجه قارئ الباركود أو اكتب السريال واضغط Enter...")
        self.txt_scan.setStyleSheet("font-size: 14px; font-weight: bold; padding: 7px;")
        self.txt_scan.returnPressed.connect(self._on_desktop_scan)
        s_layout.addWidget(self.txt_scan)

        btn_submit = QPushButton("مسح")
        btn_submit.clicked.connect(self._on_desktop_scan)
        s_layout.addWidget(btn_submit)

        lbl_tg_badge = QLabel("📱 كاميرا تيليجرام: متزامنة وتستقبل فورياً")
        lbl_tg_badge.setStyleSheet("color: #38BDF8; font-weight: bold; padding: 4px 8px; background-color: #0E2938; border-radius: 4px;")
        s_layout.addWidget(lbl_tg_badge)

        main_layout.addWidget(scan_card)

        # ----------------------------------------------------------------------
        # Real-time KPI Stats Badges
        # ----------------------------------------------------------------------
        kpi_card = QFrame()
        kpi_card.setObjectName("card")
        k_layout = QHBoxLayout(kpi_card)
        k_layout.setSpacing(14)

        self.lbl_expected = self._create_kpi_pill(k_layout, "📦 المتوقع بالمخزن", "0", "#9CA3AF")
        self.lbl_scanned = self._create_kpi_pill(k_layout, "⚡ إجمالي الممسوح", "0", "#38BDF8")
        self.lbl_matched = self._create_kpi_pill(k_layout, "✅ تم تأكيد وجوده (Matched)", "0", "#10B981")
        self.lbl_missing = self._create_kpi_pill(k_layout, "❌ متبقي / عجز (Missing)", "0", "#EF4444")
        self.lbl_surplus = self._create_kpi_pill(k_layout, "⚠️ أجهزة غير متوقعة (Surplus)", "0", "#F59E0B")

        main_layout.addWidget(kpi_card)

        # ----------------------------------------------------------------------
        # Dual Tables Splitter: Left (Missing / Pending) | Right (Verified Present)
        # ----------------------------------------------------------------------
        splitter = QSplitter(Qt.Orientation.Horizontal)

        # LEFT: Missing Devices
        p_missing = QFrame()
        p_missing.setObjectName("card")
        l_miss = QVBoxLayout(p_missing)
        l_miss.setContentsMargins(6, 6, 6, 6)

        lbl_miss_hdr = QLabel("🔴 أجهزة متبقية بالجرد لم يتم مسحها بعد (Missing Items):")
        lbl_miss_hdr.setStyleSheet("color: #EF4444; font-weight: bold;")
        l_miss.addWidget(lbl_miss_hdr)

        self.table_missing = QTableWidget()
        self.table_missing.setColumnCount(4)
        self.table_missing.setHorizontalHeaderLabels(["كود المخزن", "الماركة والموديل", "IMEI", "السعر"])
        self.table_missing.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table_missing.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table_missing.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        l_miss.addWidget(self.table_missing)

        splitter.addWidget(p_missing)

        # RIGHT: Verified Present
        p_verified = QFrame()
        p_verified.setObjectName("card")
        l_ver = QVBoxLayout(p_verified)
        l_ver.setContentsMargins(6, 6, 6, 6)

        lbl_ver_hdr = QLabel("🟢 أجهزة تم جردها وتأكيد وجودها (Verified & Scanned):")
        lbl_ver_hdr.setStyleSheet("color: #10B981; font-weight: bold;")
        l_ver.addWidget(lbl_ver_hdr)

        self.table_verified = QTableWidget()
        self.table_verified.setColumnCount(4)
        self.table_verified.setHorizontalHeaderLabels(["الكود الممسوح", "بيانات الجهاز", "وقت المسح", "طريقة المسح"])
        self.table_verified.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table_verified.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table_verified.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        l_ver.addWidget(self.table_verified)

        splitter.addWidget(p_verified)
        main_layout.addWidget(splitter)

        # ----------------------------------------------------------------------
        # Footer Bar: Complete Audit & Export
        # ----------------------------------------------------------------------
        footer_card = QFrame()
        footer_card.setObjectName("card")
        ft_layout = QHBoxLayout(footer_card)

        self.lbl_audit_status = QLabel("الجلسة: جارية...")
        self.lbl_audit_status.setStyleSheet("color: #D4AF37; font-weight: bold;")
        ft_layout.addWidget(self.lbl_audit_status)

        ft_layout.addStretch()

        self.btn_finish = QPushButton("🏁 إنهاء الجرد واعتماد النتائج")
        self.btn_finish.setObjectName("btnPrimary")
        self.btn_finish.clicked.connect(self._finish_audit)
        ft_layout.addWidget(self.btn_finish)

        main_layout.addWidget(footer_card)

    def _create_kpi_pill(self, parent_layout: QHBoxLayout, title: str, init_val: str, color: str) -> QLabel:
        frame = QFrame()
        frame.setStyleSheet("background-color: #1F1F28; border: 1px solid #282834; border-radius: 6px; padding: 6px;")
        fl = QVBoxLayout(frame)
        fl.setContentsMargins(6, 4, 6, 4)
        fl.setSpacing(2)

        t_lbl = QLabel(title)
        t_lbl.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        fl.addWidget(t_lbl)

        v_lbl = QLabel(init_val)
        v_lbl.setStyleSheet(f"color: {color}; font-weight: bold; font-size: 16px;")
        fl.addWidget(v_lbl)

        parent_layout.addWidget(frame)
        return v_lbl

    def start_new_audit(self):
        cond_text = self.cb_filter_cond.currentText()
        brand_text = self.cb_filter_brand.currentText()

        filter_cond = "New" if "New" in cond_text else ("Used" if "Used" in cond_text else "ALL")
        filter_brand = brand_text.split()[0] if "ALL" not in brand_text else "ALL"

        self.audit_id = self.db.start_inventory_audit(
            auditor=self.current_user,
            filter_condition=filter_cond,
            filter_brand=filter_brand
        )
        self.lbl_audit_status.setText(f"الجلسة رقم #{self.audit_id}: جارية...")
        self.refresh_audit_view()
        self.txt_scan.setFocus()

    def _on_desktop_scan(self):
        code = self.txt_scan.text().strip()
        if not code:
            return
        self.process_scan(code, scanner_type="desktop_usb")
        self.txt_scan.clear()
        self.txt_scan.setFocus()

    @pyqtSlot(str, str)
    def on_external_telegram_scan(self, code: str, scanner_name: str):
        """Slot connected to Telegram bot signal when staff scans via phone camera."""
        self.process_scan(code, scanner_type=f"telegram_bot ({scanner_name})")

    def process_scan(self, code: str, scanner_type: str = "desktop_usb"):
        if not self.audit_id:
            return

        res = self.db.record_audit_scan(
            audit_id=self.audit_id,
            imei_or_stock=code,
            scanner_type=scanner_type
        )

        status = res.get("status")
        if status == "matched":
            play_chime("match")
        elif status == "duplicate":
            play_chime("duplicate")
        else:
            play_chime("alert")

        self.refresh_audit_view()

    def refresh_audit_view(self):
        if not self.audit_id:
            return

        results = self.db.get_audit_results(self.audit_id)
        if not results:
            return

        audit = results.get("audit", {})
        scanned = results.get("scanned_items", [])
        missing = results.get("missing_devices", [])

        total_exp = audit.get("total_expected", 0)
        total_scanned = len(scanned)
        matched_count = len([s for s in scanned if s.get("status") == "matched"])
        surplus_count = len([s for s in scanned if s.get("status") == "unexpected"])
        missing_count = len(missing)

        self.lbl_expected.setText(str(total_exp))
        self.lbl_scanned.setText(str(total_scanned))
        self.lbl_matched.setText(str(matched_count))
        self.lbl_missing.setText(str(missing_count))
        self.lbl_surplus.setText(str(surplus_count))

        # Populate Missing Table
        self.table_missing.setRowCount(len(missing))
        for idx, m in enumerate(missing):
            self.table_missing.setItem(idx, 0, QTableWidgetItem(m.get("stock_no", "")))
            self.table_missing.setItem(idx, 1, QTableWidgetItem(f"{m.get('brand','')} {m.get('model_name','')}"))
            self.table_missing.setItem(idx, 2, QTableWidgetItem(m.get("imei1", "")))
            self.table_missing.setItem(idx, 3, QTableWidgetItem(f"{float(m.get('target_selling_price') or 0.0):,.0f}"))

        # Populate Verified Table
        self.table_verified.setRowCount(len(scanned))
        for idx, s in enumerate(scanned):
            code_item = QTableWidgetItem(s.get("imei", ""))
            if s.get("status") == "unexpected":
                code_item.setForeground(Qt.GlobalColor.darkYellow)
            else:
                code_item.setForeground(Qt.GlobalColor.green)
            self.table_verified.setItem(idx, 0, code_item)

            dev_name = f"{s.get('brand','')} {s.get('model_name','')}" if s.get("model_name") else "غير مسجل بالمخزن (Surplus)"
            self.table_verified.setItem(idx, 1, QTableWidgetItem(dev_name))
            self.table_verified.setItem(idx, 2, QTableWidgetItem(s.get("scanned_at", "")[11:19]))
            self.table_verified.setItem(idx, 3, QTableWidgetItem(s.get("scanner_type", "")))

    def _finish_audit(self):
        if not self.audit_id:
            return
        results = self.db.finish_inventory_audit(self.audit_id)
        self.lbl_audit_status.setText(f"الجلسة رقم #{self.audit_id}: تم الاعتماد بنجاح ✓")
        QMessageBox.information(
            self, "تم إنهاء الجرد",
            f"✅ تم الانتهاء من جرد المخزن واعتماده بنجاح!\n"
            f"المتوقع: {results.get('total_expected')}\n"
            f"تم تأكيده: {results.get('total_scanned') - results.get('surplus_count', 0)}\n"
            f"العجز (المفقود): {results.get('missing_count')}\n"
            f"الزيادة غير المسجلة: {results.get('surplus_count')}"
        )
        self.audit_completed.emit(self.audit_id)
