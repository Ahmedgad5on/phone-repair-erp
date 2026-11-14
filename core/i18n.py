"""
core/i18n.py — Internationalization & Bilingual Localization Engine
Supports instant Arabic (ar) and English (en) dynamic language switching.
"""
from typing import Dict

TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "app_title": {
        "ar": "⚡ Thermal Lab Pro — نظام طباعة ملصقات الهواتف ومختبر الصيانة 203 DPI",
        "en": "⚡ Thermal Lab Pro — Mobile Phone Sales & Repair Lab 203 DPI",
    },
    "brand_header": {
        "ar": "⚡ ثيرمال لاب برو",
        "en": "⚡ Thermal Lab Pro",
    },
    "adb_connected": {"ar": "ADB: متصل", "en": "ADB: Connected"},
    "adb_disconnected": {"ar": "ADB: غير متصل", "en": "ADB: Disconnected"},
    "fastboot_active": {"ar": "Fastboot: نشط", "en": "Fastboot: Active"},
    "fastboot_off": {"ar": "Fastboot: مغلق", "en": "Fastboot: Off"},
    "ios_connected": {"ar": "iOS: متصل", "en": "iOS: Connected"},
    "ios_disconnected": {"ar": "iOS: غير متصل", "en": "iOS: Disconnected"},
    "hardware_source": {"ar": "مصدر الأجهزة:", "en": "Hardware Source:"},
    "source_live": {"ar": "فحص USB الحي المباشر", "en": "Live USB Polling"},
    "source_s24": {"ar": "محاكاة: جالاكسي S24 ألترا (سامسونج)", "en": "Mock: Galaxy S24 Ultra"},
    "source_iphone16": {"ar": "محاكاة: آيفون 16 برو ماكس (آبل)", "en": "Mock: iPhone 16 Pro Max"},
    "source_fastboot": {"ar": "محاكاة: وضع فاستبوت (شاومي)", "en": "Mock: Fastboot Mode"},
    "source_offline": {"ar": "محاكاة: غير متصل / أوفلاين", "en": "Mock: Disconnected"},
    "autoprint": {"ar": "طباعة تلقائية فور التوصيل", "en": "Auto-Print on Connect"},
    "autoprint_tip": {"ar": "طباعة الملصق تلقائياً فور توصيل أي هاتف بالكمبيوتر", "en": "Automatically prints label when a device is plugged in"},
    "poll_now": {"ar": "فحص الآن", "en": "Poll Now"},

    # Tabs
    "tab_specs": {"ar": "📱 فحص ومواصفات الجهاز", "en": "📱 Device Specs Form"},
    "tab_intake": {"ar": "🔧 استلام وصيانة (تذكرة)", "en": "🔧 Repair Intake Ticket"},

    # Device Specs Fields
    "stock_number": {"ar": "رقم المخزون / الكود:", "en": "Stock #:"},
    "brand": {"ar": "الشركة المصنعة:", "en": "Brand:"},
    "model_name": {"ar": "اسم الموديل التجاري:", "en": "Model Name:"},
    "model_code": {"ar": "كود الموديل:", "en": "Model Code:"},
    "color": {"ar": "اللون:", "en": "Color:"},
    "storage": {"ar": "سعة التخزين الفعلية:", "en": "Storage:"},
    "ram": {"ar": "الرام (الذاكرة العشوائية):", "en": "RAM:"},
    "os_version": {"ar": "إصدار النظام:", "en": "OS Version:"},
    "region": {"ar": "منطقة / دولة البيع:", "en": "Sales Region:"},
    "serial": {"ar": "الرقم التسلسلي (Serial):", "en": "Serial #:"},
    "grade": {"ar": "حالة الجهاز (Grade):", "en": "Condition Grade:"},
    "imei1": {"ar": "رقم الـ IMEI 1:", "en": "IMEI 1:"},
    "imei2": {"ar": "رقم الـ IMEI 2 (اختياري):", "en": "IMEI 2 (Optional):"},
    "battery_pct": {"ar": "صحة البطارية (%):", "en": "Battery Health %:"},
    "battery_cycles": {"ar": "دورات الشحن:", "en": "Cycle Count:"},
    "remarks": {"ar": "ملاحظات الفحص والضمان:", "en": "Remarks & Warranty:"},
    "print_specs_btn": {"ar": "🖨 طباعة ملصق المواصفات", "en": "🖨 Print Specs Label"},
    "clear_btn": {"ar": "مسح الحقول", "en": "Clear Form"},

    # Repair Ticket Fields
    "ticket_id": {"ar": "رقم التذكرة:", "en": "Ticket ID:"},
    "date_time": {"ar": "التاريخ / الوقت:", "en": "Date / Time:"},
    "customer_name": {"ar": "اسم العميل:", "en": "Customer Name:"},
    "customer_phone": {"ar": "رقم هاتف العميل:", "en": "Customer Phone:"},
    "screen_lock": {"ar": "رمز قفل الشاشة / النمط:", "en": "Screen Lock / PIN:"},
    "device_model": {"ar": "موديل الجهاز:", "en": "Device Model:"},
    "reported_fault": {"ar": "العطل المطلوب صيانته:", "en": "Reported Fault:"},
    "intake_status": {"ar": "حالة استلام الجهاز:", "en": "Intake Status:"},
    "sim_removed": {"ar": "تم إخراج الشريحة", "en": "SIM Removed"},
    "back_cracked": {"ar": "ظهر الجهاز مكسور", "en": "Back Cracked"},
    "dead_device": {"ar": "الجهاز فاصل باور", "en": "Dead Device"},
    "est_cost": {"ar": "التكلفة التقديرية ($):", "en": "Estimated Cost ($):"},
    "print_ticket_btn": {"ar": "🖨 طباعة تذكرة الصيانة", "en": "🖨 Print Repair Ticket"},

    # WYSIWYG Center Panel
    "preview_title": {"ar": "معاينة حية دقيقة 203 DPI (مطابقة للطباعة)", "en": "Live WYSIWYG 203 DPI Preview"},
    "zoom_100": {"ar": "100% (حجم طبيعي 203 DPI)", "en": "100% (203 DPI Native)"},
    "zoom_150": {"ar": "تكبير 150%", "en": "150% Zoom"},
    "zoom_200": {"ar": "تكبير 200%", "en": "200% Zoom"},
    "zoom_250": {"ar": "تكبير 250%", "en": "250% Zoom"},
    "barcode_label": {"ar": "نوع الرمز:", "en": "Barcode Type:"},
    "barcode_code128": {"ar": "باركود طولي Code128", "en": "Code128 Barcode"},
    "barcode_qr": {"ar": "رمز استجابة سريعة 2D QR", "en": "2D QR Code"},
    "barcode_both": {"ar": "مزدوج (باركود + QR)", "en": "Dual (Barcode + QR)"},
    "compact_merge": {"ar": "دمج المواصفات الذكي", "en": "Compact Smart Merge"},
    "field_titles": {"ar": "إظهار عناوين الحقول", "en": "Show Field Titles"},

    # Printer Panel Right
    "thermal_printer_grp": {"ar": "طابعة الملصقات الحرارية", "en": "Thermal Printer"},
    "refresh_printers": {"ar": "تحديث قائمة الطابعات", "en": "Refresh Printer List"},
    "paper_size_grp": {"ar": "مقاس ورق الملصقات", "en": "Label Paper Size"},
    "width_mm": {"ar": "العرض (مم):", "en": "Width (mm):"},
    "height_mm": {"ar": "الارتفاع (مم):", "en": "Height (mm):"},
    "margin_mm": {"ar": "الهامش (مم):", "en": "Margin (mm):"},
    "print_actions_grp": {"ar": "خيارات الطباعة والتصدير", "en": "Print & Export Actions"},
    "direct_print": {"ar": "🖨 طباعة صامتة مباشرة", "en": "🖨 Direct Silent Print"},
    "export_png": {"ar": "💾 حفظ كصورة PNG (203 DPI)", "en": "💾 Export Virtual PNG"},
    "export_pdf": {"ar": "📄 حفظ كملف PDF", "en": "📄 Export Virtual PDF"},
    "calibration_grid": {"ar": "📐 طباعة شبكة ضبط المحاذاة", "en": "📐 Alignment Test Grid"},

    # Bottom History Table
    "history_title": {"ar": "📋 سجل النشاط وإعادة الطباعة", "en": "📋 Activity History & Reprints"},
    "search_placeholder": {"ar": "🔍 ابحث برقم السيريال، IMEI، الموديل، اسم العميل، أو الهاتف...", "en": "🔍 Search by Serial, IMEI, Model, Phone, Customer..."},
    "records_count": {"ar": "عدد السجلات:", "en": "Records:"},
    "refresh": {"ar": "تحديث", "en": "Refresh"},
    "export_excel": {"ar": "📊 تصدير إكسيل", "en": "📊 Export Excel"},
    "export_csv": {"ar": "📄 تصدير CSV", "en": "📄 Export CSV"},
    "col_source": {"ar": "النوع", "en": "Source"},
    "col_ref": {"ar": "الكود / التذكرة", "en": "Ref ID"},
    "col_model": {"ar": "الموديل", "en": "Model"},
    "col_serial": {"ar": "السيريال / الهاتف", "en": "Serial / Phone"},
    "col_imei": {"ar": "IMEI / اسم العميل", "en": "IMEI / Customer"},
    "col_details": {"ar": "الملاحظات / العطل", "en": "Details / Fault"},
    "col_time": {"ar": "وقت الطباعة", "en": "Printed At"},
    "col_action": {"ar": "الإجراء", "en": "Action"},
    "reprint": {"ar": "إعادة طباعة", "en": "Reprint"},

    # Shop Branding & Customization Dialog
    "shop_settings_btn": {"ar": "⚙️ إعدادات المحل واللوجو", "en": "⚙️ Shop & Logo Settings"},
    "shop_dialog_title": {"ar": "إعدادات المحل واللوجو وتخصيص الخانات", "en": "Shop Branding & Field Layout Settings"},
    "shop_name": {"ar": "اسم المحل / الشركة:", "en": "Shop / Store Name:"},
    "shop_phone": {"ar": "رقم الهاتف / الواتساب:", "en": "Phone / WhatsApp:"},
    "shop_address": {"ar": "العنوان أو الشعار الترويجي:", "en": "Address or Slogan:"},
    "shop_logo": {"ar": "لوجو المحل (صورة):", "en": "Shop Logo (Image):"},
    "choose_logo": {"ar": "اختيار لوجو...", "en": "Select Logo..."},
    "remove_logo": {"ar": "حذف اللوجو", "en": "Remove Logo"},
    "show_logo_chk": {"ar": "إظهار لوجو المحل في أعلى الملصق", "en": "Print Shop Logo on Label Header"},
    "label_font": {"ar": "خط نصوص الملصق:", "en": "Label Typography Font:"},
    "label_template": {"ar": "شكل وتصميم الملصق:", "en": "Label Design Template:"},
    "template_modern": {"ar": "مختبر حديث (نمط 3uTools — باركود وQR وبيانات كاملة)", "en": "Modern Lab (3uTools Style — Barcode + QR + Badge)"},
    "template_retail": {"ar": "معرض بيع VIP (تركيز على اللوجو واسم الموديل والسعر)", "en": "Retail VIP Showcase (Prominent Logo + Model + Warranty)"},
    "template_workshop": {"ar": "ورشة صيانة تفصيلية (جدول عتاد كامل وسيريال وIMEI)", "en": "Tech Workshop (Full Hardware Diagnostic Table)"},
    "template_minimal": {"ar": "باركود أولاً (باركود كبير ومواصفات أساسية سريعة)", "en": "Minimalist Barcode First (Dominant Barcode + Quick Specs)"},
    "template_custom": {"ar": "تصميم مخصص بالكامل (المصمم الحر - تحكم يدوي بالخانات)", "en": "Custom Fully Tailored (Drag & Custom Order Designer)"},
    "save_settings": {"ar": "حفظ الإعدادات", "en": "Save Settings"},
    "lang_toggle_btn": {"ar": "🇬🇧 English", "en": "🇸🇦 العربية"},
    "drivers_btn": {"ar": "🔧 تثبيت تعريفات الهواتف", "en": "🔧 Install Phone Drivers"},

    # New Designer & Customization Keys
    "tab_designer": {"ar": "🎨 هوية المحل وتصميم الليبل", "en": "🎨 Shop & Label Designer"},
    "printer_select": {"ar": "الطابعة المحددة:", "en": "Selected Printer:"},
    "test_print_btn": {"ar": "⚡ طباعة تجريبية سريعة", "en": "⚡ Quick Test Print"},
    "fields_layout_grp": {"ar": "تخصيص وترتيب خانات الليبل", "en": "Label Fields Layout & Ordering"},
    "move_up": {"ar": "⬆ للأعلى", "en": "⬆ Move Up"},
    "move_down": {"ar": "⬇ للأسفل", "en": "⬇ Move Down"},
    "field_active": {"ar": "تفعيل", "en": "Active"},
    "field_name": {"ar": "اسم الحقل", "en": "Field Name"},
    "field_align": {"ar": "المحاذاة", "en": "Alignment"},
    "align_left": {"ar": "يسار", "en": "Left"},
    "align_center": {"ar": "وسط", "en": "Center"},
    "align_right": {"ar": "يمين", "en": "Right"},
    "custom_price": {"ar": "سعر البيع المعروض:", "en": "Display Price:"},
    "custom_warranty": {"ar": "مدة الضمان:", "en": "Warranty Period:"},
    "custom_note": {"ar": "ملاحظة خاصة على الليبل:", "en": "Custom Label Note:"},
    "qr_mode": {"ar": "محتوى الـ QR Code:", "en": "QR Code Content:"},
    "qr_mode_specs": {"ar": "تقرير مواصفات الهاتف كاملة", "en": "Full Specs Report"},
    "qr_mode_whatsapp": {"ar": "مراسلة واتساب المحل مع كود الجهاز", "en": "WhatsApp Shop Chat"},
    "qr_mode_imei": {"ar": "رقم IMEI والسيريال فقط", "en": "IMEI & Serial Only"},
    "audio_chime": {"ar": "تنبيه صوتي عند سحب البيانات", "en": "Audio Chime on Connect"},
}


class I18nManager:
    """Manages active UI and label language."""

    _instance = None

    def __init__(self, default_lang: str = "ar"):
        self.current_lang = default_lang

    @classmethod
    def get_instance(cls, default_lang: str = "ar") -> "I18nManager":
        if cls._instance is None:
            cls._instance = I18nManager(default_lang)
        return cls._instance

    def set_language(self, lang: str):
        if lang in ["ar", "en"]:
            self.current_lang = lang

    def t(self, key: str, fallback: str = "") -> str:
        entry = TRANSLATIONS.get(key)
        if entry:
            return entry.get(self.current_lang, entry.get("en", fallback or key))
        return fallback or key


_global_i18n = I18nManager.get_instance()


def tr(key: str, fallback: str = "") -> str:
    """Convenience translation function."""
    return _global_i18n.t(key, fallback)
