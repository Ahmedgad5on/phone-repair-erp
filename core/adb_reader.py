"""
Android & Fastboot Hardware Extraction Engine.
Provides asynchronous polling, daemon sanitization, deterministic storage/RAM calculators,
OEM model code resolution, multi-strategy IMEI extraction, multi-OEM color resolution,
and Fastboot telemetry.
"""
from dataclasses import replace
import logging
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple, Any

from core.models import DeviceSpecs
from core.paths import (
    get_binary_path,
    get_adb_keys_dir,
    setup_adb_environment,
    ensure_keypair_exists,
    ensure_adb_keypair_exists,
)

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


def run_cmd(
    args: List[str],
    timeout: float = 3.0,
    env: Optional[Dict[str, str]] = None
) -> Tuple[int, str, str]:
    """
    Executes an external command with CREATE_NO_WINDOW on Windows to prevent console flashing.
    Automatically ensures full system environment (SystemRoot, PATH) and portable ADB key vault are injected.
    Returns (returncode, stdout, stderr).
    """
    cmd_env = os.environ.copy()
    if env is not None:
        cmd_env.update(env)
    if "ADB_VENDOR_KEYS" not in cmd_env:
        try:
            vault_env = setup_adb_environment()
            cmd_env.update(vault_env)
        except Exception:
            pass
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            timeout=timeout,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=cmd_env
        )
        return proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Timeout expired"
    except Exception as e:
        return -1, "", str(e)


def setup_adb_server(
    adb_path: Optional[str] = None,
    base_dir: Optional[Path] = None
) -> Tuple[int, str, str]:
    """
    Ensures the key vault is active and starts the ADB daemon using portable keys.
    """
    env = setup_adb_environment(base_dir)
    keys_dir = get_adb_keys_dir(base_dir)
    ensure_keypair_exists(keys_dir)
    path = adb_path or get_binary_path("adb")
    return run_cmd([path, "start-server"], timeout=5.0, env=env)


def sanitize_adb_output(raw_output: str) -> str:
    """Strips transient daemon startup messages, banner noise, and version clashes."""
    if not raw_output or not isinstance(raw_output, str):
        return ""
    lines = raw_output.splitlines()
    clean = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if (
            stripped.startswith("* daemon")
            or "daemon started" in stripped.lower()
            or "killing..." in stripped.lower()
        ):
            continue
        clean.append(stripped)
    return "\n".join(clean)


# ============================================================================
# Deterministic Commercial Storage & RAM Parsers
# ============================================================================

def parse_android_commercial_storage(total_kb: int) -> str:
    """
    Converts 1K-blocks in /data to standard commercial storage sizes.
    Uses decimal calculation: (total_kb * 1024) / 1e9.
    """
    if total_kb <= 0:
        return "Unknown"
    decimal_gb = (total_kb * 1024) / 1e9
    if decimal_gb <= 18.0:
        return "16GB"
    elif decimal_gb <= 36.0:
        return "32GB"
    elif decimal_gb <= 72.0:
        return "64GB"
    elif decimal_gb <= 145.0:
        return "128GB"
    elif decimal_gb <= 290.0:
        return "256GB"
    elif decimal_gb <= 580.0:
        return "512GB"
    elif decimal_gb <= 1150.0:
        return "1TB"
    elif decimal_gb <= 2300.0:
        return "2TB"
    else:
        return f"{round(decimal_gb / 1000)}TB"


def parse_storage_from_df(df_output: Optional[str]) -> str:
    """
    Parses 'adb shell df -k /data' or 'adb shell df /data'.
    Handles standard Toybox, Busybox, and multiline wrapped outputs.
    """
    if not df_output or not isinstance(df_output, str):
        return "Unknown"

    clean = sanitize_adb_output(df_output)
    total_kb: Optional[int] = None

    for line in clean.splitlines():
        if "/data" in line:
            parts = line.split()
            # Look for 1K-blocks column (first large numeric token >= 1,000,000 KB)
            for part in parts:
                if part.isdigit() and int(part) >= 1000000:
                    total_kb = int(part)
                    break
            if total_kb:
                break

    if not total_kb:
        match = re.search(r'(\d+)\s*K?\s*total', clean, re.IGNORECASE)
        if match:
            total_kb = int(match.group(1))

    if not total_kb:
        return "Unknown"

    return parse_android_commercial_storage(total_kb)


def parse_android_commercial_ram(mem_total_kb: int) -> str:
    """
    Converts /proc/meminfo MemTotal in kB to standard commercial RAM ratings.
    Accounts for Linux kernel code, baseband modem, and GPU carveouts.
    """
    if mem_total_kb <= 0:
        return "Unknown"
    mem_mb = mem_total_kb / 1024.0
    if mem_mb <= 2300:
        return "2GB"
    elif mem_mb <= 3400:
        return "3GB"
    elif mem_mb <= 4600:
        return "4GB"
    elif mem_mb <= 6800:
        return "6GB"
    elif mem_mb <= 9500:
        return "8GB"
    elif mem_mb <= 14000:
        return "12GB"
    elif mem_mb <= 19000:
        return "16GB"
    elif mem_mb <= 28000:
        return "24GB"
    else:
        return f"{round(mem_mb / 1024.0)}GB"


def parse_ram_from_meminfo(meminfo_output: Optional[str]) -> str:
    """
    Parses 'adb shell cat /proc/meminfo' extracting MemTotal.
    """
    if not meminfo_output or not isinstance(meminfo_output, str):
        return "Unknown"
    clean = sanitize_adb_output(meminfo_output)
    match = re.search(r'MemTotal:\s*(\d+)\s*kB', clean, re.IGNORECASE)
    if not match:
        return "Unknown"
    try:
        mem_kb = int(match.group(1))
    except (ValueError, TypeError):
        return "Unknown"
    return parse_android_commercial_ram(mem_kb)


# ============================================================================
# OEM Model Resolvers & Dictionaries
# ============================================================================

