"""
ui/intake_tab.py — Mode 2: Workshop Service & Repair Intake (استلام صيانة)
Features:
- Auto-generated Ticket ID (TKT-000001) with database persistence.
- Customer details (Arabic/English Name, Phone #, Passcode/Pattern).
- Device Model & Reported Fault description.
- Security & Condition Checkboxes: SIM Removed, Back Cracked, Dead Device (قاطع باور).
- Estimated Cost ($/EGP).
- "Print Triple-Tag (Customer + Phone + Part)" option for 3-part workshop tags.
- Direct 1-Click Print Ticket button with thermal spooler routing.
"""
from datetime import datetime
from typing import Optional
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QLineEdit, QCheckBox, QPushButton, QScrollArea, QFrame, QMessageBox
)

from core.models import RepairTicket
from core.database import DatabaseManager


class RepairIntakeTab(QWidget):
    """
    Mode 2: Service & Repair Intake Form with Triple-Tag Printing.
    """
    ticket_changed = pyqtSignal(object)           # RepairTicket
    print_ticket_requested = pyqtSignal(object, bool)   # (RepairTicket, is_triple_tag)

    def __init__(self, db: Optional[DatabaseManager] = None, parent=None):
        super().__init__(parent)
        self.db = db
        self._init_ui()
        self._load_next_ticket_id()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(6, 6, 6, 6)
        main_layout.setSpacing(8)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)

        container = QWidget()
        grid = QGridLayout(container)
        grid.setContentsMargins(6, 6, 6, 6)
        grid.setHorizontalSpacing(10)
        grid.setVerticalSpacing(8)

        # 1. Ticket ID & Intake Date
        lbl_tkt = QLabel("Ticket ID:")
        lbl_tkt.setStyleSheet("color: #D4AF37; font-weight: bold;")
        self.edit_ticket_id = QLineEdit("TKT-000001")
        self.edit_ticket_id.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_tkt, 0, 0)
        grid.addWidget(self.edit_ticket_id, 0, 1)

        lbl_date = QLabel("Date / Time:")
        lbl_date.setStyleSheet("color: #9CA3AF;")
        self.edit_date = QLineEdit(datetime.now().strftime("%Y-%m-%d %H:%M"))
        self.edit_date.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_date, 0, 2)
        grid.addWidget(self.edit_date, 0, 3)

        # 2. Customer Name & Phone
        lbl_name = QLabel("Customer Name:")
        lbl_name.setStyleSheet("color: #9CA3AF;")
        self.edit_name = QLineEdit()
        self.edit_name.setPlaceholderText("Arabic or English Name")
        self.edit_name.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_name, 1, 0)
        grid.addWidget(self.edit_name, 1, 1, 1, 3)

        lbl_phone = QLabel("Customer Phone:")
        lbl_phone.setStyleSheet("color: #9CA3AF;")
        self.edit_phone = QLineEdit()
        self.edit_phone.setPlaceholderText("01XXXXXXXXX")
        self.edit_phone.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_phone, 2, 0)
        grid.addWidget(self.edit_phone, 2, 1)

        lbl_passcode = QLabel("Screen Lock / Pin:")
        lbl_passcode.setStyleSheet("color: #9CA3AF;")
        self.edit_passcode = QLineEdit()
        self.edit_passcode.setPlaceholderText("e.g. 1234 or Pattern")
        self.edit_passcode.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_passcode, 2, 2)
        grid.addWidget(self.edit_passcode, 2, 3)

        # 3. Device Model & Reported Fault
        lbl_model = QLabel("Device Model:")
        lbl_model.setStyleSheet("color: #9CA3AF;")
        self.edit_model = QLineEdit()
        self.edit_model.setPlaceholderText("e.g. iPhone 14 Pro / Galaxy S23")
        self.edit_model.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_model, 3, 0)
        grid.addWidget(self.edit_model, 3, 1, 1, 3)

        lbl_fault = QLabel("Reported Fault (العطل):")
        lbl_fault.setStyleSheet("color: #D4AF37; font-weight: bold;")
        self.edit_fault = QLineEdit()
        self.edit_fault.setPlaceholderText("Broken screen, Battery replacement, Audio fault...")
        self.edit_fault.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_fault, 4, 0)
        grid.addWidget(self.edit_fault, 4, 1, 1, 3)

        # 4. Security & Condition Checkboxes
        lbl_status = QLabel("Condition / State:")
        lbl_status.setStyleSheet("color: #9CA3AF;")
        grid.addWidget(lbl_status, 5, 0)

        chk_layout = QHBoxLayout()
        self.chk_sim = QCheckBox("SIM Removed")
        self.chk_sim.setChecked(True)
        self.chk_sim.toggled.connect(self._notify_changed)

        self.chk_crack = QCheckBox("Back Cracked")
        self.chk_crack.setChecked(False)
        self.chk_crack.toggled.connect(self._notify_changed)

        self.chk_dead = QCheckBox("Dead Device (قاطع باور)")
        self.chk_dead.setChecked(False)
        self.chk_dead.toggled.connect(self._notify_changed)

        chk_layout.addWidget(self.chk_sim)
        chk_layout.addWidget(self.chk_crack)
        chk_layout.addWidget(self.chk_dead)
        grid.addLayout(chk_layout, 5, 1, 1, 3)

        # 5. Estimated Cost
        lbl_cost = QLabel("Estimated Cost ($):")
        lbl_cost.setStyleSheet("color: #9CA3AF;")
        self.edit_cost = QLineEdit("0.00")
        self.edit_cost.setPlaceholderText("0.00")
        self.edit_cost.textChanged.connect(self._notify_changed)
        grid.addWidget(lbl_cost, 6, 0)
        grid.addWidget(self.edit_cost, 6, 1)

        # 6. Triple-Tag Option
        self.chk_triple = QCheckBox("Print Triple-Tag (Customer + Phone + Part Tags)")
        self.chk_triple.setToolTip("Prints 3 distinct thermal tags for customer claim, device body, and parts bin")
        self.chk_triple.setStyleSheet("color: #D4AF37; font-weight: bold; font-size: 11px;")
        grid.addWidget(self.chk_triple, 6, 2, 1, 2)

        scroll.setWidget(container)
        main_layout.addWidget(scroll)

        # Buttons
        btn_layout = QHBoxLayout()
        self.btn_clear = QPushButton("Clear Form")
        self.btn_clear.clicked.connect(self.clear_form)
        btn_layout.addWidget(self.btn_clear)

        self.btn_print = QPushButton("🖨️ Print Repair Ticket")
        self.btn_print.setObjectName("GoldBtn")
        self.btn_print.setStyleSheet("""
            QPushButton {
                background-color: #D4AF37; color: #0D0D11; font-weight: bold;
                padding: 8px 16px; border-radius: 4px;
            }
            QPushButton:hover { background-color: #E5C158; }
        """)
        self.btn_print.clicked.connect(self._on_print_clicked)
        btn_layout.addWidget(self.btn_print)

        main_layout.addLayout(btn_layout)

    def _load_next_ticket_id(self):
        if self.db:
            try:
                next_id = self.db.get_next_ticket_id()
                self.edit_ticket_id.setText(next_id)
            except Exception:
                pass

    def get_ticket(self) -> RepairTicket:
        try:
            cost = float(self.edit_cost.text().strip().replace("$", "") or 0.0)
        except ValueError:
            cost = 0.0

        return RepairTicket(
            ticket_id=self.edit_ticket_id.text().strip() or "TKT-000001",
            customer_name=self.edit_name.text().strip() or "Walk-in Customer",
            customer_phone=self.edit_phone.text().strip() or "",
            device_model=self.edit_model.text().strip() or "Unknown Device",
            reported_fault=self.edit_fault.text().strip() or "General Inspection",
            passcode=self.edit_passcode.text().strip() or "",
            sim_removed=self.chk_sim.isChecked(),
            back_cracked=self.chk_crack.isChecked(),
            dead_device=self.chk_dead.isChecked(),
            estimated_cost=cost,
            intake_datetime=self.edit_date.text().strip() or datetime.now().strftime("%Y-%m-%d %H:%M")
        )

    def _notify_changed(self):
        ticket = self.get_ticket()
        self.ticket_changed.emit(ticket)

    def _on_print_clicked(self):
        ticket = self.get_ticket()
        if not ticket.device_model or ticket.device_model == "Unknown Device":
            QMessageBox.warning(self, "Missing Model", "Please enter device model before printing.")
            return
        is_triple = self.chk_triple.isChecked()
        self.print_ticket_requested.emit(ticket, is_triple)

    def clear_form(self):
        self.edit_name.clear()
        self.edit_phone.clear()
        self.edit_model.clear()
        self.edit_fault.clear()
        self.edit_passcode.clear()
        self.chk_sim.setChecked(True)
        self.chk_crack.setChecked(False)
        self.chk_dead.setChecked(False)
        self.edit_cost.setText("0.00")
        self.edit_date.setText(datetime.now().strftime("%Y-%m-%d %H:%M"))
        self._load_next_ticket_id()
