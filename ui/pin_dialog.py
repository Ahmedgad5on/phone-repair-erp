"""
ui/pin_dialog.py — Owner & Salesperson PIN Authentication Dialogs
"""
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QMessageBox, QFrame
)
from core.database import DatabaseManager


class PinDialog(QDialog):
    """Secure dialog for authenticating Owner or authorizing actions."""

    def __init__(self, db: DatabaseManager, required_role: str = "Owner", parent=None):
        super().__init__(parent)
        self.db = db
        self.required_role = required_role
        self.authorized = False

        self.setWindowTitle(f"تأكيد الصلاحية — {required_role}")
        self.setFixedSize(360, 220)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(14)

        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setSpacing(10)

        title = QLabel(f"🔐 التحقق من صلاحيات {self.required_role}")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(title)

        desc = QLabel("يرجى إدخال رمز المرور (PIN) السري للمتابعة:")
        desc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(desc)

        self.txt_pin = QLineEdit()
        self.txt_pin.setEchoMode(QLineEdit.EchoMode.Password)
        self.txt_pin.setPlaceholderText("••••")
        self.txt_pin.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.txt_pin.setStyleSheet("font-size: 22px; font-weight: bold; letter-spacing: 6px; padding: 6px;")
        self.txt_pin.returnPressed.connect(self._verify_pin)
        card_layout.addWidget(self.txt_pin)

        layout.addWidget(card)

        btn_row = QHBoxLayout()
        btn_cancel = QPushButton("إلغاء")
        btn_cancel.clicked.connect(self.reject)
        btn_row.addWidget(btn_cancel)

        btn_ok = QPushButton("تأكيد الدخول")
        btn_ok.setObjectName("btnPrimary")
        btn_ok.clicked.connect(self._verify_pin)
        btn_row.addWidget(btn_ok)

        layout.addLayout(btn_row)
        self.txt_pin.setFocus()

    def _verify_pin(self):
        entered = self.txt_pin.text().strip()
        expected = self.db.get_setting("owner_pin", "1234") if self.required_role == "Owner" else self.db.get_setting("sales_pin", "0000")
        if entered == expected:
            self.authorized = True
            self.accept()
        else:
            QMessageBox.warning(self, "خطأ", "رمز المرور (PIN) غير صحيح! حاول مرة أخرى.")
            self.txt_pin.clear()
            self.txt_pin.setFocus()
