"""
ui/update_dialog.py — Software Release Update Dialog
Displays available update notifications, mandatory flags, changelog/release notes,
and download progress bar before executing the standalone updater.
"""
import logging
from typing import Optional, Dict, Any
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QMessageBox, QFrame, QTextEdit, QProgressBar, QApplication
)

from core.version import APP_VERSION
from core.licensing.update_checker import UpdateChecker
from ui.styles import (
    LUXURY_DARK_QSS, ACCENT_GOLD, BG_CARD, BORDER_GLASS,
    TEXT_WHITE, TEXT_SILVER, TEXT_MUTED, STATUS_CONNECTED, STATUS_ALERT, STATUS_WARNING
)

logger = logging.getLogger("thermal_lab.ui.update_dialog")


class DownloadWorker(QThread):
    progress = pyqtSignal(int, int)
    finished_download = pyqtSignal(bool, str, object)

    def __init__(self, checker: UpdateChecker, download_url: str, expected_sha256: Optional[str]):
        super().__init__()
        self.checker = checker
        self.download_url = download_url
        self.expected_sha256 = expected_sha256

    def run(self):
        def on_progress(downloaded, total):
            self.progress.emit(downloaded, total)

        ok, pkg_path, msg = self.checker.download_update_package(
            self.download_url,
            expected_sha256=self.expected_sha256,
            progress_callback=on_progress
        )
        self.finished_download.emit(ok, msg, pkg_path)


