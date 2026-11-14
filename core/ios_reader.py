"""
iOS Hardware Extraction Engine (libimobiledevice).
Provides background polling, XML plist deserialization via plistlib, decimal disk capacity parsing,
Apple ProductType model resolution, multi-tier battery diagnostics, and lockdown error handling.
"""
from dataclasses import replace
import json
import logging
import os
import plistlib
import re
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from core.models import DeviceSpecs
from core.paths import get_binary_path, get_data_path

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

# Built-in Apple ProductType dictionary covering up to iPhone 16 series
BUILTIN_APPLE_MODELS: Dict[str, str] = {
    "iPhone17,1": "iPhone 16 Pro",
    "iPhone17,2": "iPhone 16 Pro Max",
    "iPhone17,3": "iPhone 16",
    "iPhone17,4": "iPhone 16 Plus",
    "iPhone16,1": "iPhone 15 Pro",
    "iPhone16,2": "iPhone 15 Pro Max",
    "iPhone15,4": "iPhone 15",
    "iPhone15,5": "iPhone 15 Plus",
    "iPhone15,2": "iPhone 14 Pro",
    "iPhone15,3": "iPhone 14 Pro Max",
    "iPhone14,7": "iPhone 14",
    "iPhone14,8": "iPhone 14 Plus",
    "iPhone14,2": "iPhone 13 Pro",
    "iPhone14,3": "iPhone 13 Pro Max",
    "iPhone14,4": "iPhone 13 mini",
    "iPhone14,5": "iPhone 13",
    "iPhone14,6": "iPhone SE (3rd Gen)",
    "iPhone13,1": "iPhone 12 mini",
    "iPhone13,2": "iPhone 12",
    "iPhone13,3": "iPhone 12 Pro",
    "iPhone13,4": "iPhone 12 Pro Max",
    "iPhone12,8": "iPhone SE (2nd Gen)",
    "iPhone12,1": "iPhone 11",
    "iPhone12,3": "iPhone 11 Pro",
    "iPhone12,5": "iPhone 11 Pro Max",
    "iPhone11,2": "iPhone XS",
    "iPhone11,4": "iPhone XS Max",
    "iPhone11,6": "iPhone XS Max",
    "iPhone11,8": "iPhone XR",
    "iPhone10,1": "iPhone 8",
    "iPhone10,4": "iPhone 8",
    "iPhone10,2": "iPhone 8 Plus",
    "iPhone10,5": "iPhone 8 Plus",
    "iPhone10,3": "iPhone X",
    "iPhone10,6": "iPhone X",
    "iPhone9,1": "iPhone 7",
    "iPhone9,3": "iPhone 7",
    "iPhone9,2": "iPhone 7 Plus",
    "iPhone9,4": "iPhone 7 Plus",
    "iPhone8,4": "iPhone SE (1st Gen)",
    "iPhone8,1": "iPhone 6s",
    "iPhone8,2": "iPhone 6s Plus",
    "iPhone7,2": "iPhone 6",
    "iPhone7,1": "iPhone 6 Plus",
    "iPhone6,1": "iPhone 5s",
    "iPhone6,2": "iPhone 5s",
    "iPhone5,3": "iPhone 5c",
    "iPhone5,4": "iPhone 5c",
    "iPhone5,1": "iPhone 5",
    "iPhone5,2": "iPhone 5",
}

BUILTIN_RAM_SPECS: Dict[str, str] = {
    "iPhone 16 Pro": "8GB",
    "iPhone 16 Pro Max": "8GB",
    "iPhone 16": "8GB",
    "iPhone 16 Plus": "8GB",
    "iPhone 15 Pro": "8GB",
    "iPhone 15 Pro Max": "8GB",
    "iPhone 15": "6GB",
    "iPhone 15 Plus": "6GB",
    "iPhone 14 Pro": "6GB",
    "iPhone 14 Pro Max": "6GB",
    "iPhone 14": "6GB",
    "iPhone 14 Plus": "6GB",
    "iPhone 13 Pro": "6GB",
    "iPhone 13 Pro Max": "6GB",
    "iPhone 13 mini": "4GB",
    "iPhone 13": "4GB",
    "iPhone SE (3rd Gen)": "4GB",
    "iPhone 12 mini": "4GB",
    "iPhone 12": "4GB",
    "iPhone 12 Pro": "6GB",
    "iPhone 12 Pro Max": "6GB",
    "iPhone 11": "4GB",
    "iPhone 11 Pro": "4GB",
    "iPhone 11 Pro Max": "4GB",
    "iPhone SE (2nd Gen)": "3GB",
    "iPhone XS": "4GB",
    "iPhone XS Max": "4GB",
    "iPhone XR": "3GB",
    "iPhone X": "3GB",
    "iPhone 8 Plus": "3GB",
    "iPhone 8": "2GB",
    "iPhone 7 Plus": "3GB",
    "iPhone 7": "2GB",
    "iPhone SE (1st Gen)": "2GB",
    "iPhone 6s": "2GB",
    "iPhone 6s Plus": "2GB",
    "iPhone 6": "1GB",
    "iPhone 6 Plus": "1GB",
}

