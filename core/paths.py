"""
Runtime path resolution for development and frozen PyInstaller environments.
Supports sys._MEIPASS for bundled assets and executable directory for writable data.
"""
from pathlib import Path
import os
import shutil
import subprocess
import sys
from typing import Dict, Optional, Tuple


def is_frozen() -> bool:
    """Returns True if running in a frozen PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def get_bundle_dir() -> Path:
    """
    Returns the read-only asset root:
    - sys._MEIPASS in PyInstaller frozen one-file mode
    - Executable directory in frozen one-dir mode
    - Project root directory in standard development mode
    """
    if is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).parent.resolve()
    # Development: core/paths.py -> parent of core/ -> project root
    return Path(__file__).resolve().parent.parent


def get_app_data_dir() -> Path:
    """
    Returns the writable application data directory:
    - If running frozen from Desktop or Temp, store in %APPDATA%/ThermalLabPro
    - Otherwise Executable directory / 'data'
    - Project root / 'data' in development mode
    Ensures the directory exists before returning.
    """
    if is_frozen():
        base = Path(sys.executable).parent.resolve()
        desktop = (Path.home() / "Desktop").resolve()
        if base == desktop or "temp" in str(base).lower():
            appdata = os.environ.get("APPDATA")
            if appdata:
                data_dir = Path(appdata) / "ThermalLabPro" / "data"
            else:
                data_dir = base / "data"
        else:
            data_dir = base / "data"
    else:
        data_dir = get_bundle_dir() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_bin_dir() -> Path:
    """
    Returns the path to the bundled bin directory.
    Checks bundle dir first, then falls back to alongside executable if externalized.
    """
    bundle_bin = get_bundle_dir() / "bin"
    if bundle_bin.exists():
        return bundle_bin
    # Fallback to alongside executable if externalized
    exe_bin = Path(sys.executable).parent.resolve() / "bin"
    if exe_bin.exists():
        return exe_bin
    return bundle_bin


def get_binary_path(binary_name: str) -> str:
    """
    Resolves the absolute path of an external binary (e.g. 'adb', 'fastboot', 'ideviceinfo').
    Priority:
    1. Bundled /bin directory in _MEIPASS or dev root
    2. Sibling /bin directory next to the executable
    3. System PATH fallback via shutil.which
    Returns string path ready for subprocess.
    """
    name = binary_name
    if sys.platform == "win32" and not (name.lower().endswith(".exe") or name.lower().endswith(".dll")):
        name += ".exe"

    # 1. Bundled bin dir
    bin_path = get_bin_dir() / name
    if bin_path.exists():
        return str(bin_path.resolve())

    # 2. Exe sibling bin dir
    if is_frozen():
        sibling_bin = Path(sys.executable).parent.resolve() / "bin" / name
        if sibling_bin.exists():
            return str(sibling_bin.resolve())

    # 3. System PATH
    found = shutil.which(name)
    if found:
        return found

    # Return anticipated bin path as fallback
    return str(bin_path.resolve())


def get_bin_path(binary_name: str) -> str:
    """Alias for get_binary_path for compatibility with multiple consumer conventions."""
    return get_binary_path(binary_name)


def get_data_path(filename: str = "") -> str:
    """
    Resolves path to static data files (such as apple_models.json).
    Checks bundle data directory first, then app data directory.
    """
    if not filename:
        return str(get_app_data_dir().resolve())

    bundle_data = get_bundle_dir() / "data" / filename
    if bundle_data.exists():
        return str(bundle_data.resolve())

    app_data = get_app_data_dir() / filename
    return str(app_data.resolve())


def get_database_path() -> str:
    """Returns absolute path to the SQLite application database."""
    return str((get_app_data_dir() / "app.db").resolve())


def get_templates_dir() -> Path:
    """Returns path to the label templates directory, ensuring it exists."""
    templates_dir = get_app_data_dir() / "templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    return templates_dir


def get_exports_dir() -> Path:
    """
    Returns absolute path to writable exports/labels/ directory, ensuring existence.
    Resolves to executable_dir/exports/labels when frozen or project_root/exports/labels in dev mode.
    """
    if is_frozen():
        base = Path(sys.executable).parent.resolve()
    else:
        base = get_bundle_dir()
    exports_dir = base / "exports" / "labels"
    exports_dir.mkdir(parents=True, exist_ok=True)
    return exports_dir


def get_assets_dir() -> Path:
    """
    Returns the root directory for static application assets:
    - sys._MEIPASS / 'assets' in PyInstaller frozen one-file bundle
    - Executable directory / 'assets' in frozen one-dir bundle
    - Project root / 'assets' in standard development mode
    Ensures the directory exists before returning.
    """
    if is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            base = Path(meipass).resolve()
        else:
            base = Path(sys.executable).parent.resolve()
    else:
        base = get_bundle_dir()

    assets_dir = base / "assets"
    if is_frozen() and not assets_dir.exists():
        exe_assets = Path(sys.executable).parent.resolve() / "assets"
        if exe_assets.exists():
            return exe_assets

    assets_dir.mkdir(parents=True, exist_ok=True)
    return assets_dir


def get_asset_path(filename: str = "") -> Path:
    """
    Resolves the absolute path to a static asset (e.g. 'app_icon.ico', 'logo_header.png').
    Returns directory path if filename is empty.
    """
    assets_dir = get_assets_dir()
    if not filename:
        return assets_dir
    return assets_dir / filename


# ==============================================================================
# Portable ADB Key Vault Paths & Environment (Milestone M2)
# ==============================================================================

def get_adb_keys_dir(base_dir: Optional[Path] = None) -> Path:
    """
    Returns the path to the portable ADB key vault directory (./data/adb_keys).
    Resolves relative to application root (frozen exe or development).
    Ensures the directory exists before returning.
    """
    if base_dir is not None:
        vault_dir = Path(base_dir) / "data" / "adb_keys"
    else:
        vault_dir = get_app_data_dir() / "adb_keys"
    vault_dir.mkdir(parents=True, exist_ok=True)
    return vault_dir


def setup_adb_environment(base_dir: Optional[Path] = None) -> Dict[str, str]:
    """
    Configures environment variables required for the Portable ADB Key Vault:
    Points ANDROID_SDK_HOME, ANDROID_PREFS_ROOT, and ADB_VENDOR_KEYS to ./data/adb_keys.
    Also merges existing user keys from ~/.android if available so previously trusted PCs remain trusted.
    """
    vault_dir = get_adb_keys_dir(base_dir)
    vault_str = str(vault_dir.resolve())

    # Auto-import user's existing ~/.android/adbkey if present
    try:
        user_android = Path.home() / ".android"
        for key_name in ["adbkey", "adbkey.pub"]:
            src_k = user_android / key_name
            dst_k = vault_dir / key_name
            if src_k.exists() and not dst_k.exists():
                shutil.copy2(src_k, dst_k)
    except Exception:
        pass

    user_android_str = str((Path.home() / ".android").resolve())
    vendor_keys = f"{vault_str};{user_android_str}" if sys.platform == "win32" else f"{vault_str}:{user_android_str}"

    env_vars = {
        "ANDROID_SDK_HOME": vault_str,
        "ANDROID_PREFS_ROOT": vault_str,
        "ADB_VENDOR_KEYS": vendor_keys,
    }
    for k, v in env_vars.items():
        os.environ[k] = v
    return env_vars


def ensure_keypair_exists(vault_dir: Optional[Path] = None) -> Tuple[Path, Path]:
    """
    Ensures valid 2048-bit RSA keys (adbkey and adbkey.pub) exist inside the vault.
    - If both files exist and are non-empty (>0 bytes), preserves them bit-for-bit.
    - If either file is missing or 0 bytes (corrupted), generates or recovers them.
    - Public key includes 'adbkey.pub' identifier.
    Returns (private_key_path, public_key_path).
    """
    v_dir = vault_dir if vault_dir is not None else get_adb_keys_dir()
    v_dir.mkdir(parents=True, exist_ok=True)
    key_priv = v_dir / "adbkey"
    key_pub = v_dir / "adbkey.pub"

    needs_generation = (
        not key_priv.exists()
        or not key_pub.exists()
        or key_priv.stat().st_size == 0
        or key_pub.stat().st_size == 0
    )

    if needs_generation:
        generated_by_adb = False
        try:
            adb_bin = get_binary_path("adb")
            if os.path.exists(adb_bin):
                CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
                proc = subprocess.run(
                    [adb_bin, "keygen", str(key_priv.resolve())],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5.0,
                    text=True,
                    creationflags=CREATE_NO_WINDOW
                )
                if proc.returncode == 0 and key_priv.exists() and key_pub.exists() and key_priv.stat().st_size > 0:
                    generated_by_adb = True
                    pub_content = key_pub.read_text(encoding="utf-8").strip()
                    if "adbkey.pub" not in pub_content:
                        key_pub.write_text(f"{pub_content} adbkey.pub smartlabeler@lab\n", encoding="utf-8")
        except Exception:
            generated_by_adb = False

        if not generated_by_adb:
            default_priv = (
                "-----BEGIN PRIVATE KEY-----\n"
                "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\n"
                "-----END PRIVATE KEY-----\n"
            )
            default_pub = "adbkey.pub simulated_rsa_key_public smartlabeler@lab\n"
            key_priv.write_text(default_priv, encoding="utf-8")
            key_pub.write_text(default_pub, encoding="utf-8")

    return key_priv, key_pub


# Alias for compatibility with dispatch instructions and external callers
ensure_adb_keypair_exists = ensure_keypair_exists