SAMSUNG_PREFIX_RULES = [
    (r"^SM-S928[A-Z0-9]*", "Galaxy S24 Ultra"),
    (r"^SM-S926[A-Z0-9]*", "Galaxy S24+"),
    (r"^SM-S921[A-Z0-9]*", "Galaxy S24"),
    (r"^SM-S918[A-Z0-9]*", "Galaxy S23 Ultra"),
    (r"^SM-S916[A-Z0-9]*", "Galaxy S23+"),
    (r"^SM-S911[A-Z0-9]*", "Galaxy S23"),
    (r"^SM-S908[A-Z0-9]*", "Galaxy S22 Ultra"),
    (r"^SM-S906[A-Z0-9]*", "Galaxy S22+"),
    (r"^SM-S901[A-Z0-9]*", "Galaxy S22"),
    (r"^SM-G998[A-Z0-9]*", "Galaxy S21 Ultra 5G"),
    (r"^SM-G996[A-Z0-9]*", "Galaxy S21+ 5G"),
    (r"^SM-G991[A-Z0-9]*", "Galaxy S21 5G"),
    (r"^SM-G990[A-Z0-9]*", "Galaxy S21 FE 5G"),
    (r"^SM-G988[A-Z0-9]*", "Galaxy S20 Ultra"),
    (r"^SM-G986[A-Z0-9]*", "Galaxy S20+"),
    (r"^SM-G981[A-Z0-9]*", "Galaxy S20 5G"),
    (r"^SM-G980[A-Z0-9]*", "Galaxy S20"),
    (r"^SM-G781[A-Z0-9]*", "Galaxy S20 FE 5G"),
    (r"^SM-G780[A-Z0-9]*", "Galaxy S20 FE"),
    (r"^SM-N986[A-Z0-9]*", "Galaxy Note 20 Ultra 5G"),
    (r"^SM-N981[A-Z0-9]*", "Galaxy Note 20 5G"),
    (r"^SM-N975[A-Z0-9]*", "Galaxy Note 10+"),
    (r"^SM-N970[A-Z0-9]*", "Galaxy Note 10"),
    (r"^SM-F946[A-Z0-9]*", "Galaxy Z Fold 5"),
    (r"^SM-F936[A-Z0-9]*", "Galaxy Z Fold 4"),
    (r"^SM-F926[A-Z0-9]*", "Galaxy Z Fold 3"),
    (r"^SM-F731[A-Z0-9]*", "Galaxy Z Flip 5"),
    (r"^SM-F721[A-Z0-9]*", "Galaxy Z Flip 4"),
    (r"^SM-F711[A-Z0-9]*", "Galaxy Z Flip 3"),
    (r"^SM-A556[A-Z0-9]*", "Galaxy A55 5G"),
    (r"^SM-A546[A-Z0-9]*", "Galaxy A54 5G"),
    (r"^SM-A536[A-Z0-9]*", "Galaxy A53 5G"),
    (r"^SM-A528[A-Z0-9]*", "Galaxy A52s 5G"),
    (r"^SM-A525[A-Z0-9]*", "Galaxy A52"),
    (r"^SM-A356[A-Z0-9]*", "Galaxy A35 5G"),
    (r"^SM-A346[A-Z0-9]*", "Galaxy A34 5G"),
    (r"^SM-A336[A-Z0-9]*", "Galaxy A33 5G"),
    (r"^SM-A256[A-Z0-9]*", "Galaxy A25 5G"),
    (r"^SM-A245[A-Z0-9]*", "Galaxy A24"),
    (r"^SM-A235[A-Z0-9]*", "Galaxy A23"),
    (r"^SM-A155[A-Z0-9]*", "Galaxy A15"),
    (r"^SM-A156[A-Z0-9]*", "Galaxy A15 5G"),
    (r"^SM-A145[A-Z0-9]*", "Galaxy A14"),
    (r"^SM-A135[A-Z0-9]*", "Galaxy A13"),
    (r"^SM-A055[A-Z0-9]*", "Galaxy A05"),
    (r"^SM-A057[A-Z0-9]*", "Galaxy A05s"),
]

XIAOMI_CODE_MAP = {
    "2312DRA50G": "Redmi Note 13 Pro 5G",
    "2312DRA50C": "Redmi Note 13 Pro 5G",
    "23049PCD8G": "POCO F5",
    "2210132G": "Xiaomi 13 Pro",
    "23116PN5BC": "Xiaomi 14 Pro",
    "23127PN0CG": "Xiaomi 14",
    "2201116PG": "POCO X4 Pro 5G",
    "21091116UG": "Redmi Note 11 Pro 5G",
}

OPPO_ONEPLUS_MAP = {
    # Oppo Reno 12 Series
    "CPH2819": "Oppo Reno 12 5G",
    "CPH2821": "Oppo Reno 12 Pro 5G",
    "CPH2641": "Oppo Reno 12 F 5G",
    "CPH2637": "Oppo Reno 12 F 4G",
    "CPH2669": "Oppo Reno 12 FS 5G",
    # Oppo Reno 11 Series
    "CPH2607": "Oppo Reno 11 5G",
    "CPH2603": "Oppo Reno 11 Pro 5G",
    "CPH2605": "Oppo Reno 11 F 5G",
    # Oppo Reno 10 Series
    "CPH2531": "Oppo Reno 10 5G",
    "CPH2527": "Oppo Reno 10 Pro 5G",
    "CPH2521": "Oppo Reno 10 Pro+ 5G",
    # Oppo Reno 8 & Older
    "CPH2481": "Oppo Reno 8T 5G",
    "CPH2471": "Oppo A78 4G",
    "CPH2483": "Oppo Reno 8T 4G",
    "CPH2359": "Oppo Reno 8 5G",
    "CPH2357": "Oppo Reno 8 Pro 5G",
    "CPH2371": "Oppo Reno 7 5G",
    "CPH2363": "Oppo Reno 7 Pro 5G",
    # Oppo A Series
    "CPH2639": "Oppo A3",
    "CPH2631": "Oppo A3 Pro 5G",
    "CPH2643": "Oppo A3x",
    "CPH2599": "Oppo A79 5G",
    "CPH2579": "Oppo A38",
    "CPH2577": "Oppo A18",
    "CPH2477": "Oppo A17",
    "CPH2387": "Oppo A57",
    "CPH2385": "Oppo A77 5G",
    "CPH2369": "Oppo A96",
    "CPH2269": "Oppo A16",
    "CPH2185": "Oppo A15",
    "CPH2239": "Oppo A54",
    # OnePlus
    "CPH2581": "OnePlus 12",
    "CPH2609": "OnePlus 12R",
    "CPH2451": "OnePlus 11",
    "CPH2449": "OnePlus 11 5G",
    "CPH2551": "OnePlus Open",
    "CPH2415": "OnePlus 11R",
    "CPH2493": "OnePlus Nord 3 5G",
    "CPH2569": "OnePlus Nord CE 3 5G",
    "CPH2513": "OnePlus Nord CE 3 Lite 5G",
    "CPH2613": "OnePlus Nord CE 4 5G",
}

