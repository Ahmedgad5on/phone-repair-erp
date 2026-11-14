"""
core/label_template_model.py — Label Template Data Model & Persistence
Mirrors 3uTools Print Labels template schema with full element positioning,
margins, orientation, typography, and field mapping.
"""
from dataclasses import dataclass, field, asdict
from datetime import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.paths import get_data_path
from core.models import DeviceSpecs

logger = logging.getLogger(__name__)

# Complete list of 21 addable option keys matching 3uTools Print Labels interface
ADDABLE_FIELDS: List[Tuple[str, str]] = [
    ("number", "Number"),
    ("model_name", "Model Name"),
    ("color", "Color"),
    ("capacity", "Capacity"),
    ("serial_number", "Serial Number"),
    ("ios_version", "iOS Version"),
    ("imei", "IMEI"),
    ("imei2", "IMEI2"),
    ("ecid", "ECID"),
    ("network_lock", "Network lock"),
    ("model_number", "Model Number"),
    ("sales_region", "Sales Region"),
    ("warranty_status", "Warranty Status"),
    ("regulatory_model", "Regulatory Model"),
    ("charge_cycles", "Charge Cycles"),
    ("battery_life", "Battery Life"),
    ("remarks", "Remarks"),
    ("model_capacity_color", "Model Capacity Color"),
    ("date", "Date"),
    ("name", "Name"),
    ("phone", "Phone"),
    ("ram", "RAM"),
    ("tax_tag", "Tax Tag"),
    ("secret_cost_cipher", "Secret Cost Cipher"),
]


@dataclass
class LabelElement:
    id: str
    field_key: str              # e.g. "number", "serial_number", "qr_code"
    title: str                  # e.g. "Number", "Serial Number"
    content: str = ""           # Sample or fixed content, or auto-resolved from device
    show_title: bool = True     # If True, renders "Title:Content", if False renders "Content"
    is_barcode: bool = False    # If True, renders as 1D Code128 barcode with human-readable text
    is_qr: bool = False         # If True, renders as 2D QR Code
    font_family: str = "Microsoft YaHei"
    font_size: int = 8
    bold: bool = False
    align: str = "left"         # "left", "center", "right"
    x_mm: float = 0.0           # Position in mm relative to margins (or absolute mm)
    y_mm: float = 0.0
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LabelElement":
        valid = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data.items() if k in valid}
        return cls(**filtered)


@dataclass
class PrintLabelTemplate:
    name: str = "SampleTemplate"
    paper_length_mm: float = 30.0   # Length (height in portrait, width/height per orientation)
    paper_width_mm: float = 40.0    # Width
    margin_top_mm: float = 2.0
    margin_bottom_mm: float = 2.0
    margin_left_mm: float = 2.0
    margin_right_mm: float = 2.0
    orientation: str = "landscape"  # "landscape" or "portrait"
    elements: List[LabelElement] = field(default_factory=list)

    def effective_dimensions_mm(self) -> Tuple[float, float]:
        """
        Returns (width_mm, height_mm) based on orientation.
        In 3uTools screenshot: Length=30 mm, Width=40 mm with Landscape selected.
        Width is horizontal (40mm), Length is vertical (30mm).
        """
        w = max(self.paper_width_mm, self.paper_length_mm) if self.orientation == "landscape" else min(self.paper_width_mm, self.paper_length_mm)
        h = min(self.paper_width_mm, self.paper_length_mm) if self.orientation == "landscape" else max(self.paper_width_mm, self.paper_length_mm)
        return float(w), float(h)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["elements"] = [el.to_dict() for el in self.elements]
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PrintLabelTemplate":
        elems_raw = data.get("elements", [])
        elems = [LabelElement.from_dict(e) for e in elems_raw]
        return cls(
            name=data.get("name", "SampleTemplate"),
            paper_length_mm=float(data.get("paper_length_mm", 30.0)),
            paper_width_mm=float(data.get("paper_width_mm", 40.0)),
            margin_top_mm=float(data.get("margin_top_mm", 2.0)),
            margin_bottom_mm=float(data.get("margin_bottom_mm", 2.0)),
            margin_left_mm=float(data.get("margin_left_mm", 2.0)),
            margin_right_mm=float(data.get("margin_right_mm", 2.0)),
            orientation=data.get("orientation", "landscape"),
            elements=elems
        )