class UpdateDialog(QDialog):
    """Dialog prompting customer to review and install new software releases."""

    def __init__(self, update_info: Dict[str, Any], parent=None, checker: Optional[UpdateChecker] = None):
        super().__init__(parent)
        self.update_info = update_info
        self.checker = checker or UpdateChecker()
        self.download_worker: Optional[DownloadWorker] = None

        self.setWindowTitle("تحديث جديد متوفر — ProLab Studio")
        self.setFixedSize(520, 520)
        self.setStyleSheet(LUXURY_DARK_QSS)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(14)

        # Header card
        header = QFrame()
        header.setStyleSheet(f"""
            QFrame {{
                background-color: {BG_CARD};
                border: 1px solid {BORDER_GLASS};
                border-radius: 8px;
                padding: 12px;
            }}
        """)
        h_layout = QVBoxLayout(header)
        h_layout.setSpacing(6)

        title = QLabel("🚀 إصدار جديد متاح للترقية")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet(f"font-size: 17px; font-weight: bold; color: {ACCENT_GOLD};")
        h_layout.addWidget(title)

        latest_ver = self.update_info.get("latest_version", "1.0.0")
        ver_lbl = QLabel(f"الإصدار الحالي: v{APP_VERSION}  ⬅️  الإصدار الجديد: v{latest_ver}")
        ver_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ver_lbl.setStyleSheet(f"font-size: 13px; font-weight: bold; color: {TEXT_WHITE};")
        h_layout.addWidget(ver_lbl)

        is_mandatory = self.update_info.get("is_mandatory", False)
        if is_mandatory:
            mand_lbl = QLabel("⚠️ هذا التحديث إلزامي لضمان التوافق مع خادم الترخيص والبيانات.")
            mand_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            mand_lbl.setStyleSheet(f"font-size: 11px; font-weight: bold; color: {STATUS_ALERT};")
            h_layout.addWidget(mand_lbl)

        layout.addWidget(header)

        # Release Notes
        layout.addWidget(QLabel("سجل التغييرات والتحسينات (Release Notes):"))
        self.txt_notes = QTextEdit()
        self.txt_notes.setReadOnly(True)
        notes = self.update_info.get("release_notes", "تحسينات عامة في الأداء والاستقرار وإصلاح المشاكل.")
        self.txt_notes.setPlainText(notes)
        self.txt_notes.setStyleSheet(f"""
            QTextEdit {{
                background: #14141E;
                color: {TEXT_SILVER};
                border: 1px solid {BORDER_GLASS};
                border-radius: 6px;
                font-size: 12px;
                padding: 8px;
            }}
        """)
        layout.addWidget(self.txt_notes)

        # Download progress bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setStyleSheet(f"""
            QProgressBar {{
                background-color: #14141E;
                border: 1px solid {BORDER_GLASS};
                border-radius: 6px;
                text-align: center;
                color: {TEXT_WHITE};
                height: 22px;
            }}
            QProgressBar::chunk {{
                background-color: {ACCENT_GOLD};
                border-radius: 5px;
            }}
        """)
        self.progress_bar.hide()
        layout.addWidget(self.progress_bar)

        self.lbl_status = QLabel("")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_status.hide()
        layout.addWidget(self.lbl_status)

        # Action Buttons
        btn_layout = QHBoxLayout()
        self.btn_later = QPushButton("تذكيري لاحقاً")
        self.btn_later.setEnabled(not is_mandatory)
        self.btn_later.clicked.connect(self.reject)
        btn_layout.addWidget(self.btn_later)

        btn_layout.addStretch()

        self.btn_install = QPushButton("تحميل وتثبيت التحديث الآن")
        self.btn_install.setObjectName("btnPrimary")
        self.btn_install.setFixedHeight(38)
        self.btn_install.clicked.connect(self._start_download)
        btn_layout.addWidget(self.btn_install)

        layout.addLayout(btn_layout)

    def _start_download(self):
        download_url = self.update_info.get("download_url")
        if not download_url:
            QMessageBox.warning(self, "تنبيه", "رابط التحميل غير متوفر حالياً من الخادم.")
            return

        sha256 = self.update_info.get("package_sha256")

        self.btn_install.setEnabled(False)
        self.btn_later.setEnabled(False)
        self.progress_bar.show()
        self.lbl_status.show()
        self.lbl_status.setText("جاري تحميل التحديث والتحقق من التجزئة الأمنية...")

        self.download_worker = DownloadWorker(self.checker, download_url, sha256)
        self.download_worker.progress.connect(self._on_progress)
        self.download_worker.finished_download.connect(self._on_download_finished)
        self.download_worker.start()

    def _on_progress(self, downloaded: int, total: int):
        if total > 0:
            percent = int((downloaded / total) * 100)
            self.progress_bar.setValue(percent)
            mb_down = downloaded / (1024 * 1024)
            mb_total = total / (1024 * 1024)
            self.lbl_status.setText(f"تم تحميل {mb_down:.1f} MB من أصل {mb_total:.1f} MB ({percent}%)")
        else:
            self.progress_bar.setRange(0, 0)  # indeterminate

    def _on_download_finished(self, success: bool, message: str, package_path):
        if not success or not package_path:
            self.progress_bar.hide()
            self.lbl_status.setText(f"❌ {message}")
            self.lbl_status.setStyleSheet(f"color: {STATUS_ALERT}; font-weight: bold;")
            self.btn_install.setEnabled(True)
            self.btn_later.setEnabled(True)
            QMessageBox.critical(self, "فشل التحميل", message)
            return

        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(100)
        self.lbl_status.setText("✅ تم التحقق من سلامة الحزمة! جاري تشغيل المثبت...")
        self.lbl_status.setStyleSheet(f"color: {STATUS_CONNECTED}; font-weight: bold;")

        # Launch updater and exit
        launched = self.checker.launch_standalone_updater(package_path)
        if launched:
            QMessageBox.information(
                self,
                "إعادة التشغيل للتحديث",
                "تم تجهيز التحديث بنجاح!\nسيتم الآن إغلاق البرنامج وتشغيل المحدث التلقائي لتركيب الملفات وعمل نسخة احتياطية من قاعدة البيانات."
            )
            QApplication.quit()
        else:
            QMessageBox.critical(self, "خطأ", "تعذر تشغيل المحدث التلقائي. يرجى مراجعة سجلات التشغيل.")
            self.btn_install.setEnabled(True)
            self.btn_later.setEnabled(True)