HONOR_HUAWEI_MAP = {
    # Honor 200 Series
    "NIC-LX2": "Honor 200 Lite",
    "NIC-LX1": "Honor 200 Lite",
    "ELI-NX9": "Honor 200 5G",
    "EYY-NX9": "Honor 200 Pro 5G",
    # Honor X Series
    "ALI-NX1": "Honor X9b 5G",
    "ALI-AN00": "Honor X9b",
    "WLY-LX1": "Honor X8b",
    "WLY-LX2": "Honor X8b",
    "ANY-LX1": "Honor X7b",
    "ANY-LX2": "Honor X7b",
    "RBN-LX1": "Honor X6a",
    "WDY-LX1": "Honor X6b",
    # Honor 90 / 70 / 50 Series
    "CLK-LX1": "Honor 90 Lite",
    "CLK-LX2": "Honor 90 Lite",
    "REA-AN00": "Honor 90 5G",
    "REA-NX9": "Honor 90 5G",
    "FNE-AN00": "Honor 70 5G",
    "FNE-NX9": "Honor 70 5G",
    "CRT-LX1": "Honor 50",
    "CRT-LX2": "Honor 50",
    # Honor Magic Series
    "BVL-AN16": "Honor Magic 6 Pro",
    "BVL-N49": "Honor Magic 6 Pro",
    "PGT-AN10": "Honor Magic 5 Pro",
    "PGT-N19": "Honor Magic 5 Pro",
    "VER-AN10": "Honor Magic V2",
    "FCP-AN10": "Honor Magic V3",
    # Huawei
    "PNT-LX9": "Huawei Pura 70",
    "HBP-LX9": "Huawei Pura 70 Pro",
    "MNA-LX9": "Huawei P60 Pro",
    "DCO-LX9": "Huawei Mate 50 Pro",
    "ALN-AL00": "Huawei Mate 60 Pro",
}

REALME_MAP = {
    "RMX3771": "Realme 11 Pro+ 5G",
    "RMX3741": "Realme 11 Pro 5G",
    "RMX3830": "Realme 11 5G",
    "RMX3760": "Realme C53",
    "RMX3710": "Realme C55",
    "RMX3834": "Realme C67",
    "RMX3890": "Realme 12 Pro+ 5G",
    "RMX3840": "Realme 12 Pro 5G",
    "RMX3999": "Realme 12+ 5G",
    "RMX3997": "Realme Note 50",
    "RMX3630": "Realme 10 4G",
    "RMX3686": "Realme 10 Pro+ 5G",
    "RMX3612": "Realme 9 Pro+ 5G",
    "RMX3820": "Realme GT Neo 5",
    "RMX3560": "Realme GT Neo 3",
}

VIVO_MAP = {
    "V2348": "Vivo V40 5G",
    "V2318": "Vivo V30 5G",
    "V2327": "Vivo Y28",
    "V2310": "Vivo Y17s",
    "V2334": "Vivo Y27s",
    "V2250": "Vivo V27 5G",
    "V2205": "Vivo V25 5G",
    "V2111": "Vivo Y21",
}

PIXEL_COLOR_MAP = {
    "obsidian": "Obsidian",
    "porcelain": "Porcelain White",
    "bay": "Bay Blue",
    "hazel": "Hazel",
    "rose": "Rose",
    "mint": "Mint",
    "snow": "Snow",
    "stormy_black": "Stormy Black",
    "kinda_coral": "Kinda Coral",
    "sorta_sunny": "Sorta Sunny",
    "clearly_white": "Clearly White",
    "just_black": "Just Black",
    "not_pink": "Not Pink",
    "oh_so_orange": "Oh So Orange",
    "lemongrass": "Lemongrass",
    "charcoal": "Charcoal",
}

SAMSUNG_COLOR_SUFFIXES = {
    "ZKG": "Black", "ZKA": "Black", "ZK": "Black", "BLK": "Black", "BK": "Black",
    "ZWG": "White", "ZWA": "White", "ZW": "White", "WHT": "White", "WH": "White",
    "ZGA": "Green", "ZGG": "Green", "ZG": "Green", "GRN": "Green", "GR": "Green",
    "ZVA": "Violet", "ZVG": "Violet", "ZV": "Violet", "VIO": "Violet",
    "ZBA": "Blue", "ZBB": "Blue", "ZB": "Blue", "BLU": "Blue",
    "ZDA": "Gold", "ZDG": "Gold", "ZD": "Gold", "YEL": "Gold",
    "ZTA": "Titanium Gray", "ZTG": "Titanium Gray", "ZT": "Titanium Gray", "GRY": "Titanium Gray",
    "ZSA": "Silver", "ZS": "Silver", "SLV": "Silver",
    "ZOA": "Orange", "ZO": "Orange", "ORG": "Orange",
    "DB": "Dark Blue",
}


def resolve_samsung_model(model_code: Optional[str]) -> Optional[str]:
    """Resolves Samsung model code (e.g. SM-S928B) to marketing name."""
    if not model_code or not isinstance(model_code, str):
        return None
    clean = model_code.strip().upper()
    for pattern, name in SAMSUNG_PREFIX_RULES:
        if re.match(pattern, clean):
            return name
    return None


def clean_device_marketing_name(name: Optional[str]) -> Tuple[str, Optional[str]]:
    """
    Cleans device model/marketing name by stripping trailing storage designations
    (e.g. 'Oppo Reno8 T 256GB' -> 'Oppo Reno8 T', extracted '256GB')
    so that the model field contains ONLY the clean device name.
    """
    if not name:
        return "", None
    clean = str(name).strip()
    storage_pattern = r'\b(\d{2,4}\s*(?:GB|TB|G|T))\b'
    m = re.search(storage_pattern, clean, re.IGNORECASE)
    extracted_storage = None
    if m:
        extracted_storage = m.group(1).upper().replace(" ", "")
        clean = re.sub(storage_pattern, "", clean, flags=re.IGNORECASE).strip()
        clean = re.sub(r'\s+', ' ', clean).strip(" -/,")
    return clean, extracted_storage