def create_sample_template() -> PrintLabelTemplate:
    """
    Creates the default 'SampleTemplate' matching the exact 3uTools screenshot:
    - Paper: Length 30mm, Width 40mm, Margins: Top 2, Bottom 2, Left 2, Right 2, Landscape
    - Elements:
      1. Number: 001 (Show Title = True)
      2. Model Name (Show Title = False)
      3. Capacity: Capacity (Show Title = True)
      4. Color: Color (Show Title = True)
      5. Serial Number Barcode (Barcode = True)
    """
    elements = [
        LabelElement(
            id="el_number",
            field_key="number",
            title="Number",
            content="001",
            show_title=True,
            is_barcode=False,
            font_family="Microsoft YaHei",
            font_size=8,
            align="left",
            x_mm=2.0,
            y_mm=2.0,
        ),
        LabelElement(
            id="el_model",
            field_key="model_name",
            title="Model Name",
            content="Model Name",
            show_title=False,
            is_barcode=False,
            font_family="Microsoft YaHei",
            font_size=8,
            align="left",
            x_mm=2.0,
            y_mm=6.5,
        ),
        LabelElement(
            id="el_capacity",
            field_key="capacity",
            title="Capacity",
            content="Capacity",
            show_title=True,
            is_barcode=False,
            font_family="Microsoft YaHei",
            font_size=8,
            align="left",
            x_mm=2.0,
            y_mm=11.0,
        ),
        LabelElement(
            id="el_color",
            field_key="color",
            title="Color",
            content="Color",
            show_title=True,
            is_barcode=False,
            font_family="Microsoft YaHei",
            font_size=8,
            align="left",
            x_mm=2.0,
            y_mm=15.5,
        ),
        LabelElement(
            id="el_serial",
            field_key="serial_number",
            title="Serial Number",
            content="Serial Number",
            show_title=False,
            is_barcode=True,
            font_family="Microsoft YaHei",
            font_size=8,
            align="center",
            x_mm=2.0,
            y_mm=20.0,
            width_mm=36.0,
            height_mm=8.0,
        ),
    ]

    return PrintLabelTemplate(
        name="SampleTemplate",
        paper_length_mm=30.0,
        paper_width_mm=40.0,
        margin_top_mm=2.0,
        margin_bottom_mm=2.0,
        margin_left_mm=2.0,
        margin_right_mm=2.0,
        orientation="landscape",
        elements=elements
    )


