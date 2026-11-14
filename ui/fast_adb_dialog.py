"""
ui/fast_adb_dialog.py — Fast ADB Enabler & Guided Activation Terminal
Features:
- Real-time background ADB polling (Detects Disconnected, Unauthorized, and Authorized states).
- Brand-Specific Interactive Guides (Oppo/Realme, Samsung, Xiaomi, Honor/Huawei, Vivo).
- Live feedback when user taps 'Allow USB Debugging' on phone.
- Samsung AT Modem & Dial Code helpers.
"""
from typing import Optional, Dict, Any
import subprocess
import sys

from PyQt6.QtCore import Qt, QTimer, pyqtSignal, pyqtSlot, QThread
from PyQt6.QtWidgets import (
    QWidget, QDialog, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel,
    QPushButton, QFrame, QMessageBox, QApplication, QTabWidget,
    QProgressBar, QTextEdit
)

from core.paths import get_binary_path, setup_adb_environment

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


class AdbStatePollWorker(QThread):
    """Background thread that actively checks real ADB connection state."""
    state_polled = pyqtSignal(str, str, str)  # (state, serial, details)

    def __init__(self, adb_path: str, adb_env: dict):
        super().__init__()
        self.adb_path = adb_path
        self.adb_env = adb_env
        self._running = True

    def run(self):
        while self._running:
            state = "disconnected"
            serial = ""
            details = "لا يوجد هاتف متصل حالياً عبر كابل USB أو أن وضع تصحيح الأخطاء مغلق."

            try:
                p = subprocess.run(
                    [self.adb_path, "devices", "-l"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    creationflags=CREATE_NO_WINDOW,
                    env=self.adb_env,
                    timeout=3
                )
                lines = [line.strip() for line in p.stdout.splitlines() if line.strip() and not line.startswith("*")]

                # Skip header 'List of devices attached'
                dev_lines = [l for l in lines if not l.startswith("List of devices")]
                if dev_lines:
                    first = dev_lines[0].split()
                    serial = first[0]
                    if len(first) > 1:
                        status_str = first[1].lower()
                        if "device" in status_str:
                            state = "authorized"
                            details = f"متصل ومفعل بالكامل (سيريال: {serial})"
                        elif "unauthorized" in status_str:
                            state = "unauthorized"
                            details = f"تم التعرف على الهاتف ({serial}) ولكن بانتظار الضغط على (سماح / Always Allow) على الشاشة!"
                        elif "offline" in status_str:
                            state = "offline"
                            details = f"الهاتف غير متصل بالخدمة (Offline) — جرب فصل الكابل وإعادة توصيله."
            except Exception as e:
                details = f"خطأ في خادم ADB: {e}"

            self.state_polled.emit(state, serial, details)
            self.msleep(1200)

    def stop(self):
        self._running = False
        self.wait(2000)


class FastAdbDialog(QDialog):
    """
    Automated ADB Activation & Step-by-Step Brand Guide Modal.
    """
    adb_connected = pyqtSignal()

    def __init__(self, brand_hint: str = "Android", model_hint: str = "", parent=None):
        super().__init__(parent)
        self.brand_hint = (brand_hint or "Android").lower()
        self.model_hint = model_hint or ""
        self.adb_path = str(get_binary_path("adb"))
        self.adb_env = setup_adb_environment()

        self.setWindowTitle("⚡ تفعيل وسحب بيانات الهاتف (Fast ADB Enabler)")
        self.setFixedSize(680, 600)
        self.setWindowFlags(self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint)

        self._init_ui()
        self._start_worker()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        # Header Card
        header_card = QFrame()
        header_card.setObjectName("card-highlight")
        h_layout = QVBoxLayout(header_card)
        h_layout.setSpacing(4)

        title = QLabel("⚡ تفعيل وضع تصحيح الأخطاء وسحب البيانات (ADB Guide)")
        title.setObjectName("title")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet("font-size: 16px; font-weight: 800; color: #D4AF37;")
        h_layout.addWidget(title)

        subtitle = QLabel("تابع الخطوات السريعة للبراند الخاص بهاتفك لتفعيل وضع نقل البيانات")
        subtitle.setStyleSheet("color: #9CA3AF; font-size: 11px;")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        h_layout.addWidget(subtitle)
        layout.addWidget(header_card)

        # Live Real-Time Telemetry Card
        self.telemetry_card = QFrame()
        self.telemetry_card.setObjectName("card")
        self.telemetry_card.setStyleSheet("background-color: #121217; border: 1px solid #282834; border-radius: 6px;")
        t_layout = QVBoxLayout(self.telemetry_card)
        t_layout.setContentsMargins(12, 10, 12, 10)
        t_layout.setSpacing(4)

        self.lbl_status_badge = QLabel("● جاري فحص كابل USB وحالة تصحيح الأخطاء...")
        self.lbl_status_badge.setStyleSheet("font-size: 13px; font-weight: bold; color: #F59E0B;")
        t_layout.addWidget(self.lbl_status_badge)

        self.lbl_status_desc = QLabel("تأكد من توصيل كابل USB أصلي بالكمبيوتر مباشرة.")
        self.lbl_status_desc.setStyleSheet("font-size: 11px; color: #9CA3AF;")
        t_layout.addWidget(self.lbl_status_desc)

        layout.addWidget(self.telemetry_card)

        # Brand-Specific Tabs
        self.brand_tabs = QTabWidget()
        self.brand_tabs.setStyleSheet("""
            QTabBar::tab {
                background: #1A1A24;
                color: #9CA3AF;
                padding: 8px 14px;
                font-weight: bold;
                border: 1px solid #282834;
                border-radius: 4px;
                margin-left: 2px;
            }
            QTabBar::tab:selected {
                background: #D4AF37;
                color: #0D0D11;
                border-color: #D4AF37;
            }
        """)

        # TAB 1: OPPO / REALME / ONEPLUS
        tab_oppo = QWidget()
        v_oppo = QVBoxLayout(tab_oppo)
        txt_oppo = QLabel("""
<h3 style="color: #D4AF37; margin-bottom: 4px;">📱 هواتف أوبو وريلمي وون بلس (ColorOS / RealmeUI):</h3>
<ol style="line-height: 1.8; font-size: 12px; margin-top: 0;">
    <li>اسحب شريط الإشعارات من أعلى الشاشة ➔ اضغط على إشعار USB ➔ اختر <b>نقل الملفات (Transfer Files / MTP)</b>.</li>
    <li>افتح <b>الإعدادات (Settings)</b> ➔ <b>حول الجهاز (About device)</b> ➔ <b>الإصدار (Version)</b>.</li>
    <li>اضغط <b>7 مرات متتالية</b> بسرعة على <b>رقم الإصدار (Build number)</b> حتى تظهر رسالة <i>"أنت الآن في وضع المطور!"</i>.</li>
    <li>ارجع للقائمة السابقة ➔ <b>إعدادات إضافية (Additional Settings)</b> ➔ <b>خيارات المطور (Developer options)</b>.</li>
    <li>فعّل مفتاح: <b>تصحيح أخطاء USB (USB Debugging)</b>.</li>
    <li><b style="color: #10B981;">خطوة مهمة:</b> ستظهر رسالة فورية على شاشة الهاتف، ضع علامة صح [✔] على <b>السماح دائماً من هذا الكمبيوتر</b> ثم اضغط <b>موافق (OK)</b>.</li>
</ol>
<p style="font-size: 11px; color: #9CA3AF;">💡 كود فحص سريع في لوحة الاتصال: <code>*#8011#</code> أو <code>*#800#</code></p>
        """)
        txt_oppo.setTextFormat(Qt.TextFormat.RichText)
        txt_oppo.setWordWrap(True)
        v_oppo.addWidget(txt_oppo)
        self.brand_tabs.addTab(tab_oppo, "📱 أوبو / ريلمي (Oppo)")

        # TAB 2: SAMSUNG
        tab_sam = QWidget()
        v_sam = QVBoxLayout(tab_sam)
        txt_sam = QLabel("""
<h3 style="color: #D4AF37; margin-bottom: 4px;">📱 هواتف سامسونج جالاكسي (Samsung Galaxy):</h3>
<ol style="line-height: 1.8; font-size: 12px; margin-top: 0;">
    <li><b>طريقة الكود السري الفوري:</b> افتح لوحة الاتصال واطلب: <code style="color: #D4AF37; font-size: 13px; font-weight: bold;">*#0808#</code></li>
    <li>اختر: <b>USB ➔ AP</b> ثم اختر <b>ADB</b> (أو <b>MTP + ADB</b>) ثم اضغط <b>Reboot</b>.</li>
    <li><b>أو من الإعدادات:</b> افتح <b>الضبط</b> ➔ <b>حول الهاتف</b> ➔ <b>معلومات البرنامج</b> ➔ اضغط 7 مرات على <b>رقم الإصدار</b>.</li>
    <li>ارجع للضبط ➔ <b>خيارات المطور</b> ➔ فعّل <b>تصحيح أخطاء USB</b>.</li>
    <li>انظر لشاشة الهاتف واضغط [✔ السماح دائماً] ثم [موافق].</li>
</ol>
        """)
        txt_sam.setTextFormat(Qt.TextFormat.RichText)
        txt_sam.setWordWrap(True)
        v_sam.addWidget(txt_sam)
        self.brand_tabs.addTab(tab_sam, "📱 سامسونج (Samsung)")

        # TAB 3: XIAOMI / REDMI / POCO
        tab_mi = QWidget()
        v_mi = QVBoxLayout(tab_mi)
        txt_mi = QLabel("""
<h3 style="color: #D4AF37; margin-bottom: 4px;">📱 هواتف شاومي وريدمي وبوكو (MIUI / HyperOS):</h3>
<ol style="line-height: 1.8; font-size: 12px; margin-top: 0;">
    <li>افتح <b>الإعدادات</b> ➔ <b>حول الهاتف (About phone)</b>.</li>
    <li>اضغط <b>7 مرات متتالية</b> على <b>إصدار MIUI</b> أو <b>OS Version</b> حتى يكتب <i>"لقد أصبحت الآن مطور برامج"</i>.</li>
    <li>ارجع للإعدادات ➔ <b>الإعدادات الإضافية</b> ➔ <b>خيارات المطور</b>.</li>
    <li>فعّل خيار: <b>تصحيح أخطاء USB (USB Debugging)</b>.</li>
    <li>فعّل أيضاً: <b>تصحيح أخطاء USB (إعدادات الحماية)</b> للسماح بقراءة المعرفات.</li>
    <li>انظر لشاشة الهاتف واضغط [✔ أوافق] ثم [موافق].</li>
</ol>
        """)
        txt_mi.setTextFormat(Qt.TextFormat.RichText)
        txt_mi.setWordWrap(True)
        v_mi.addWidget(txt_mi)
        self.brand_tabs.addTab(tab_mi, "📱 شاومي (Xiaomi)")

        # TAB 4: HONOR / HUAWEI
        tab_honor = QWidget()
        v_honor = QVBoxLayout(tab_honor)
        txt_honor = QLabel("""
<h3 style="color: #D4AF37; margin-bottom: 4px;">📱 هواتف هونر وهواوي (Honor / Huawei):</h3>
<ol style="line-height: 1.8; font-size: 12px; margin-top: 0;">
    <li><b>كود وضع التصنيع الفوري:</b> افتح لوحة الاتصال واطلب: <code style="color: #D4AF37; font-size: 13px; font-weight: bold;">*#*#2846579#*#*</code></li>
    <li>اختر: <b>ProjectMenu ➔ Background Settings ➔ USB Ports Settings ➔ Manufacture Mode</b>.</li>
    <li><b>أو من الإعدادات:</b> الإعدادات ➔ النظام والتحديثات ➔ حول الهاتف ➔ اضغط 7 مرات على رقم الإصدار ➔ فعّل تصحيح أخطاء USB.</li>
    <li>اضغط [✔ السماح دائماً] ثم [موافق] على شاشة الهاتف.</li>
</ol>
        """)
        txt_honor.setTextFormat(Qt.TextFormat.RichText)
        txt_honor.setWordWrap(True)
        v_honor.addWidget(txt_honor)
        self.brand_tabs.addTab(tab_honor, "📱 هونر وهواوي (Honor)")

        # TAB 5: VIVO
        tab_vivo = QWidget()
        v_vivo = QVBoxLayout(tab_vivo)
        txt_vivo = QLabel("""
<h3 style="color: #D4AF37; margin-bottom: 4px;">📱 هواتف فيفو (Vivo / iQOO):</h3>
<ol style="line-height: 1.8; font-size: 12px; margin-top: 0;">
    <li>كود الاتصال السريع: <code style="color: #D4AF37; font-size: 13px; font-weight: bold;">*#558#</code> ➔ Quality Verification ➔ Development Port Switch.</li>
    <li>أو من الإعدادات ➔ إدارة النظام ➔ حول الهاتف ➔ اضغط 7 مرات على إصدار البرنامج ➔ خيارات المطور ➔ تصحيح أخطاء USB.</li>
</ol>
        """)
        txt_vivo.setTextFormat(Qt.TextFormat.RichText)
        txt_vivo.setWordWrap(True)
        v_vivo.addWidget(txt_vivo)
        self.brand_tabs.addTab(tab_vivo, "📱 فيفو (Vivo)")

        layout.addWidget(self.brand_tabs)

        # Select tab according to detected brand hint
        if "oppo" in self.brand_hint or "realme" in self.brand_hint or "oneplus" in self.brand_hint:
            self.brand_tabs.setCurrentIndex(0)
        elif "sam" in self.brand_hint:
            self.brand_tabs.setCurrentIndex(1)
        elif "xiaomi" in self.brand_hint or "redmi" in self.brand_hint or "poco" in self.brand_hint:
            self.brand_tabs.setCurrentIndex(2)
        elif "honor" in self.brand_hint or "huawei" in self.brand_hint:
            self.brand_tabs.setCurrentIndex(3)
        elif "vivo" in self.brand_hint:
            self.brand_tabs.setCurrentIndex(4)

        # Action Buttons Row
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(10)

        self.btn_refresh = QPushButton("🔄 فحص الاتصال الآن")
        self.btn_refresh.setFixedHeight(36)
        self.btn_refresh.setStyleSheet("""
            QPushButton {
                background-color: #1A1A24; color: #D4AF37; border: 1px solid #D4AF37;
                border-radius: 5px; font-weight: bold; font-size: 12px; padding: 0 16px;
            }
            QPushButton:hover { background-color: #D4AF37; color: #0D0D11; }
        """)
        self.btn_refresh.clicked.connect(self._manual_ping)
        btn_layout.addWidget(self.btn_refresh)

        self.btn_restart_server = QPushButton("⚡ إعادة تشغيل خادم ADB")
        self.btn_restart_server.setFixedHeight(36)
        self.btn_restart_server.setToolTip("إعادة تعيين خادم ADB في الويندوز لحل أي تعليق")
        self.btn_restart_server.clicked.connect(self._restart_adb_daemon)
        btn_layout.addWidget(self.btn_restart_server)

        btn_layout.addStretch()

        self.btn_close = QPushButton("إغلاق النافذة")
        self.btn_close.setFixedHeight(36)
        self.btn_close.setFixedWidth(110)
        self.btn_close.setStyleSheet("""
            QPushButton {
                background-color: #282834; color: #F4F4F6; border: none;
                border-radius: 5px; font-weight: bold; font-size: 12px;
            }
            QPushButton:hover { background-color: #38384A; }
        """)
        self.btn_close.clicked.connect(self.accept)
        btn_layout.addWidget(self.btn_close)

        layout.addLayout(btn_layout)

    def _start_worker(self):
        self.worker = AdbStatePollWorker(self.adb_path, self.adb_env)
        self.worker.state_polled.connect(self._on_state_polled)
        self.worker.start()

    @pyqtSlot(str, str, str)
    def _on_state_polled(self, state: str, serial: str, details: str):
        if state == "authorized":
            self.lbl_status_badge.setText(f"✅ تم الاتصال بنجاح بالهاتف ({serial})!")
            self.lbl_status_badge.setStyleSheet("font-size: 13px; font-weight: bold; color: #10B981;")
            self.lbl_status_desc.setText("جاري إغلاق النافذة وسحب كامل بيانات ومواصفات الهاتف للملصق...")
            self.telemetry_card.setStyleSheet("background-color: #122B1E; border: 1px solid #10B981; border-radius: 6px;")
            self.adb_connected.emit()
            # Stop worker and close after brief confirmation
            QTimer.singleShot(1000, self.accept)

        elif state == "unauthorized":
            self.lbl_status_badge.setText(f"⚠️ انظر لشاشة الهاتف الآن! ({serial})")
            self.lbl_status_badge.setStyleSheet("font-size: 13px; font-weight: bold; color: #F59E0B;")
            self.lbl_status_desc.setText("ضع علامة صح [✔ السماح دائماً من هذا الكمبيوتر] ثم اضغط [موافق / OK] على شاشة الهاتف.")
            self.telemetry_card.setStyleSheet("background-color: #2D2410; border: 1px solid #F59E0B; border-radius: 6px;")

        elif state == "offline":
            self.lbl_status_badge.setText(f"⚠️ الهاتف غير متصل بالخدمة (Offline)")
            self.lbl_status_badge.setStyleSheet("font-size: 13px; font-weight: bold; color: #EF4444;")
            self.lbl_status_desc.setText("يرجى فصل كابل USB وإعادة تركيبه في منفذ USB آخر بالكمبيوتر.")
            self.telemetry_card.setStyleSheet("background-color: #2D1A1A; border: 1px solid #EF4444; border-radius: 6px;")

        else:
            self.lbl_status_badge.setText("● في انتظار تفعيل تصحيح أخطاء USB...")
            self.lbl_status_badge.setStyleSheet("font-size: 13px; font-weight: bold; color: #9CA3AF;")
            self.lbl_status_desc.setText(details)
            self.telemetry_card.setStyleSheet("background-color: #121217; border: 1px solid #282834; border-radius: 6px;")

    def _manual_ping(self):
        try:
            p = subprocess.run(
                [self.adb_path, "devices", "-l"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                creationflags=CREATE_NO_WINDOW,
                env=self.adb_env,
                timeout=4
            )
            QMessageBox.information(self, "نتيجة فحص خادم ADB", f"مخرجات خادم ADB الحالية:\n\n{p.stdout.strip() or 'لا توجد أجهزة متصلة'}")
        except Exception as e:
            QMessageBox.critical(self, "خطأ", f"تعذر استدعاء ADB: {e}")

    def _restart_adb_daemon(self):
        try:
            subprocess.run([self.adb_path, "kill-server"], creationflags=CREATE_NO_WINDOW, env=self.adb_env, timeout=3)
            subprocess.run([self.adb_path, "start-server"], creationflags=CREATE_NO_WINDOW, env=self.adb_env, timeout=5)
            QMessageBox.information(self, "خادم ADB", "✅ تم إعادة تشغيل خادم ADB بنجاح!")
        except Exception as e:
            QMessageBox.warning(self, "خادم ADB", f"حدث تنبيه: {e}")

    def closeEvent(self, event):
        if hasattr(self, "worker"):
            self.worker.stop()
        super().closeEvent(event)