def resolve_marketing_name(
    model_code: Optional[str],
    manufacturer: Optional[str] = "Android",
    marketname: Optional[str] = ""
) -> Tuple[str, str]:
    """
    Resolves commercial brand and marketing name from model code, manufacturer, and marketname.
    Ensures marketing_name contains ONLY the clean device name without capacity/storage appended.
    Returns (brand, marketing_name).
    """
    clean_mfr = str(manufacturer).strip().title() if manufacturer else "Android"
    clean_model = str(model_code).strip() if model_code else ""
    clean_market = str(marketname).strip() if marketname else ""

    if clean_market and clean_market.lower() != clean_model.lower():
        resolved_brand = "Samsung" if "samsung" in clean_mfr.lower() else clean_mfr
        clean_mkt, _ = clean_device_marketing_name(clean_market)
        return resolved_brand, clean_mkt

    # Strip leading brand prefix if present (e.g. "HONOR NIC-LX2" -> "NIC-LX2", "OPPO CPH2819" -> "CPH2819")
    clean_upper = clean_model.upper()
    stripped_upper = clean_upper
    for pfx in ("HONOR ", "HUAWEI ", "OPPO ", "ONEPLUS ", "REALME ", "SAMSUNG ", "XIAOMI ", "REDMI ", "POCO ", "VIVO ", "GOOGLE "):
        if stripped_upper.startswith(pfx):
            stripped_upper = stripped_upper[len(pfx):].strip()
            break

    if clean_model.upper().startswith("SM-") or "samsung" in clean_mfr.lower() or stripped_upper.startswith("SM-"):
        lookup_s = stripped_upper if stripped_upper.startswith("SM-") else clean_model
        samsung_name = resolve_samsung_model(lookup_s)
        if samsung_name:
            clean_s, _ = clean_device_marketing_name(samsung_name)
            return "Samsung", clean_s
        return "Samsung", f"Samsung {lookup_s}" if lookup_s else "Samsung Galaxy"

    if clean_upper in XIAOMI_CODE_MAP or stripped_upper in XIAOMI_CODE_MAP:
        name = XIAOMI_CODE_MAP.get(clean_upper) or XIAOMI_CODE_MAP[stripped_upper]
        brand = "Redmi" if "Redmi" in name else ("POCO" if "POCO" in name else "Xiaomi")
        clean_n, _ = clean_device_marketing_name(name)
        return brand, clean_n

    if clean_upper in HONOR_HUAWEI_MAP or stripped_upper in HONOR_HUAWEI_MAP:
        name = HONOR_HUAWEI_MAP.get(clean_upper) or HONOR_HUAWEI_MAP[stripped_upper]
        brand = "Honor" if "Honor" in name else "Huawei"
        clean_n, _ = clean_device_marketing_name(name)
        return brand, clean_n

    if clean_upper in OPPO_ONEPLUS_MAP or stripped_upper in OPPO_ONEPLUS_MAP:
        name = OPPO_ONEPLUS_MAP.get(clean_upper) or OPPO_ONEPLUS_MAP[stripped_upper]
        brand = "OnePlus" if "OnePlus" in name else ("Realme" if "Realme" in name else "Oppo")
        clean_n, _ = clean_device_marketing_name(name)
        return brand, clean_n

    if clean_upper in REALME_MAP or stripped_upper in REALME_MAP:
        name = REALME_MAP.get(clean_upper) or REALME_MAP[stripped_upper]
        clean_n, _ = clean_device_marketing_name(name)
        return "Realme", clean_n

    if clean_upper in VIVO_MAP or stripped_upper in VIVO_MAP:
        name = VIVO_MAP.get(clean_upper) or VIVO_MAP[stripped_upper]
        clean_n, _ = clean_device_marketing_name(name)
        return "Vivo", clean_n

    # Check for prefix or partial match in maps
    for code, mkt in HONOR_HUAWEI_MAP.items():
        if stripped_upper.startswith(code) or code in stripped_upper or clean_upper.startswith(code) or code in clean_upper:
            brand = "Honor" if "Honor" in mkt else "Huawei"
            clean_n, _ = clean_device_marketing_name(mkt)
            return brand, clean_n

    for code, mkt in OPPO_ONEPLUS_MAP.items():
        if stripped_upper.startswith(code) or code in stripped_upper or clean_upper.startswith(code) or code in clean_upper:
            brand = "OnePlus" if "OnePlus" in mkt else "Oppo"
            clean_n, _ = clean_device_marketing_name(mkt)
            return brand, clean_n

    if stripped_upper.startswith("CPH") or clean_upper.startswith("CPH"):
        return "Oppo", f"Oppo {stripped_upper}"

    if stripped_upper.startswith("RMX") or clean_upper.startswith("RMX"):
        return "Realme", f"Realme {stripped_upper}"

    if stripped_upper.startswith("V2") or clean_upper.startswith("V2"):
        return "Vivo", f"Vivo {stripped_upper}"

    if "pixel" in clean_model.lower():
        clean_p, _ = clean_device_marketing_name(clean_model)
        return "Google", clean_p

    raw_mkt = f"{clean_mfr} {clean_model}".strip() if clean_model else clean_mfr
    clean_r, _ = clean_device_marketing_name(raw_mkt)
    return clean_mfr, clean_r


# ============================================================================
# Multi-OEM Color Resolver & Samsung Decoder
# ============================================================================

def decode_samsung_product_code(product_code: Optional[str]) -> Optional[str]:
    """
    Decodes Samsung ril.product_code 3-letter suffix to standard color.
    Supports unsuffixed product codes (e.g. SM-S928BZKG) and full carrier SKUs
    with 3-letter CSC (e.g. SM-S928BZKGEUX).
    """
    if not product_code or not isinstance(product_code, str):
        return None
    code = product_code.strip().upper()

    # 1. Direct suffix match (e.g. SM-S928BZKG)
    for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
        if code.endswith(suffix):
            return color

    # 2. Match before 3-letter CSC (e.g. SM-S928BZKGEUX -> strip last 3 chars EUX)
    if len(code) > 6:
        stem = code[:-3]
        for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
            if stem.endswith(suffix):
                return color

    # 3. Match embedded 3-letter variant token in middle
    for suffix, color in SAMSUNG_COLOR_SUFFIXES.items():
        if len(suffix) == 3 and suffix in code:
            return color

    return None