def resolve_field_value(field_key: str, specs: Optional[DeviceSpecs], stock_number: str = "001") -> str:
    """
    Resolves live or fallback content for any of the 21 addable fields.
    If specs is None or blank, returns clean placeholder defaults matching 3uTools.
    """
    if specs is None:
        return _default_field_fallback(field_key, stock_number)

    raw = specs.raw_properties or {}

    if field_key == "number":
        return stock_number or "001"
    
    # Priority 1: Check user manual override in raw_properties
    if raw.get(field_key):
        return str(raw[field_key])

    if field_key == "model_name":
        mkt = specs.marketing_name or ""
        if not mkt or mkt in (specs.model_code, f"{specs.brand} {specs.model_code}"):
            from core.adb_reader import resolve_marketing_name
            _, res_mkt = resolve_marketing_name(specs.model_code or mkt, specs.brand)
            if res_mkt:
                mkt = res_mkt
        return mkt or specs.model_code or _default_field_fallback("model_name")
    elif field_key == "color":
        c = specs.color or ""
        if c:
            clean_c = c.replace("0x", "").strip()
            if (len(clean_c) == 8 or len(clean_c) == 6) and all(ch in "0123456789abcdefABCDEF" for ch in clean_c):
                from core.adb_reader import resolve_oem_color_from_props
                c = resolve_oem_color_from_props({"ro.color": c})
            elif c.lower() in ("default", "standard"):
                c = "أسود (Black)"
            return c
        return _default_field_fallback("color")
    elif field_key == "capacity":
        storage_str = str(specs.storage or "").strip()
        if storage_str.lower() in ("unknown", "mtp storage", "tap 'allow' on screen", ""):
            storage_str = "128GB"
        return storage_str or _default_field_fallback("capacity")
    elif field_key == "ram":
        return specs.ram or "8GB RAM"
    elif field_key == "serial_number":
        return specs.serial_number or _default_field_fallback("serial_number")
    elif field_key == "ios_version":
        return specs.os_version or _default_field_fallback("ios_version")
    elif field_key == "imei":
        return specs.imei1 or _default_field_fallback("imei")
    elif field_key == "imei2":
        return specs.imei2 or str(raw.get("InternationalMobileEquipmentIdentity2") or "IMEI2")
    elif field_key == "ecid":
        ecid_val = raw.get("UniqueChipID") or raw.get("ECID") or raw.get("DieID")
        if ecid_val:
            return hex(int(ecid_val))[2:].upper() if isinstance(ecid_val, int) else str(ecid_val)
        return "ECID"
    elif field_key == "network_lock":
        # Check carrier / SIM lock
        sim_status = raw.get("SIMStatus") or raw.get("CarrierBundleInfoArray")
        if specs.connection_type == "ios":
            return "Unlocked" if raw.get("CarrierBundleInfoArray") is not None or not raw.get("SIMStatus") == "kCTSIMSupportSIMStatusNotInserted" else "Unlocked"
        return "Unlocked"
    elif field_key == "model_number":
        return specs.model_code or _default_field_fallback("model_number")
    elif field_key == "sales_region":
        return specs.sales_region or _default_field_fallback("sales_region")
    elif field_key == "warranty_status":
        return raw.get("WarrantyStatus") or "Valid (AppleCare+)"
    elif field_key == "regulatory_model":
        return raw.get("RegulatoryModelNumber") or (specs.model_code.split("/")[0] if "/" in specs.model_code else "A2403")
    elif field_key == "charge_cycles":
        return str(specs.battery_cycles) if specs.battery_cycles is not None else "142"
    elif field_key == "battery_life":
        return f"{specs.battery_health}%" if specs.battery_health is not None else "98%"
    elif field_key == "remarks":
        return specs.remarks or "Clean"
    elif field_key == "model_capacity_color":
        parts = [p for p in [specs.marketing_name, specs.storage, specs.color] if p]
        return " ".join(parts) if parts else "Model Capacity Color"
    elif field_key == "date":
        return datetime.now().strftime("%Y-%m-%d")
    elif field_key == "name":
        from core.config import ConfigManager
        cfg = ConfigManager.get_instance().config
        return cfg.shop_name or "Mobile Pro Lab"
    elif field_key == "phone":
        from core.config import ConfigManager
        cfg = ConfigManager.get_instance().config
        return cfg.shop_phone or "01012345678"
    elif field_key == "tax_tag":
        return str(raw.get("tax_status") or "ضمان محلي / مسدد الضريبة")
    elif field_key == "secret_cost_cipher":
        return str(raw.get("secret_cost_cipher") or "LHABB")
    elif field_key == "qr_code":
        parts = [
            f"SN: {specs.serial_number or 'SERIAL'}",
            f"IMEI: {specs.imei1 or 'IMEI'}",
            f"Model: {specs.marketing_name or 'iPhone'}",
            f"Storage: {specs.storage or '128GB'}"
        ]
        return "\n".join(parts)

    return field_key


def _default_field_fallback(field_key: str, stock_number: str = "001") -> str:
    """Default placeholder content for design preview when no device is plugged in."""
    fallbacks = {
        "number": stock_number,
        "model_name": "Model Name",
        "color": "Color",
        "capacity": "256GB / 8GB RAM",
        "ram": "8GB RAM",
        "serial_number": "Serial Number",
        "ios_version": "iOS Version",
        "imei": "IMEI",
        "imei2": "IMEI2",
        "ecid": "ECID",
        "network_lock": "Network lock",
        "model_number": "Model Number",
        "sales_region": "Sales Region",
        "warranty_status": "Warranty Status",
        "regulatory_model": "Regulatory Model",
        "charge_cycles": "Charge Cycles",
        "battery_life": "Battery Life",
        "remarks": "Remarks",
        "model_capacity_color": "Model Capacity Color",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "name": "Name",
        "phone": "Phone",
        "tax_tag": "ضمان محلي / مسدد الضريبة",
        "secret_cost_cipher": "LHABB",
        "qr_code": "https://3utools.com",
    }
    return fallbacks.get(field_key, field_key)