BUILTIN_APPLE_COLORS: Dict[str, str] = {
    # Natural Titanium
    "#505e6b": "Natural Titanium",
    "#535150": "Natural Titanium",
    "#5f5e5c": "Natural Titanium",
    "#8a857e": "Natural Titanium",
    "#938f88": "Natural Titanium",
    "#837f79": "Natural Titanium",
    "#918c85": "Natural Titanium",
    # Desert Titanium
    "#bca593": "Desert Titanium",
    "#c5b09d": "Desert Titanium",
    "#d1bfae": "Desert Titanium",
    "#c4b19e": "Desert Titanium",
    "#d5c4b4": "Desert Titanium",
    # Black Titanium / Space Black / Black / Jet Black
    "#35373a": "Black Titanium",
    "#3c3b37": "Black Titanium",
    "#2b2b2c": "Black Titanium",
    "#343335": "Black Titanium",
    "#2d2d2f": "Black Titanium",
    "#1f2020": "Space Black",
    "#2b2c2e": "Black",
    "#343538": "Black",
    "#000000": "Black",
    "#0a0a0a": "Jet Black",
    # White Titanium / Starlight / White
    "#dededc": "White Titanium",
    "#e4e4e2": "White Titanium",
    "#f2f1ed": "White Titanium",
    "#faf7f2": "Starlight",
    "#f0ede6": "Starlight",
    "#f5f5f7": "White",
    "#f5f5f0": "White",
    "#ffffff": "White",
    # Blue Titanium / Pacific Blue / Sierra Blue / Blue / Ultramarine
    "#3f4650": "Blue Titanium",
    "#39424e": "Blue Titanium",
    "#3c444f": "Blue Titanium",
    "#275878": "Pacific Blue",
    "#2d5e7d": "Pacific Blue",
    "#214358": "Blue",
    "#2a526d": "Blue",
    "#004879": "Blue",
    "#0f4c81": "Blue",
    "#a0b3c6": "Blue",
    "#93a7bc": "Blue",
    "#9db2c7": "Blue",
    "#d4e0e4": "Blue",
    "#cfdde2": "Blue",
    "#cad9de": "Blue",
    "#c5d5dc": "Blue",
    "#a7c1d9": "Sierra Blue",
    "#9bb8d3": "Sierra Blue",
    "#4a80b7": "Blue",
    "#6a7fa2": "Ultramarine",
    "#597099": "Ultramarine",
    "#5b729e": "Ultramarine",
    # Teal
    "#a1cad0": "Teal",
    "#8dbdc4": "Teal",
    "#9dc5cc": "Teal",
    # Midnight
    "#232a31": "Midnight",
    "#1c232e": "Midnight",
    "#282f37": "Midnight",
    # Space Gray / Graphite
    "#3b3b3c": "Space Gray",
    "#3b444b": "Space Gray",
    "#4b4845": "Space Gray",
    "#4c4b49": "Graphite",
    "#434240": "Graphite",
    "#54524f": "Graphite",
    # Silver
    "#e1e4e3": "Silver",
    "#e3e4e5": "Silver",
    # Gold / Rose Gold
    "#d4c9b1": "Gold",
    "#f9e5c9": "Gold",
    "#fad7bd": "Gold",
    "#f4e8ce": "Gold",
    "#f3e4ce": "Gold",
    "#f4d8b8": "Gold",
    "#e8c7c8": "Rose Gold",
    "#b9928f": "Rose Gold",
    # Pink
    "#fae0dc": "Pink",
    "#f8d7d2": "Pink",
    "#f5cec7": "Pink",
    "#edd8d8": "Pink",
    "#ebd4d5": "Pink",
    "#e8d0d1": "Pink",
    "#f4d4d6": "Pink",
    "#f5c4c9": "Pink",
    "#eed2d5": "Pink",
    # Green / Alpine Green / Midnight Green
    "#445847": "Alpine Green",
    "#506554": "Alpine Green",
    "#576b5b": "Alpine Green",
    "#576856": "Midnight Green",
    "#4e5d4d": "Midnight Green",
    "#394c38": "Green",
    "#314230": "Green",
    "#3c4f3b": "Green",
    "#dbe8db": "Green",
    "#d1e2d1": "Green",
    "#c7dcc7": "Green",
    "#d6e2d5": "Green",
    "#d1ded0": "Green",
    "#cddcd0": "Green",
    "#cde1d1": "Green",
    "#c1dac6": "Green",
    # Purple / Deep Purple
    "#867a9a": "Deep Purple",
    "#594f63": "Deep Purple",
    "#4c4255": "Deep Purple",
    "#5e5369": "Deep Purple",
    "#e3dbe7": "Purple",
    "#ded3e4": "Purple",
    "#dacde0": "Purple",
    "#b9b2d4": "Purple",
    "#afa7cc": "Purple",
    "#d1cdda": "Purple",
    "#c8c3d2": "Purple",
    # Yellow / Coral
    "#f4e8ce": "Yellow",
    "#f1e4c7": "Yellow",
    "#ede0c2": "Yellow",
    "#fde883": "Yellow",
    "#fae372": "Yellow",
    "#fde679": "Yellow",
    "#ffe680": "Yellow",
    "#fde068": "Yellow",
    "#fec63d": "Yellow",
    "#ff6e5a": "Coral",
    "#ff725c": "Coral",
    # (PRODUCT)RED
    "#bf0012": "(PRODUCT)RED",
    "#e11c2a": "(PRODUCT)RED",
    "#ff2d55": "(PRODUCT)RED",
    "#c8102e": "(PRODUCT)RED",
    "#d8252e": "(PRODUCT)RED",
    "#ba0c2f": "(PRODUCT)RED",
}

