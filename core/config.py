"""
core/config.py — Application Configuration & Shop Customization Manager
Manages shop branding (Name, Phone, Address, Logo), label typography, design templates,
customizable field layouts, element positioning, and bilingual user preferences.
"""
from dataclasses import dataclass, asdict, field
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.paths import get_app_data_dir

logger = logging.getLogger(__name__)

DEFAULT_LABEL_FIELDS = [
    {"id": "shop_header", "name": "ترويسة المحل واللوجو (Shop Header & Logo)", "enabled": True, "order": 1, "align": "center"},
    {"id": "stock_badge", "name": "كود المخزون والتصنيف (#STK & Grade)", "enabled": True, "order": 2, "align": "space_between"},
    {"id": "model_name", "name": "اسم وموديل الهاتف (Device Model)", "enabled": True, "order": 3, "align": "left"},
    {"id": "specs_summary", "name": "المواصفات (الذاكرة • اللون • الرام)", "enabled": True, "order": 4, "align": "left"},
    {"id": "battery_diag", "name": "صحة البطارية ودورات الشحن (Battery Health)", "enabled": True, "order": 5, "align": "left"},
    {"id": "imei_serial", "name": "أرقام IMEI والسيريال (IMEI & Serial)", "enabled": True, "order": 6, "align": "left"},
    {"id": "price_warranty", "name": "السعر وفترة الضمان (Price & Warranty)", "enabled": True, "order": 7, "align": "left"},
    {"id": "barcode_qr", "name": "الباركود أو الـ QR Code", "enabled": True, "order": 8, "align": "center"},
    {"id": "footer_contact", "name": "تذييل الليبل (هاتف المحل والملاحظات)", "enabled": True, "order": 9, "align": "center"},
]


@dataclass
class AppConfig:
    # Shop Branding
    shop_name: str = "محل المتميز لخدمات المحمول"
    shop_phone: str = "01012345678"
    shop_address: str = "مصر - القاهرة"
    shop_slogan: str = "بيع • شراء • صيانة فورية"
    logo_path: str = ""
    show_logo: bool = True
    logo_height_mm: int = 5

    # Label Typography & Design Template
    selected_font: str = "segoe"  # "segoe", "tahoma", "arial", "calibri", "arabic_type", "consolas"
    label_template: str = "modern_lab"  # "modern_lab", "retail_vip", "workshop_tech", "minimalist_tag", "custom_designer"
    label_language: str = "bilingual"  # "bilingual", "ar", "en"
    font_size_scale: float = 1.0  # Multiplier: 0.9, 1.0, 1.1

    # Customizable Label Fields & Positioning
    label_fields: List[Dict[str, Any]] = field(default_factory=lambda: [dict(f) for f in DEFAULT_LABEL_FIELDS])
    custom_label_price: str = ""
    custom_label_warranty: str = ""
    custom_label_note: str = ""
    qr_mode: str = "specs"  # "specs", "whatsapp", "imei", "custom"
    qr_custom_url: str = ""

    # Application Behavior & Hardware
    ui_language: str = "ar"  # "ar" or "en"
    auto_pull_interval_sec: float = 1.0  # Fast polling for instant auto-pull
    auto_print_on_connect: bool = False
    play_sound_on_connect: bool = True
    default_printer: str = ""
    default_paper_width_mm: int = 38
    default_paper_height_mm: int = 25
    default_margin_mm: float = 1.0
    compact_smart_merge: bool = True
    show_field_titles: bool = True
    default_barcode_type: str = "code128"  # "code128", "qr", "both"

    extra: Dict[str, Any] = field(default_factory=dict)


class ConfigManager:
    """Singleton configuration manager with atomic JSON persistence."""

    _instance: Optional["ConfigManager"] = None

    def __init__(self, config_path: Optional[str] = None):
        if config_path:
            self.config_file = Path(config_path)
        else:
            self.config_file = get_app_data_dir() / "settings.json"

        self.config: AppConfig = AppConfig()
        self.load()

    @classmethod
    def get_instance(cls) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = ConfigManager()
        return cls._instance

    def load(self) -> AppConfig:
        """Loads configuration from settings.json or initializes defaults."""
        if self.config_file.exists():
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    valid_keys = AppConfig.__annotations__.keys()
                    filtered = {k: v for k, v in data.items() if k in valid_keys}
                    if "label_fields" not in filtered or not filtered["label_fields"]:
                        filtered["label_fields"] = [dict(f) for f in DEFAULT_LABEL_FIELDS]
                    self.config = AppConfig(**filtered)
            except Exception as e:
                logger.warning("Could not read settings.json, using defaults: %s", e)
                self.config = AppConfig()
        else:
            self.save()
        return self.config

    def save(self) -> bool:
        """Persists current configuration to disk atomically."""
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            temp_file = self.config_file.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(asdict(self.config), f, ensure_ascii=False, indent=2)
            os.replace(temp_file, self.config_file)
            return True
        except Exception as e:
            logger.error("Failed to save settings.json: %s", e)
            return False

    def update(self, **kwargs) -> bool:
        """Updates specific configuration keys and saves atomically."""
        for k, v in kwargs.items():
            if hasattr(self.config, k):
                setattr(self.config, k, v)
            else:
                self.config.extra[k] = v
        return self.save()