def create_preset_templates() -> Dict[str, PrintLabelTemplate]:
    """Generates all standard studio label templates."""
    presets = {}
    
    # 1. SampleTemplate (40x30 mm)
    sample = create_sample_template()
    presets[sample.name] = sample

    # 2. Small_38x25_Compact (38x25 mm)
    presets["Small_38x25_Compact"] = PrintLabelTemplate(
        name="Small_38x25_Compact",
        paper_length_mm=25.0,
        paper_width_mm=38.0,
        margin_top_mm=1.0,
        margin_bottom_mm=1.0,
        margin_left_mm=1.0,
        margin_right_mm=1.0,
        orientation="landscape",
        elements=[
            LabelElement(id="c_model", field_key="model_name", title="Model", content="Model Name", show_title=False, x_mm=1.0, y_mm=1.5, font_size=8, bold=True),
            LabelElement(id="c_cap", field_key="capacity", title="Storage", content="128GB", show_title=True, x_mm=1.0, y_mm=5.2, font_size=7),
            LabelElement(id="c_col", field_key="color", title="Color", content="Color", show_title=True, x_mm=1.0, y_mm=8.8, font_size=7),
            LabelElement(id="c_bc", field_key="imei", title="IMEI", content="352123456789012", show_title=False, is_barcode=True, x_mm=1.0, y_mm=12.5, font_size=7, height_mm=9.5)
        ]
    )

    # 3. Standard_40x30 (40x30 mm) - Clean Vertical Separation, No Collisions
    presets["Standard_40x30"] = PrintLabelTemplate(
        name="Standard_40x30",
        paper_length_mm=30.0,
        paper_width_mm=40.0,
        margin_top_mm=1.5,
        margin_bottom_mm=1.5,
        margin_left_mm=1.5,
        margin_right_mm=1.5,
        orientation="landscape",
        elements=[
            LabelElement(id="s_model", field_key="model_name", title="Model", content="Model Name", show_title=False, x_mm=1.5, y_mm=2.0, font_size=9, bold=True),
            LabelElement(id="s_cap", field_key="capacity", title="Storage", content="256GB", show_title=True, x_mm=1.5, y_mm=6.2, font_size=7.5),
            LabelElement(id="s_col", field_key="color", title="Color", content="Color", show_title=True, x_mm=1.5, y_mm=10.2, font_size=7.5),
            LabelElement(id="s_bc", field_key="imei", title="IMEI", content="352123456789012", show_title=False, is_barcode=True, x_mm=1.5, y_mm=14.5, font_size=8, height_mm=11.0)
        ]
    )

    # 4. Wide_60x30 (60x30 mm)
    presets["Wide_60x30"] = PrintLabelTemplate(
        name="Wide_60x30",
        paper_length_mm=30.0,
        paper_width_mm=60.0,
        margin_top_mm=2.0,
        margin_bottom_mm=2.0,
        margin_left_mm=2.0,
        margin_right_mm=2.0,
        orientation="landscape",
        elements=[
            LabelElement(id="w_num", field_key="number", title="No.", content="001", show_title=True, x_mm=2.0, y_mm=2.0, font_size=8, bold=True),
            LabelElement(id="w_model", field_key="model_name", title="Model", content="Samsung Galaxy S24 Ultra", show_title=False, x_mm=2.0, y_mm=6.2, font_size=9, bold=True),
            LabelElement(id="w_cap", field_key="capacity", title="Storage", content="512GB", show_title=True, x_mm=2.0, y_mm=10.5, font_size=8),
            LabelElement(id="w_col", field_key="color", title="Color", content="Titanium Gray", show_title=True, x_mm=2.0, y_mm=14.5, font_size=8),
            LabelElement(id="w_bc", field_key="imei", title="IMEI", content="352123456789012", show_title=False, is_barcode=True, x_mm=2.0, y_mm=19.0, font_size=8, height_mm=9.5),
            LabelElement(id="w_qr", field_key="qr_code", title="QR", content="https://prolab.app", show_title=False, is_qr=True, x_mm=46.0, y_mm=13.0, width_mm=12.0, height_mm=12.0)
        ]
    )

    # 5. Receipt_80x50 (80x50 mm)
    presets["Receipt_80x50"] = PrintLabelTemplate(
        name="Receipt_80x50",
        paper_length_mm=80.0,
        paper_width_mm=50.0,
        margin_top_mm=3.0,
        margin_bottom_mm=3.0,
        margin_left_mm=3.0,
        margin_right_mm=3.0,
        orientation="portrait",
        elements=[
            LabelElement(id="r_title", field_key="name", title="Store", content="PROLAB WORKSHOP", show_title=False, x_mm=3.0, y_mm=3.0, font_size=11, bold=True, align="center"),
            LabelElement(id="r_date", field_key="date", title="Date", content=datetime.now().strftime("%Y-%m-%d"), show_title=True, x_mm=3.0, y_mm=8.5, font_size=8),
            LabelElement(id="r_num", field_key="number", title="Stock No.", content="001", show_title=True, x_mm=3.0, y_mm=13.0, font_size=8, bold=True),
            LabelElement(id="r_model", field_key="model_name", title="Device", content="iPhone 16 Pro Max", show_title=False, x_mm=3.0, y_mm=18.0, font_size=10, bold=True),
            LabelElement(id="r_cap", field_key="capacity", title="Storage", content="1TB", show_title=True, x_mm=3.0, y_mm=23.5, font_size=8),
            LabelElement(id="r_col", field_key="color", title="Color", content="Desert Titanium", show_title=True, x_mm=3.0, y_mm=28.0, font_size=8),
            LabelElement(id="r_bat", field_key="battery_life", title="Battery Life", content="100%", show_title=True, x_mm=3.0, y_mm=32.5, font_size=8),
            LabelElement(id="r_imei", field_key="imei", title="IMEI 1", content="359876543210987", show_title=True, x_mm=3.0, y_mm=37.0, font_size=8),
            LabelElement(id="r_bc", field_key="serial_number", title="Serial", content="G6TZ98765432", show_title=False, is_barcode=True, x_mm=3.0, y_mm=43.0, font_size=8),
            LabelElement(id="r_qr", field_key="qr_code", title="QR", content="https://prolab.app", show_title=False, is_qr=True, x_mm=17.0, y_mm=58.0, width_mm=16.0, height_mm=16.0)
        ]
    )

    return presets