APPLE_NUMERIC_COLORS: Dict[str, str] = {
    "1": "Black",
    "2": "White",
    "3": "Yellow",
    "4": "Green",
    "5": "Purple",
    "6": "(PRODUCT)RED",
    "7": "Blue",
    "8": "Coral",
    "9": "Midnight",
    "10": "Starlight",
}

BUILTIN_APPLE_REGIONS: Dict[str, str] = {
    "LL/A": "LL/A (USA eSIM)",
    "LL": "LL/A (USA eSIM)",
    "CH/A": "CH/A (China Dual SIM)",
    "CH": "CH/A (China Dual SIM)",
    "ZP/A": "ZP/A (Hong Kong / Singapore)",
    "ZP": "ZP/A (Hong Kong / Singapore)",
    "J/A": "J/A (Japan)",
    "J": "J/A (Japan)",
    "KH/A": "KH/A (South Korea)",
    "KH": "KH/A (South Korea)",
    "AE/A": "AE/A (UAE)",
    "AE": "AE/A (UAE)",
    "AB/A": "AB/A (Middle East)",
    "AB": "AB/A (Middle East)",
    "B/A": "B/A (United Kingdom)",
    "B": "B/A (United Kingdom)",
    "ZD/A": "ZD/A (Germany)",
    "ZD": "ZD/A (Germany)",
    "FD/A": "FD/A (France)",
    "FD": "FD/A (France)",
    "EU/A": "EU/A (Europe)",
    "EU": "EU/A (Europe)",
    "HN/A": "HN/A (India)",
    "HN": "HN/A (India)",
    "VN/A": "VN/A (Vietnam)",
    "VN": "VN/A (Vietnam)",
    "MY/A": "MY/A (Malaysia)",
    "MY": "MY/A (Malaysia)",
    "X/A": "X/A (Australia)",
    "X": "X/A (Australia)",
    "C/A": "C/A (Canada)",
    "C": "C/A (Canada)",
    "TA/A": "TA/A (Taiwan)",
    "TA": "TA/A (Taiwan)",
}


# ============================================================================
# Standalone Conversion & Resolver Functions
# ============================================================================