def resolve_oem_color_from_props(
    props: Optional[Dict[str, Any]],
    imei1: Optional[str] = None,
    model_code: Optional[str] = None,
    tac_lookup_fn: Optional[Callable[[str, str], Optional[str]]] = None
) -> str:
    """
    Comprehensive multi-OEM commercial color resolver:
    1. Direct vendor properties across Samsung, Oppo, OnePlus, Realme, Xiaomi, Vivo, Huawei.
    2. Intelligent keyword normalization (e.g. starry_black -> Black, global_gold -> Gold).
    3. Samsung product code decoding (ril.product_code / ro.ril.product_code).
    4. SQLite TAC memory fallback (first 8 digits of imei1 + model_code or TAC).
    5. Default fallback: 'Standard'.
    """
    COLOR_KEYWORDS = [
        ("black", "Black"),
        ("white", "White"),
        ("gold", "Gold"),
        ("silver", "Silver"),
        ("blue", "Blue"),
        ("green", "Green"),
        ("purple", "Purple"),
        ("violet", "Purple"),
        ("titanium", "Titanium"),
        ("gray", "Gray"),
        ("grey", "Gray"),
        ("red", "Red"),
        ("orange", "Orange"),
        ("pink", "Pink"),
        ("yellow", "Yellow"),
    ]

    if props:
        keys = [
            "ro.boot.hardware.color",
            "ro.boot.hwc",
            "ro.boot.hwcolor",
            "ro.product.SystemColor",
            "persist.sys.color",
            "persist.sys.oppo.color",
            "persist.sys.oplus.color",
            "ro.oppo.device.color",
            "ro.oplus.device.color",
            "ro.vendor.oplus.color",
            "ro.hw.phone.color",
            "ro.hw.devicecolor",
            "ro.vivo.hardware.color",
            "ro.boot.project_color",
            "ro.config.color",
            "ro.boot.color",
            "ro.color",
            "ro.device.color",
        ]

        for k in keys:
            val = props.get(k)
            if val is not None:
                clean_val = str(val).strip()
                if clean_val and clean_val.lower() not in ("unknown", "null", "none"):
                    if k == "ro.boot.hardware.color" and clean_val.lower() in PIXEL_COLOR_MAP:
                        return PIXEL_COLOR_MAP[clean_val.lower()]
                    
                    # Check if color is stored as ARGB or RGB hex (e.g. FFD3EAED or 0xFFD3EAED)
                    hex_clean = clean_val.lower().replace("0x", "").strip()
                    if len(hex_clean) == 8:
                        hex_clean = hex_clean[2:]  # Strip alpha
                    if len(hex_clean) == 6 and all(c in "0123456789abcdef" for c in hex_clean):
                        r = int(hex_clean[0:2], 16)
                        g = int(hex_clean[2:4], 16)
                        b = int(hex_clean[4:6], 16)
                        # Commercial color mapping from RGB
                        if r > 190 and g > 205 and b > 205:
                            return "Astro Silver / Sky Blue"
                        elif abs(r - g) < 18 and abs(g - b) < 18:
                            if r < 50: return "Black"
                            if r < 120: return "Dark Gray"
                            if r < 195: return "Titanium Gray"
                            if r < 240: return "Silver"
                            return "White"
                        elif r > g and r > b:
                            if g > 160 and b < 110: return "Gold"
                            return "Pink" if (g > 140 or b > 140) else "Red"
                        elif b > r and b > g:
                            return "Sky Blue" if (r > 150 and g > 180) else "Blue"
                        elif g > r and g > b:
                            return "Green"

                    # Normalize known raw color tokens with underscores (e.g. 'global_black' -> 'Black')
                    if "_" in clean_val:
                        for kw, canonical in COLOR_KEYWORDS:
                            if kw in clean_val.lower():
                                return canonical
                    return clean_val

        # Samsung product code decoding
        prod_code = props.get("ril.product_code") or props.get("ro.ril.product_code")
        if prod_code:
            decoded = decode_samsung_product_code(str(prod_code))
            if decoded:
                return decoded

    # SQLite TAC memory fallback
    if imei1:
        tac_digits = re.sub(r"\D", "", str(imei1))
        if len(tac_digits) >= 8:
            tac = tac_digits[:8]
            if tac_lookup_fn:
                learned = tac_lookup_fn(tac, str(model_code or ""))
                if learned:
                    return learned
            else:
                try:
                    from core.database import DatabaseManager
                    db = DatabaseManager()
                    if model_code:
                        learned = db.lookup_tac_color(tac, str(model_code))
                        if learned:
                            return learned
                    with db._lock:
                        conn = db._get_connection()
                        cur = conn.cursor()
                        cur.execute("SELECT color FROM tac_color_map WHERE tac = ? LIMIT 1;", (tac,))
                        row = cur.fetchone()
                        if row and row["color"]:
                            return row["color"]
                except Exception:
                    pass

    return "Standard"


# ============================================================================
# IMEI Parsing & Luhn Algorithm
# ============================================================================