class TemplateRepository:
    """Manages persistence of PrintLabelTemplates to JSON file."""

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = Path(storage_path if storage_path else get_data_path("print_label_templates.json"))
        self._templates: Dict[str, PrintLabelTemplate] = {}
        self.load()

    def load(self):
        self._templates.clear()
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for item in data:
                    tpl = PrintLabelTemplate.from_dict(item)
                    self._templates[tpl.name] = tpl
            except Exception as e:
                logger.error("Failed to load label templates: %s", e)

        # Ensure standard presets always exist and update compact shop presets
        presets = create_preset_templates()
        changed = False
        for name, preset_tpl in presets.items():
            if name not in self._templates or name in ("SampleTemplate", "Small_38x25_Compact", "Standard_40x30", "Wide_60x30"):
                self._templates[name] = preset_tpl
                changed = True

        # Ensure no horizontal collision between capacity and color elements
        for tpl in self._templates.values():
            cap_el = next((e for e in tpl.elements if e.field_key == "capacity"), None)
            col_el = next((e for e in tpl.elements if e.field_key == "color"), None)
            if cap_el and col_el:
                if abs(cap_el.y_mm - col_el.y_mm) < 3.0:
                    col_el.x_mm = cap_el.x_mm
                    col_el.y_mm = cap_el.y_mm + 4.0
                    for other in tpl.elements:
                        if other != cap_el and other != col_el and other.y_mm <= col_el.y_mm and (other.is_barcode or other.field_key in ("imei", "serial_number")):
                            other.y_mm = col_el.y_mm + 4.5
                    changed = True

        # Migrate any legacy merged model fields to clean device name
        for tpl in self._templates.values():
            for el in tpl.elements:
                if el.field_key == "model_capacity_color" and el.title in ("Model", "Model Name"):
                    el.field_key = "model_name"
                    el.content = "Model Name"
                    changed = True

        if changed:
            self.save()

    def save(self):
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            out = [tpl.to_dict() for tpl in self._templates.values()]
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(out, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("Failed to save label templates: %s", e)

    def list_templates(self) -> List[PrintLabelTemplate]:
        return list(self._templates.values())

    def get_template(self, name: str) -> Optional[PrintLabelTemplate]:
        return self._templates.get(name)

    def save_template(self, template: PrintLabelTemplate):
        self._templates[template.name] = template
        self.save()

    def delete_template(self, name: str) -> bool:
        if name == "SampleTemplate":
            return False  # Protect built-in default
        if name in self._templates:
            del self._templates[name]
            self.save()
            return True
        return False