def load_apple_models_data(json_path: Optional[str] = None) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
    """Loads apple_models.json supporting both flat and nested structure formats."""
    path = json_path or get_data_path("apple_models.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if "models" in data:
                models = {**BUILTIN_APPLE_MODELS, **data["models"]}
                ram = {**BUILTIN_RAM_SPECS, **data.get("ram_specs", {})}
                colors = {**BUILTIN_APPLE_COLORS, **data.get("colors", {})}
                regions = {**BUILTIN_APPLE_REGIONS, **data.get("regions", {})}
                return models, ram, colors, regions
            else:
                flat_models = {k: v for k, v in data.items() if not k.startswith("_")}
                return {**BUILTIN_APPLE_MODELS, **flat_models}, BUILTIN_RAM_SPECS, BUILTIN_APPLE_COLORS, BUILTIN_APPLE_REGIONS
        except Exception as e:
            logger.debug(f"Could not load custom apple_models.json: {e}")

    return BUILTIN_APPLE_MODELS, BUILTIN_RAM_SPECS, BUILTIN_APPLE_COLORS, BUILTIN_APPLE_REGIONS


def resolve_apple_model(product_type: Optional[str], mapping_dict: Optional[Dict[str, str]] = None) -> str:
    """
    Maps Apple ProductType (e.g. iPhone17,2) to marketing name (e.g. iPhone 16 Pro Max).
    Gracefully handles unknown or future product types without raising exceptions.
    """
    if not product_type or not isinstance(product_type, str):
        return "Apple Device"
    active_map = mapping_dict if mapping_dict is not None else BUILTIN_APPLE_MODELS
    if product_type in active_map:
        return active_map[product_type]
    # Check if loaded from file
    if product_type.startswith("iPhone"):
        return f"Unknown iPhone ({product_type})"
    return product_type or "Apple Device"


def parse_ios_commercial_storage(total_bytes: int) -> str:
    """
    Converts TotalDiskCapacity in bytes to standard commercial storage (decimal: 1 GB = 1e9 bytes).
    Boundary thresholds strictly partition standard retail capacity tiers.
    """
    if not total_bytes or total_bytes <= 0:
        return "Unknown"
    gb = total_bytes / 1e9
    if gb <= 18.0:
        return "16GB"
    elif gb <= 36.0:
        return "32GB"
    elif gb <= 72.0:
        return "64GB"
    elif gb <= 145.0:
        return "128GB"
    elif gb <= 290.0:
        return "256GB"
    elif gb <= 580.0:
        return "512GB"
    elif gb <= 1150.0:
        return "1TB"
    elif gb <= 2300.0:
        return "2TB"
    else:
        return f"{round(gb)}GB"


# Alias for compatibility with Explorer 2
parse_ios_storage = parse_ios_commercial_storage


def decode_apple_region(region_code: Optional[str]) -> str:
    """Decodes Apple RegionInfo (e.g. LL/A) into descriptive retail region string."""
    if not region_code:
        return "Unknown"
    clean = region_code.strip()
    if clean in BUILTIN_APPLE_REGIONS:
        return BUILTIN_APPLE_REGIONS[clean]
    # Try normalized /A suffix
    if not clean.endswith("/A") and f"{clean}/A" in BUILTIN_APPLE_REGIONS:
        return BUILTIN_APPLE_REGIONS[f"{clean}/A"]
    return clean


def _hex_to_rgb(hex_str: str) -> Optional[Tuple[int, int, int]]:
    """Converts a #RRGGBB or RRGGBB string to (R, G, B) tuple."""
    clean = hex_str.strip().lstrip("#")
    if len(clean) == 6:
        try:
            return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)
        except ValueError:
            return None
    return None


