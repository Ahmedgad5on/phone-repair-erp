"""
ui/pin_dialog.py — Owner & Salesperson PIN Authentication Dialogs
"""
from typing import Optional
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QMessageBox, QFrame
)
from core.database import DatabaseManager


class PinDialog(QDialog):
    """Secure dialog for authenticating Owner or authorizing actions with rate-limiting."""

    def __init__(
        self,
        db: Optional[DatabaseManager] = None,
        required_role: str = "Owner",
        parent=None,
        title: Optional[str] = None
    ):
        super().__init__(parent)
        if db is not None:
            self.db = db
        elif parent is not None and hasattr(parent, "db") and parent.db is not None:
            self.db = parent.db
        else:
            self.db = DatabaseManager()

        self.required_role = required_role
        self.authorized = False
        self.entered_pin = ""
        self._failed_attempts = 0
        self._max_attempts = 5
        self._lockout_active = False

        self.setWindowTitle(title or f"تأكيد الصلاحية — {required_role}")
        self.setFixedSize(360, 240)
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
        if self._lockout_active:
            QMessageBox.critical(self, "محظور مؤقتاً", "تم تجاوز الحد الأقصى للمحاولات الخاطئة. يرجى الانتظار.")
            return

        entered = self.txt_pin.text().strip()
        self.entered_pin = entered

        is_valid = False
        if hasattr(self.db, "verify_pin"):
            is_valid = self.db.verify_pin(entered, role=self.required_role)
        else:
            expected = self.db.get_setting("owner_pin", "1234") if self.required_role == "Owner" else self.db.get_setting("sales_pin", "0000")
            is_valid = (entered == expected)

        if is_valid:
            self.authorized = True
            self._failed_attempts = 0
            self.accept()
        else:
            self._failed_attempts += 1
            if self._failed_attempts >= self._max_attempts:
                self._lockout_active = True
                self.txt_pin.setEnabled(False)
                if hasattr(self.db, "log_security_event"):
                    self.db.log_security_event(
                        action_type="pin_brute_force_lockout",
                        user_role=self.required_role,
                        user_name="Unknown",
                        details=f"Locked out after {self._failed_attempts} failed PIN attempts"
                    )
                QMessageBox.critical(
                    self,
                    "إغلاق أمني مؤقت",
                    f"تم حظر الإدخال مؤقتاً بعد {self._failed_attempts} محاولات خاطئة. انتظر 10 ثوانٍ."
                )
                QTimer.singleShot(10000, self._reset_lockout)
            else:
                remaining = self._max_attempts - self._failed_attempts
                QMessageBox.warning(
                    self,
                    "خطأ",
                    f"رمز المرور (PIN) غير صحيح! متبقي {remaining} محاولات."
                )
            self.txt_pin.clear()
            self.txt_pin.setFocus()

    def _reset_lockout(self):
        self._lockout_active = False
        self._failed_attempts = 0
        self.txt_pin.setEnabled(True)
        self.txt_pin.setFocus()

    def is_correct(self, expected_pin: Optional[str] = None) -> bool:
        """Compatibility helper to verify correctness."""
        if self.authorized:
            return True
        if expected_pin is not None and self.entered_pin:
            return self.entered_pin == expected_pin
        return False