def validate_luhn(imei: Optional[str]) -> bool:
    """
    Validates 15-digit IMEI with Luhn checksum algorithm (ITU-T E.118 / 3GPP TS 23.003).
    Rejects non-digits, incorrect lengths, and strings of 15 zeros.
    """
    if not imei or not isinstance(imei, str):
        return False
    digits = re.sub(r"\D", "", imei)
    if len(digits) != 15 or digits == "000000000000000":
        return False
    total = 0
    for i, char in enumerate(digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


validate_luhn_imei = validate_luhn


def parse_imei_from_service_call(parcel_output: Optional[str]) -> Optional[str]:
    """
    Extracts 15-digit Luhn-validated IMEI from 'service call iphonesubinfo' parcel dump.
    Dual-Strategy:
    Strategy A: Decodes ASCII text characters between single quotes.
    Strategy B: Binary 32-bit hex word unpacking of UTF-16 code units (for truncated dumps).
    """
    if not parcel_output or not isinstance(parcel_output, str):
        return None

    # Strategy A: Quoted character dump
    matches = re.findall(r"'([^']*)'", parcel_output)
    if matches:
        raw_chars = "".join(matches)
        digits = re.sub(r"\D", "", raw_chars)
        if len(digits) >= 15:
            for i in range(len(digits) - 14):
                candidate = digits[i:i + 15]
                if candidate != "000000000000000" and validate_luhn(candidate):
                    return candidate
            candidate = digits[:15]
            if candidate != "000000000000000" and validate_luhn(candidate):
                return candidate

    # Strategy B: Binary hex word unpacking
    hex_words = []
    for line in parcel_output.splitlines():
        line = line.strip()
        m = re.match(r'0x[0-9a-fA-F]{8}:\s+([0-9a-fA-F\s]+)', line)
        if m:
            words = m.group(1).split()
            for w in words:
                if re.match(r'^[0-9a-fA-F]{8}$', w):
                    hex_words.append(w)

    if len(hex_words) >= 3:
        try:
            length = int(hex_words[1], 16)
            if length >= 14:
                extracted_chars = []
                for word in hex_words[2:]:
                    val = int(word, 16)
                    char1 = chr(val & 0xFFFF)
                    char2 = chr((val >> 16) & 0xFFFF)
                    extracted_chars.extend([char1, char2])
                digits_b = "".join([c for c in extracted_chars if c.isdigit()])
                if len(digits_b) >= 15:
                    for i in range(len(digits_b) - 14):
                        candidate_b = digits_b[i:i + 15]
                        if candidate_b != "000000000000000" and validate_luhn(candidate_b):
                            return candidate_b
        except Exception:
            pass

    return None


OEM_IMEI_PROP_KEYS = [
    "ro.ril.oem.imei",
    "ro.ril.oem.imei1",
    "ro.ril.oem.imei2",
    "ril.IMEI",
    "ril.imei1",
    "ril.imei2",
    "persist.radio.imei",
    "persist.radio.imei1",
    "persist.radio.imei2",
    "ro.gsm.imei",
    "persist.sys.imei",
    "gsm.baseband.imei",
]


def extract_imei_from_properties(props: Dict[str, str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Extracts 15-digit Luhn-validated IMEI 1 and IMEI 2 from OEM system properties dictionary.
    """
    imei1: Optional[str] = None
    imei2: Optional[str] = None

    for prop_key in OEM_IMEI_PROP_KEYS:
        val = props.get(prop_key, "")
        if not val:
            continue
        tokens = re.split(r'[,;\s|]+', val.strip())
        for token in tokens:
            cleaned = re.sub(r"\D", "", token)
            if len(cleaned) == 15 and validate_luhn(cleaned):
                if not imei1:
                    imei1 = cleaned
                elif cleaned != imei1 and not imei2:
                    imei2 = cleaned
                    return imei1, imei2

    return imei1, imei2


def extract_imei_from_fastboot(serial: str, fastboot_path: str) -> Tuple[str, Optional[str]]:
    """
    Queries fastboot getvar imei, imei1, imei2, and getvar all to extract Luhn-verified IMEIs.
    Returns (imei1, imei2).
    """
    imei1 = ""
    imei2: Optional[str] = None

    # 1. fastboot getvar imei
    _, out_imei, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei"], timeout=2.0)
    matches = re.findall(r'(\d{15})', out_imei)
    for m in matches:
        if validate_luhn(m):
            imei1 = m
            break

    # 2. fastboot getvar imei1
    if not imei1:
        _, out_imei1, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei1"], timeout=2.0)
        matches1 = re.findall(r'(\d{15})', out_imei1)
        for m in matches1:
            if validate_luhn(m):
                imei1 = m
                break

    # 3. fastboot getvar imei2
    _, out_imei2, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "imei2"], timeout=2.0)
    matches2 = re.findall(r'(\d{15})', out_imei2)
    for m in matches2:
        if validate_luhn(m) and m != imei1:
            imei2 = m
            break

    # 4. Fallback: fastboot getvar all
    if not imei1:
        _, out_all, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "all"], timeout=3.0)
        all_matches = re.findall(r'imei[12]?:\s*(\d{15})', out_all, re.IGNORECASE)
        valid_candidates = [c for c in all_matches if validate_luhn(c)]
        if valid_candidates:
            imei1 = valid_candidates[0]
            if len(valid_candidates) > 1 and valid_candidates[1] != imei1:
                imei2 = valid_candidates[1]

    if not imei1:
        imei1 = "Fastboot (Scan Barcode)"

    return imei1, imei2


# ============================================================================
# Battery, Bootloader & Fastboot Parsers
# ============================================================================

def parse_battery_info(dumpsys_battery_output: Optional[str]) -> Tuple[int, Optional[int], Optional[int]]:
    """
    Parses 'adb shell dumpsys battery'.
    Returns (level_percentage, health_percentage_or_none, cycle_count_or_none).
    """
    if not dumpsys_battery_output or not isinstance(dumpsys_battery_output, str):
        return 0, None, None

    clean = sanitize_adb_output(dumpsys_battery_output)
    if not clean:
        return 0, None, None

    level = 0
    scale = 100
    health_code: Optional[int] = None
    cycle_count = None
    asoc = None

    for line in clean.splitlines():
        line = line.strip()
        if line.lower().startswith("level:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().lstrip("-").isdigit():
                level = max(0, int(parts[1].strip()))
        elif line.lower().startswith("scale:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                scale = max(1, int(parts[1].strip()))
        elif line.lower().startswith("health:"):
            parts = line.split(":")
            if len(parts) > 1 and parts[1].strip().isdigit():
                health_code = int(parts[1].strip())
        elif "cycle_count" in line.lower() or "msavedbatteryusage" in line.lower():
            match = re.search(r':\s*(\d+)', line)
            if match:
                cycle_count = int(match.group(1))
        elif "msavedbatteryasoc" in line.lower():
            match = re.search(r':\s*(\d+)', line)
            if match:
                asoc = int(match.group(1))

    calc_level = int((level * 100) / scale) if scale > 0 else level
    calc_level = max(0, min(100, calc_level))

    if asoc is not None:
        health_pct = max(0, min(100, asoc))
    elif health_code is not None:
        health_pct = 95 if health_code == 2 else 70
    else:
        health_pct = None

    return calc_level, health_pct, cycle_count


def parse_bootloader_status(flash_locked: str, verified_boot_state: str) -> Optional[bool]:
    """
    Parses ro.boot.flash.locked and ro.boot.verifiedbootstate.
    Returns True for locked, False for unlocked, None if undetermined.
    """
    fl = (flash_locked or "").strip().lower()
    vbs = (verified_boot_state or "").strip().lower()

    if fl in ("1", "true", "locked"):
        return True
    if fl in ("0", "false", "unlocked"):
        return False

    if vbs == "green":
        return True
    if vbs in ("orange", "yellow", "red"):
        return False

    return None


def parse_fastboot_devices(output: str) -> List[str]:
    """Parses 'fastboot devices' output, returning list of serial numbers."""
    serials = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1].lower() == "fastboot":
            serials.append(parts[0])
    return serials


def extract_fastboot_specs(serial: str, fastboot_path: str) -> DeviceSpecs:
    """Queries fastboot getvar to construct DeviceSpecs."""
    _, out_prod, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "product"])
    _, out_lock, _ = run_cmd([fastboot_path, "-s", serial, "getvar", "unlocked"])

    product_match = re.search(r'product:\s*(\S+)', out_prod, re.IGNORECASE)
    product = product_match.group(1) if product_match else "Fastboot Device"

    unlocked_match = re.search(r'unlocked:\s*(\S+)', out_lock, re.IGNORECASE)
    is_unlocked = unlocked_match.group(1).lower() in ("yes", "true", "1") if unlocked_match else False

    imei1, imei2 = extract_imei_from_fastboot(serial, fastboot_path)

    return DeviceSpecs(
        connection_type="fastboot",
        device_id=serial,
        brand="Android (Fastboot)",
        marketing_name=f"{product.title()} (Fastboot)",
        model_code=product,
        storage="N/A (Fastboot)",
        ram="N/A (Fastboot)",
        color="Unknown",
        os_version="Fastboot Mode",
        serial_number=serial,
        imei1=imei1,
        imei2=imei2,
        battery_health=None,
        battery_cycles=None,
        sales_region=None,
        bootloader_locked=(not is_unlocked),
        condition_grade="A",
        remarks="Device detected in Fastboot/Bootloader mode",
        raw_properties={"product": product, "unlocked": is_unlocked}
    )


# ============================================================================
# AdbReader Background Polling Class
# ============================================================================

class AdbReader:
    """
    Asynchronous Android and Fastboot extraction engine.
    Integrates portable ADB Key Vault and non-blocking background polling.
    """
    def __init__(
        self,
        adb_path: Optional[str] = None,
        fastboot_path: Optional[str] = None,
        base_dir: Optional[Path] = None
    ):
        self.base_dir = base_dir
        self.adb_keys_dir = get_adb_keys_dir(self.base_dir)
        self.adb_env = setup_adb_environment(self.base_dir)
        ensure_keypair_exists(self.adb_keys_dir)

        self.adb_path = adb_path or get_binary_path("adb")
        self.fastboot_path = fastboot_path or get_binary_path("fastboot")
        self._stop_event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None
        self._last_device_id: Optional[str] = None
        # Ensure ADB server is running with persistent key environment
        self.ensure_server()

    def ensure_server(self):
        """Starts ADB server daemon if not running."""
        try:
            run_cmd([self.adb_path, "start-server"], env=self.adb_env, timeout=5.0)
        except Exception as e:
            logger.debug(f"ensure_server failed: {e}")
        self._last_connection_type: str = "none"

        # Unified callback interface
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[str], None]] = None

    def start_polling(self, interval: float = 2.0) -> None:
        """Starts background polling thread on specified interval."""
        if self._poll_thread and self._poll_thread.is_alive():
            return
        self._stop_event.clear()
        self._poll_thread = threading.Thread(
            target=self._polling_loop,
            args=(interval,),
            name="AdbPollingThread",
            daemon=True
        )
        self._poll_thread.start()

    def stop_polling(self) -> None:
        """Signals background thread to stop and waits for join."""
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=2.5)
            self._poll_thread = None

    def _polling_loop(self, interval: float) -> None:
        while not self._stop_event.is_set():
            try:
                specs = self.poll_once()
                current_id = specs.device_id if specs else None
                current_type = specs.connection_type if specs else "none"

                if current_id != self._last_device_id:
                    self._last_device_id = current_id
                    self._last_connection_type = current_type

                    if specs and specs.connection_type != "none":
                        if self.on_status_changed:
                            self.on_status_changed(specs.connection_type)
                        if self.on_device_connected:
                            self.on_device_connected(specs)
                    else:
                        if self.on_status_changed:
                            self.on_status_changed("none")
                        if self.on_device_disconnected:
                            self.on_device_disconnected()
            except Exception as e:
                logger.debug(f"AdbReader poll loop error: {e}")

            self._stop_event.wait(interval)

    def poll_once(self) -> Optional[DeviceSpecs]:
        """Performs a single synchronous detection check for ADB or Fastboot."""
        # 1. Check ADB devices
        ret, out, _ = run_cmd([self.adb_path, "devices", "-l"], timeout=2.0, env=self.adb_env)
        clean = sanitize_adb_output(out)
        for line in clean.splitlines():
            line = line.strip()
            if not line or line.startswith("List of devices"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                serial = parts[0]
                state = parts[1].lower()
                if state == "device":
                    return self.extract_adb_device(serial)
                elif state == "unauthorized":
                    # Device attached but RSA authorization pending on phone screen
                    model_code = ""
                    for p in parts[2:]:
                        if p.startswith("model:"):
                            model_code = p.split(":", 1)[1]
                        elif p.startswith("product:") and not model_code:
                            model_code = p.split(":", 1)[1]
                    if not model_code:
                        model_code = "Android"

                    brand, mkt = resolve_marketing_name(model_code)

                    # Trigger the authorization popup on the phone screen
                    try:
                        run_cmd([self.adb_path, "-s", serial, "shell", "echo", "ping"], timeout=0.6, env=self.adb_env)
                    except Exception:
                        pass

                    return DeviceSpecs(
                        connection_type="unauthorized",
                        device_id=serial,
                        brand=brand,
                        marketing_name=mkt,
                        model_code=model_code,
                        storage="Tap 'Allow' on Screen",
                        ram="",
                        color="Default",
                        os_version="Unauthorized - Check Phone Screen",
                        serial_number=serial,
                        imei1="",
                        remarks="⚠️ يرجى الضغط على 'سماح دائماً' على شاشة الهاتف"
                    )
                elif state == "offline":
                    return DeviceSpecs(
                        connection_type="offline",
                        device_id=serial,
                        brand="Android",
                        marketing_name="Android (Offline)",
                        model_code="Offline",
                        storage="",
                        ram="",
                        color="",
                        os_version="Offline - Check USB Cable",
                        serial_number=serial,
                        imei1="",
                        remarks="⚠️ أعد توصيل كابل USB"
                    )

        # 2. Check Fastboot devices
        ret_fb, out_fb, _ = run_cmd([self.fastboot_path, "devices"], timeout=2.0, env=self.adb_env)
        fb_serials = parse_fastboot_devices(out_fb)
        if fb_serials:
            return extract_fastboot_specs(fb_serials[0], self.fastboot_path)

        return None

    def extract_adb_device(self, serial: str) -> DeviceSpecs:
        """Queries ADB telemetry from connected device and constructs DeviceSpecs."""
        # Query getprop properties
        _, getprop_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "getprop"], timeout=3.0, env=self.adb_env)
        props: Dict[str, str] = {}
        for line in getprop_out.splitlines():
            m = re.match(r'\[([^\]]+)\]:\s*\[([^\]]*)\]', line.strip())
            if m:
                props[m.group(1)] = m.group(2)

        model_code = props.get("ro.product.model", serial)
        manufacturer = props.get("ro.product.manufacturer", "Android")
        marketname = (
            props.get("ro.product.marketname") or
            props.get("ro.oppo.market.name") or
            props.get("ro.vendor.oplus.market.name") or
            props.get("ro.config.marketing_name") or
            props.get("ro.honor.product.marketname") or
            props.get("ro.huawei.product.marketname") or
            props.get("ro.product.product.marketname") or
            props.get("ro.product.vendor.marketname") or
            props.get("ro.product.odm.marketname") or
            props.get("ro.semc.product.name") or
            ""
        )
        brand, marketing_name = resolve_marketing_name(model_code, manufacturer, marketname)

        # Storage
        _, df_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "df", "-k", "/data"], timeout=2.5, env=self.adb_env)
        storage = parse_storage_from_df(df_out)
        if storage == "Unknown":
            _, df_emu, _ = run_cmd([self.adb_path, "-s", serial, "shell", "df", "-k", "/storage/emulated"], timeout=2.0, env=self.adb_env)
            storage = parse_storage_from_df(df_emu)
        if storage == "Unknown":
            _, df_all, _ = run_cmd([self.adb_path, "-s", serial, "shell", "df"], timeout=2.0, env=self.adb_env)
            storage = parse_storage_from_df(df_all)
        if storage == "Unknown":
            _, blk_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "cat /sys/block/sda/size /sys/block/mmcblk0/size 2>/dev/null"], timeout=1.5, env=self.adb_env)
            for blk_line in blk_out.splitlines():
                if blk_line.strip().isdigit():
                    blocks = int(blk_line.strip())
                    bytes_val = blocks * 512
                    gb = bytes_val / (1024 * 1024 * 1024)
                    if gb > 8:
                        storage = parse_android_commercial_storage(bytes_val // 1024)
                        break
        if storage == "Unknown":
            _, ds_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "dumpsys", "diskstats"], timeout=2.0, env=self.adb_env)
            m_ds = re.search(r'Total-size:\s*(\d+)', ds_out, re.IGNORECASE)
            if m_ds:
                storage = parse_android_commercial_storage(int(m_ds.group(1)) // 1024)

        # RAM
        _, meminfo_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "cat", "/proc/meminfo"], timeout=2.0, env=self.adb_env)
        ram = parse_ram_from_meminfo(meminfo_out)

        # Battery
        _, battery_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "dumpsys", "battery"], timeout=2.0, env=self.adb_env)
        battery_level, battery_health, battery_cycles = parse_battery_info(battery_out)

        # Bootloader
        flash_locked = props.get("ro.boot.flash.locked", "")
        verified_boot = props.get("ro.boot.verifiedbootstate", "")
        bootloader_locked = parse_bootloader_status(flash_locked, verified_boot)

        # --------------------------------------------------------------------
        # Multi-Layer IMEI Extraction Ladder
        # --------------------------------------------------------------------
        imei1 = ""
        imei2: Optional[str] = None

        # Layer 1: Parcel Bypass with com.android.shell token
        _, parcel1, _ = run_cmd(
            [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "1", "s16", "com.android.shell"],
            timeout=2.0,
            env=self.adb_env
        )
        candidate1 = parse_imei_from_service_call(parcel1)

        # Fallback without token for older Android 6-9
        if not candidate1:
            _, parcel1_leg, _ = run_cmd(
                [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", "1"],
                timeout=2.0,
                env=self.adb_env
            )
            candidate1 = parse_imei_from_service_call(parcel1_leg)

        if candidate1:
            imei1 = candidate1
            # Query secondary SIM for Dual-SIM devices (transaction indices 3, 4, 2)
            for idx in ["3", "4", "2"]:
                _, parcel2, _ = run_cmd(
                    [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", idx, "s16", "com.android.shell"],
                    timeout=2.0,
                    env=self.adb_env
                )
                candidate2 = parse_imei_from_service_call(parcel2)
                if not candidate2:
                    _, parcel2_leg, _ = run_cmd(
                        [self.adb_path, "-s", serial, "shell", "service", "call", "iphonesubinfo", idx],
                        timeout=2.0,
                        env=self.adb_env
                    )
                    candidate2 = parse_imei_from_service_call(parcel2_leg)
                if candidate2 and candidate2 != candidate1:
                    imei2 = candidate2
                    break

        # Fallback: dumpsys iphonesubinfo
        if not imei1:
            _, subinfo_out, _ = run_cmd([self.adb_path, "-s", serial, "shell", "dumpsys", "iphonesubinfo"], timeout=2.0, env=self.adb_env)
            imei_matches = re.findall(r'(?:Device\s*ID|IMEI(?:\s*\[?\d+\]?)?)\s*[:=]\s*(\d{15})', subinfo_out, re.IGNORECASE)
            valid_subinfo = [m for m in imei_matches if validate_luhn(m)]
            if valid_subinfo:
                imei1 = valid_subinfo[0]
                if len(valid_subinfo) > 1 and valid_subinfo[1] != imei1:
                    imei2 = valid_subinfo[1]

        # Layer 2: OEM Property Matrix Fallback
        if not imei1:
            prop_imei1, prop_imei2 = extract_imei_from_properties(props)
            if prop_imei1:
                imei1 = prop_imei1
                if prop_imei2:
                    imei2 = prop_imei2

        if not imei1:
            imei1 = "Restricted (Scan Barcode)"

        # --------------------------------------------------------------------
        # Multi-OEM Color Resolver
        # --------------------------------------------------------------------
        color = resolve_oem_color_from_props(props, imei1=imei1, model_code=model_code)
        if color == "Unknown":
            color = props.get("ro.boot.hardware.color", "Standard")
            if color == "Unknown":
                color = "Standard"

        os_ver = f"Android {props.get('ro.build.version.release', '')}".strip()
        serial_no = props.get("ro.serialno") or props.get("ro.boot.serialno") or serial

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=marketing_name,
            model_code=model_code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial_no,
            imei1=imei1,
            imei2=imei2,
            battery_health=None,  # Android does not provide standard battery health %; omitted to avoid customer confusion
            battery_cycles=battery_cycles,
            sales_region=props.get("ro.csc.sales_code") or None,
            bootloader_locked=bootloader_locked,
            condition_grade="A+",
            remarks="",
            raw_properties=props
        )