def _find_nearest_apple_color(hex_str: str, lookup: Dict[str, str], threshold: float = 48.0) -> Optional[str]:
    """Finds the closest known Apple marketing color using Euclidean RGB distance."""
    rgb = _hex_to_rgb(hex_str)
    if not rgb:
        return None
    r1, g1, b1 = rgb
    best_match = None
    min_dist = float("inf")
    for ref_hex, name in lookup.items():
        ref_rgb = _hex_to_rgb(ref_hex)
        if not ref_rgb:
            continue
        r2, g2, b2 = ref_rgb
        dist = ((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist
            best_match = name
    if min_dist <= threshold:
        return best_match
    return None


def resolve_apple_color(
    raw_color: Optional[str],
    raw_enclosure: Optional[str] = None,
    color_map: Optional[Dict[str, str]] = None,
    raw_housing: Optional[str] = None
) -> str:
    """
    Resolves Apple DeviceColor/DeviceEnclosureColor/HousingColor hex codes or string identifiers
    into official human-readable marketing color names.
    """
    lookup = color_map or BUILTIN_APPLE_COLORS
    candidates = [raw_enclosure, raw_color, raw_housing]

    # 1. First check if any candidate is a numeric code (e.g. '1', '#1', '2', '#2')
    for cand in candidates:
        if cand is not None:
            c_str = str(cand).strip()
            num_cand = c_str.lstrip("#").strip()
            if num_cand in APPLE_NUMERIC_COLORS:
                return APPLE_NUMERIC_COLORS[num_cand]

    # 2. Check exact hex matches in lookup (e.g. '#505e6b')
    for cand in candidates:
        if cand and str(cand).strip().startswith("#"):
            hex_clean = str(cand).strip().lower()
            if hex_clean in lookup:
                return lookup[hex_clean]

    # 3. Check nearest Euclidean RGB color match for hex codes
    for cand in candidates:
        if cand and str(cand).strip().startswith("#"):
            nearest = _find_nearest_apple_color(str(cand).strip(), lookup)
            if nearest:
                return nearest

    # 4. Check known marketing string names (e.g. 'Natural Titanium', 'Midnight', 'desert_titanium')
    for cand in candidates:
        if cand:
            s = str(cand).strip()
            if not s or s.startswith("#"):
                continue
            clean_name = s.replace("_", " ").replace("-", " ").title()
            if "Product" in clean_name and "Red" in clean_name:
                return "(PRODUCT)RED"
            for v in lookup.values():
                if clean_name.lower() == v.lower():
                    return v
            return clean_name

    # 5. Fallback: if candidate was an unrecognized hex code, return uppercase hex
    for cand in candidates:
        if cand and str(cand).strip().startswith("#"):
            return str(cand).strip().upper()

    return "Unknown"


def parse_apple_part_and_region(model_num: Optional[str], region_info: Optional[str]) -> Tuple[str, str]:
    """
    Combines ModelNumber (e.g. MYWV3) and RegionInfo (e.g. LL/A) into full part number.
    Safely prevents duplicate region suffixes if ModelNumber already includes the region code.
    """
    model = (model_num or "").strip()
    region = (region_info or "").strip()

    if region and not region.endswith("/A") and len(region) <= 3:
        region = f"{region}/A"

    if model:
        # Check if model already ends with a standard [A-Z]{1,3}/A pattern
        m_reg = re.search(r'([A-Z]{1,3}/A)$', model)
        if m_reg:
            detected_region = m_reg.group(1)
            final_region = region if region else detected_region
            return model, final_region
        if region and model.endswith(region.replace("/A", "")):
            return f"{model}/A", region
        if region:
            return f"{model}{region}", region
        return model, "Unknown"

    return region or "Unknown", region or "Unknown"


def calculate_ios_battery_health(battery_data_or_bytes: Any) -> Tuple[Optional[int], Optional[int]]:
    """
    Calculates battery health percentage (0-100) and charge cycles from
    a dictionary or raw XML plist bytes.
    """
    data: Dict[str, Any] = {}
    if isinstance(battery_data_or_bytes, (bytes, bytearray)):
        payload = bytes(battery_data_or_bytes)
        # Resilient XML extraction: slice between <?xml or <plist and </plist>
        xml_start = payload.find(b"<?xml")
        if xml_start == -1:
            xml_start = payload.find(b"<plist")
        xml_end = payload.rfind(b"</plist>")

        if xml_start != -1 and xml_end != -1 and xml_end > xml_start:
            clean_payload = payload[xml_start : xml_end + 8]
        else:
            clean_payload = payload

        try:
            parsed = plistlib.loads(clean_payload)
            if isinstance(parsed, dict):
                data = parsed
            elif isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                data = parsed[0]
        except Exception:
            return None, None
    elif isinstance(battery_data_or_bytes, dict):
        data = battery_data_or_bytes
    else:
        return None, None

    def find_key(obj: Any, key: str) -> Optional[Any]:
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                res = find_key(v, key)
                if res is not None:
                    return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_key(item, key)
                if res is not None:
                    return res
        return None

    cycle_count = find_key(data, "CycleCount")
    max_pct = find_key(data, "MaximumCapacityPercent")
    nominal_cap = find_key(data, "NominalChargeCapacity")
    design_cap = find_key(data, "DesignCapacity")

    health: Optional[int] = None
    parsed_max_pct: Optional[float] = None
    if max_pct is not None:
        try:
            parsed_max_pct = float(max_pct)
        except (ValueError, TypeError):
            parsed_max_pct = None

    if parsed_max_pct is not None and 1 <= parsed_max_pct <= 100:
        health = int(round(parsed_max_pct))
    else:
        try:
            nom = float(nominal_cap) if nominal_cap is not None else None
            des = float(design_cap) if design_cap is not None else None
            if nom is not None and des is not None and des > 0:
                calculated = (nom / des) * 100
                health = min(100, max(0, int(round(calculated))))
        except (ValueError, TypeError):
            health = None

    cycles: Optional[int] = None
    if cycle_count is not None:
        try:
            cycles = int(round(float(cycle_count)))
        except (ValueError, TypeError):
            cycles = None

    return health, cycles


parse_battery_health_plist = calculate_ios_battery_health


def parse_ideviceinfo_xml(xml_bytes_or_str: Any) -> Optional[DeviceSpecs]:
    """
    Deserializes output of 'ideviceinfo -x' XML plist into a DeviceSpecs dataclass.
    """
    if isinstance(xml_bytes_or_str, str):
        payload = xml_bytes_or_str.encode("utf-8", errors="replace")
    elif isinstance(xml_bytes_or_str, (bytes, bytearray)):
        payload = bytes(xml_bytes_or_str)
    else:
        return None

    # Resilient XML extraction: slice between <?xml or <plist and </plist>
    xml_start = payload.find(b"<?xml")
    if xml_start == -1:
        xml_start = payload.find(b"<plist")
    xml_end = payload.rfind(b"</plist>")

    if xml_start != -1 and xml_end != -1 and xml_end > xml_start:
        clean_payload = payload[xml_start : xml_end + 8]
    else:
        clean_payload = payload

    try:
        plist = plistlib.loads(clean_payload)
    except Exception as e:
        logger.debug(f"Failed to parse ideviceinfo XML: {e}")
        return None

    if not isinstance(plist, dict):
        logger.debug(f"Expected plist dict root, got {type(plist).__name__}")
        return None

    models, ram_specs, colors, regions = load_apple_models_data()

    product_type = str(plist.get("ProductType") or "")
    marketing_name = resolve_apple_model(product_type, models)
    ram = ram_specs.get(marketing_name, "")

    raw_storage = plist.get("TotalDiskCapacity", 0)
    try:
        if isinstance(raw_storage, (int, float)):
            storage_bytes = int(raw_storage)
        elif isinstance(raw_storage, str):
            storage_bytes = int(float(raw_storage.strip()))
        else:
            storage_bytes = 0
    except (ValueError, TypeError, OverflowError):
        storage_bytes = 0
    storage = parse_ios_commercial_storage(storage_bytes)

    device_color = str(plist.get("DeviceColor") or "")
    enclosure_color = str(plist.get("DeviceEnclosureColor") or "")
    housing_color = str(plist.get("HousingColor") or "")
    back_glass_color = str(plist.get("BackGlassColor") or "")
    cover_glass_color = str(plist.get("CoverGlassColor") or "")
    raw_housing = housing_color or back_glass_color or cover_glass_color
    color = resolve_apple_color(device_color, enclosure_color, colors, raw_housing=raw_housing)

    os_version = f"iOS {plist.get('ProductVersion', '')}".strip()
    serial_number = str(plist.get("SerialNumber") or "")
    udid = str(plist.get("UniqueDeviceID") or "")

    from core.adb_reader import validate_luhn

    raw_imei1 = str(plist.get("InternationalMobileEquipmentIdentity") or "")
    clean_imei1 = re.sub(r"\D", "", raw_imei1)
    imei1 = clean_imei1 if (len(clean_imei1) == 15 and validate_luhn(clean_imei1)) else clean_imei1

    # If color is still Unknown or a raw hex code, query TAC-to-color mapping if IMEI is present
    if (color == "Unknown" or color.startswith("#")) and len(imei1) >= 8:
        try:
            from core.database import DatabaseManager
            db = DatabaseManager()
            tac_color = db.lookup_tac_color(imei1[:8], marketing_name)
            if tac_color:
                color = tac_color
        except Exception:
            pass

    imei2_val = plist.get("InternationalMobileEquipmentIdentity2")
    if imei2_val:
        clean_imei2 = re.sub(r"\D", "", str(imei2_val))
        imei2 = clean_imei2 if (len(clean_imei2) == 15 and validate_luhn(clean_imei2)) else clean_imei2
    else:
        imei2 = None

    model_num = plist.get("ModelNumber")
    region_info = plist.get("RegionInfo")
    part_number, _ = parse_apple_part_and_region(model_num, region_info)
    sales_region = decode_apple_region(region_info)

    return DeviceSpecs(
        connection_type="ios",
        device_id=udid or serial_number,
        brand="Apple",
        marketing_name=marketing_name,
        model_code=part_number,
        storage=storage,
        ram=ram,
        color=color,
        os_version=os_version,
        serial_number=serial_number,
        imei1=imei1,
        imei2=imei2,
        battery_health=None,
        battery_cycles=None,
        sales_region=sales_region or None,
        bootloader_locked=True,
        condition_grade="A+",
        remarks="",
        raw_properties=plist
    )


# ============================================================================
# IOSReader Background Polling Engine
# ============================================================================

class IOSReader:
    """
    Production-grade iOS extraction engine utilizing bundled libimobiledevice binaries.
    Executes non-blocking 2-second background polling with graceful stop.
    """
    def __init__(self, bin_dir: Optional[str] = None, models_json_path: Optional[str] = None):
        self.bin_dir = bin_dir or self._default_bin_dir()
        self.models_json_path = models_json_path or get_data_path("apple_models.json")
        self.models, self.ram_specs, self.colors, self.regions = load_apple_models_data(self.models_json_path)

        self._polling_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._connected_udids: Set[str] = set()
        self._last_device_id: Optional[str] = None

        # Unified callback interface
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[str], None]] = None

    def _default_bin_dir(self) -> str:
        exe_path = get_binary_path("idevice_id")
        return os.path.dirname(exe_path)

    def _exec(self, binary_name: str, args: List[str], timeout: float = 3.0) -> Tuple[int, bytes, bytes]:
        name = binary_name
        if sys.platform == "win32" and not name.lower().endswith(".exe"):
            name += ".exe"
        exe_path = os.path.join(self.bin_dir, name)
        if not os.path.exists(exe_path):
            exe_path = get_binary_path(name)

        cmd = [exe_path] + args
        try:
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW,
                timeout=timeout
            )
            return res.returncode, res.stdout, res.stderr
        except subprocess.TimeoutExpired:
            return -1, b"", b"TimeoutExpired"
        except Exception as e:
            return -2, b"", str(e).encode()

    def list_device_udids(self) -> List[str]:
        """Lists connected USB device UDIDs via 'idevice_id -l'."""
        code, out, _ = self._exec("idevice_id", ["-l"])
        if code != 0 or not out:
            return []
        lines = out.decode("utf-8", errors="replace").splitlines()
        return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]

    def extract_storage_telemetry(self, udid: Optional[str] = None) -> Optional[int]:
        """
        Queries disk usage domain to retrieve TotalDiskCapacity in bytes.
        """
        args = ["-q", "com.apple.disk_usage", "-x"]
        if udid:
            args = ["-u", udid] + args
        code, out, _ = self._exec("ideviceinfo", args, timeout=4.0)
        if code == 0 and out:
            try:
                xml_start = out.find(b"<?xml")
                if xml_start == -1:
                    xml_start = out.find(b"<plist")
                xml_end = out.rfind(b"</plist>")
                payload = out[xml_start : xml_end + 8] if (xml_start != -1 and xml_end != -1) else out
                disk_plist = plistlib.loads(payload)
                cap = disk_plist.get("TotalDiskCapacity", 0)
                if cap and int(cap) > 0:
                    return int(cap)
            except Exception as e:
                logger.debug(f"Failed to parse disk_usage XML: {e}")
        return None

    def extract_device_telemetry(self, udid: Optional[str] = None) -> Tuple[Optional[DeviceSpecs], str]:
        """
        Executes 'ideviceinfo -x' to extract complete iOS specs and checks lockdown error states.
        Returns (specs_or_none, status_message).
        """
        args = ["-x"]
        if udid:
            args = ["-u", udid, "-x"]

        code, out, err = self._exec("ideviceinfo", args)
        err_str = err.decode("utf-8", errors="replace")

        # Check lockdown error states on non-zero return code or error stream
        if code != 0 or not out:
            combined = err_str + " " + out.decode("utf-8", errors="replace")
            if "-17" in combined or "PasswordProtected" in combined:
                return None, "Device Locked - Enter Passcode on iPhone"
            if "-19" in combined or "PairingDialogResponsePending" in combined:
                return None, "Tap 'Trust This Computer' on iPhone screen"
            if "-18" in combined or "UserDeniedPairing" in combined:
                return None, "Pairing Denied by User"
            return None, "No device response or lockdownd connection error"

        specs = parse_ideviceinfo_xml(out)
        if not specs:
            return None, "Failed to parse device XML plist"

        # Check if the device is passcode locked from parsed plist properties
        raw_props = getattr(specs, "raw_properties", {}) or {}
        if raw_props.get("PasswordProtected") is True:
            return None, "Device Locked - Enter Passcode on iPhone"

        active_udid = udid or specs.device_id

        # If storage is Unknown, query disk usage domain
        if specs.storage == "Unknown" or not specs.storage:
            storage_bytes = self.extract_storage_telemetry(active_udid)
            if storage_bytes:
                specs.storage = parse_ios_commercial_storage(storage_bytes)

        battery_health, battery_cycles = self.extract_battery_telemetry(active_udid)
        if battery_health is None:
            battery_health = self.extract_battery_charge_level(active_udid)
        specs.battery_health = battery_health
        specs.battery_cycles = battery_cycles

        return specs, "Ready"

    def extract_battery_telemetry(self, udid: Optional[str] = None) -> Tuple[Optional[int], Optional[int]]:
        """
        Executes battery diagnostics fallback ladder:
        1. idevicediagnostics ioregentry AppleSmartBattery
        2. idevicediagnostics diagnostics GasGauge
        Returns (battery_health_pct, cycle_count). Returns (None, None) if unavailable.
        """
        # Step 1: AppleSmartBattery
        args1 = ["-u", udid, "ioregentry", "AppleSmartBattery"] if udid else ["ioregentry", "AppleSmartBattery"]
        code1, out1, _ = self._exec("idevicediagnostics", args1)
        if code1 == 0 and out1 and (b"AppleSmartBattery" in out1 or b"CycleCount" in out1 or b"NominalChargeCapacity" in out1 or b"xml" in out1 or b"plist" in out1):
            health, cycles = calculate_ios_battery_health(out1)
            if health is not None or cycles is not None:
                return health, cycles

        # Step 2: GasGauge fallback
        args2 = ["-u", udid, "diagnostics", "GasGauge"] if udid else ["diagnostics", "GasGauge"]
        code2, out2, _ = self._exec("idevicediagnostics", args2)
        if code2 == 0 and out2 and (b"GasGauge" in out2 or b"CycleCount" in out2 or b"Cycle" in out2 or b"xml" in out2 or b"plist" in out2):
            health, cycles = calculate_ios_battery_health(out2)
            if health is not None or cycles is not None:
                return health, cycles

        # Note: ideviceinfo -q com.apple.mobile.battery provides BatteryCurrentCapacity
        # (current charge level %), NOT Battery Health %. We strictly return None for health.
        return None, None

    def extract_battery_charge_level(self, udid: Optional[str] = None) -> Optional[int]:
        """
        Fallback when Battery Health diagnostics are unavailable: queries com.apple.mobile.battery
        for BatteryCurrentCapacity (current charge level 0-100%).
        """
        args = ["-q", "com.apple.mobile.battery", "-x"]
        if udid:
            args = ["-u", udid] + args
        code, out, _ = self._exec("ideviceinfo", args, timeout=3.0)
        if code == 0 and out:
            try:
                xml_start = out.find(b"<?xml")
                if xml_start == -1:
                    xml_start = out.find(b"<plist")
                xml_end = out.rfind(b"</plist>")
                payload = out[xml_start : xml_end + 8] if (xml_start != -1 and xml_end != -1) else out
                bat_plist = plistlib.loads(payload)
                if isinstance(bat_plist, dict):
                    cap = bat_plist.get("BatteryCurrentCapacity") or bat_plist.get("CurrentCapacity")
                    if cap is not None:
                        val = int(round(float(cap)))
                        if 0 <= val <= 100:
                            return val
            except Exception as e:
                logger.debug(f"Failed to parse battery domain XML: {e}")
        return None

    def start_polling(
        self,
        on_connected: Optional[Callable[[DeviceSpecs], None]] = None,
        on_disconnected: Optional[Callable[[], None]] = None,
        on_status: Optional[Callable[[str], None]] = None,
        interval: float = 2.0
    ) -> None:
        """Starts background 2-second polling thread."""
        self.stop_polling()
        self._stop_event.clear()

        if on_connected:
            self.on_device_connected = on_connected
        if on_disconnected:
            self.on_device_disconnected = on_disconnected
        if on_status:
            self.on_status_changed = on_status

        def _poll_worker():
            while not self._stop_event.is_set():
                try:
                    udids = self.list_device_udids()
                    current_set = set(udids)

                    # Detect newly connected device
                    new_udids = current_set - self._connected_udids
                    for udid in new_udids:
                        specs, status = self.extract_device_telemetry(udid)
                        if specs:
                            self._connected_udids.add(udid)
                            self._last_device_id = udid
                            if self.on_status_changed:
                                self.on_status_changed("ios")
                            if self.on_device_connected:
                                self.on_device_connected(specs)
                        else:
                            if self.on_status_changed:
                                self.on_status_changed(status)

                    # Detect disconnected device
                    lost_udids = self._connected_udids - current_set
                    for udid in lost_udids:
                        self._connected_udids.remove(udid)
                        if self._last_device_id == udid:
                            self._last_device_id = None
                        if self.on_status_changed:
                            self.on_status_changed("none")
                        if self.on_device_disconnected:
                            self.on_device_disconnected()

                except Exception as e:
                    logger.debug(f"IOSReader poll loop error: {e}")

                self._stop_event.wait(timeout=interval)

        self._polling_thread = threading.Thread(
            target=_poll_worker,
            daemon=True,
            name="IOSReaderPollingThread"
        )
        self._polling_thread.start()

    def stop_polling(self) -> None:
        """Gracefully halts background polling thread."""
        self._stop_event.set()
        if self._polling_thread and self._polling_thread.is_alive():
            self._polling_thread.join(timeout=3.0)
        self._polling_thread = None
