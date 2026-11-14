"""
core/licensing/machine_id.py — Privacy-Preserving Hardware Device Fingerprinting
Generates stable, unique installation IDs for Windows and fallback OS environments.
"""
import os
import sys
import uuid
import hashlib
import platform
import logging
from pathlib import Path
from typing import Dict, Any

from core.paths import get_app_data_dir

logger = logging.getLogger("thermal_lab.licensing.machine_id")

APP_DEVICE_SALT = "ThermalLabPro-Commercial-Hardware-Salt-2026-v1"


def get_system_uuid_fallback() -> str:
    """Reads or generates a persistent installation UUID saved in app data."""
    id_file = get_app_data_dir() / ".device_identity"
    if not id_file.exists():
        alt = Path(__file__).resolve().parent.parent.parent / "data" / ".device_identity"
        if alt.exists():
            try:
                import shutil
                shutil.copy2(alt, id_file)
            except Exception:
                pass
    if id_file.exists():
        try:
            stored = id_file.read_text(encoding="utf-8").strip()
            if stored and len(stored) >= 16:
                return stored
        except Exception as e:
            logger.debug("Failed reading device_identity file: %s", e)

    # Generate fresh persistent UUID
    new_uuid = str(uuid.uuid4()).upper()
    try:
        id_file.write_text(new_uuid, encoding="utf-8")
    except Exception as e:
        logger.warning("Could not persist device_identity: %s", e)
    return new_uuid


def get_windows_machine_guid() -> str:
    """Reads Windows MachineGuid from HKEY_LOCAL_MACHINE registry."""
    if sys.platform != "win32":
        return "NON_WINDOWS"
    try:
        import winreg
        key_path = r"SOFTWARE\Microsoft\Cryptography"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
            val, _ = winreg.QueryValueEx(key, "MachineGuid")
            if val:
                return str(val).strip()
    except Exception as e:
        logger.debug("Could not read Windows MachineGuid from 64-bit registry: %s", e)

    # Try 32-bit registry
    try:
        import winreg
        key_path = r"SOFTWARE\Microsoft\Cryptography"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_READ) as key:
            val, _ = winreg.QueryValueEx(key, "MachineGuid")
            if val:
                return str(val).strip()
    except Exception as e:
        logger.debug("Could not read Windows MachineGuid from 32-bit registry: %s", e)

    return ""


def get_processor_info() -> str:
    """Extracts basic CPU architecture and processor string."""
    try:
        return f"{platform.processor()}-{platform.machine()}"
    except Exception:
        return "UNKNOWN_CPU"


def get_installation_id() -> str:
    """
    Computes a deterministic, privacy-preserving SHA-256 installation ID.
    Format: TLP-XXXX-XXXX-XXXX-XXXX-XXXX (20 hex characters formatted in 5 blocks)
    """
    guid = get_windows_machine_guid()
    fallback_uuid = get_system_uuid_fallback()
    cpu_info = get_processor_info()

    raw_material = f"{guid}:{fallback_uuid}:{cpu_info}:{APP_DEVICE_SALT}".encode("utf-8")
    sha = hashlib.sha256(raw_material).hexdigest().upper()

    # Create formatted chunk: TLP-ABCD-EF01-2345-6789-ABCD
    chunk = sha[:20]
    formatted = f"TLP-{chunk[0:4]}-{chunk[4:8]}-{chunk[8:12]}-{chunk[12:16]}-{chunk[16:20]}"
    return formatted


def get_device_metadata() -> Dict[str, Any]:
    """Returns safe, non-invasive device metadata for registration/activation."""
    return {
        "device_id": get_installation_id(),
        "hostname": platform.node(),
        "os_name": platform.system(),
        "os_version": platform.version(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "processor": get_processor_info(),
        "python_version": platform.python_version()
    }
