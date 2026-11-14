"""
core/shortcut_util.py — Programmatic Windows Desktop Shortcut Creator.
Features:
- 5-tier cascading Windows Desktop path resolution (Shell API, Registry, OneDrive, Profile, Fallback).
- Dual-engine shortcut creation: Headless PowerShell WScript.Shell COM + win32com.client fallback.
- Auto-detection of frozen PyInstaller vs. development python main.py environment.
- Icon location binding to assets/app_icon.ico with fallback to target_exe.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
import subprocess
import sys
from typing import Optional, Union

from core.paths import get_bundle_dir, get_asset_path, is_frozen

logger = logging.getLogger(__name__)


def get_desktop_dir() -> Path:
    """
    Resolves the user's active Windows Desktop directory using a 5-tier fallback cascade:
    1. Windows Shell API SHGetFolderPathW (CSIDL_DESKTOPDIRECTORY = 0x0010)
    2. Windows Registry HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders -> Desktop
    3. %USERPROFILE%\\OneDrive\\Desktop (OneDrive Known Folder Move)
    4. %USERPROFILE%\\Desktop
    5. Path.home() / 'Desktop'
    """
    # Tier 1: Windows Shell API via ctypes
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            buf = ctypes.create_unicode_buffer(wintypes.MAX_PATH)
            CSIDL_DESKTOPDIRECTORY = 0x0010
            # S_OK = 0
            if ctypes.windll.shell32.SHGetFolderPathW(None, CSIDL_DESKTOPDIRECTORY, None, 0, buf) == 0:
                p = Path(buf.value).resolve()
                if p.exists() and p.is_dir():
                    return p
        except Exception as e:
            logger.debug("SHGetFolderPathW desktop resolution failed: %s", e)

    # Tier 2: Windows Registry
    if sys.platform == "win32":
        try:
            import winreg
            reg_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, reg_path) as key:
                val, _ = winreg.QueryValueEx(key, "Desktop")
                expanded = os.path.expandvars(val)
                p = Path(expanded).resolve()
                if p.exists() and p.is_dir():
                    return p
        except Exception as e:
            logger.debug("Registry desktop resolution failed: %s", e)

    # Tier 3 & 4: UserProfile environment inspection (OneDrive & Standard)
    userprofile = os.environ.get("USERPROFILE")
    if userprofile:
        onedrive_desktop = Path(userprofile) / "OneDrive" / "Desktop"
        if onedrive_desktop.exists() and onedrive_desktop.is_dir():
            return onedrive_desktop.resolve()

        standard_desktop = Path(userprofile) / "Desktop"
        if standard_desktop.exists() and standard_desktop.is_dir():
            return standard_desktop.resolve()

    # Tier 5: Path.home() fallback
    fallback = Path.home() / "Desktop"
    if fallback.exists() and fallback.is_dir():
        return fallback.resolve()

    return Path(os.path.expanduser("~/Desktop")).resolve()


def _create_via_powershell(
    lnk_path: Path,
    target_exe: Path,
    working_dir: Path,
    icon_path: Optional[Path],
    description: str,
    arguments: str,
) -> bool:
    """Creates a shortcut via headless PowerShell WScript.Shell COM execution."""
    lnk_str = str(lnk_path).replace("'", "''")
    target_str = str(target_exe).replace("'", "''")
    work_str = str(working_dir).replace("'", "''")
    desc_str = description.replace("'", "''")
    args_str = arguments.replace("'", "''")

    icon_line = ""
    if icon_path and icon_path.exists():
        icon_str = str(icon_path).replace("'", "''")
        icon_line = f"$Shortcut.IconLocation = '{icon_str},0'"

    args_line = ""
    if args_str:
        args_line = f"$Shortcut.Arguments = '{args_str}'"

    ps_script = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{lnk_str}')
$Shortcut.TargetPath = '{target_str}'
$Shortcut.WorkingDirectory = '{work_str}'
{args_line}
{icon_line}
$Shortcut.Description = '{desc_str}'
$Shortcut.Save()
"""
    try:
        CREATE_NO_WINDOW = 0x08000000
        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            timeout=10,
        )
        if res.returncode == 0 and lnk_path.exists() and lnk_path.stat().st_size > 0:
            logger.info("Successfully created desktop shortcut via PowerShell: %s", lnk_path)
            return True
        logger.warning("PowerShell shortcut script failed with return code %d: %s", res.returncode, res.stderr)
    except Exception as e:
        logger.warning("PowerShell shortcut execution error: %s", e)

    return False


def _create_via_win32com(
    lnk_path: Path,
    target_exe: Path,
    working_dir: Path,
    icon_path: Optional[Path],
    description: str,
    arguments: str,
) -> bool:
    """Creates a shortcut via in-process win32com.client Dispatch."""
    try:
        import win32com.client
        wsh = win32com.client.Dispatch("WScript.Shell")
        sc = wsh.CreateShortcut(str(lnk_path))
        sc.TargetPath = str(target_exe)
        sc.WorkingDirectory = str(working_dir)
        if arguments:
            sc.Arguments = arguments
        if icon_path and icon_path.exists():
            sc.IconLocation = f"{str(icon_path)},0"
        sc.Description = description
        sc.Save()
        if lnk_path.exists() and lnk_path.stat().st_size > 0:
            logger.info("Successfully created desktop shortcut via win32com: %s", lnk_path)
            return True
    except Exception as e:
        logger.warning("win32com shortcut creation error: %s", e)

    return False


def create_desktop_shortcut(
    target_exe: Optional[Union[str, Path]] = None,
    icon_path: Optional[Union[str, Path]] = None,
    shortcut_name: str = "ProLab SmartLabeler.lnk",
    desktop_dir: Optional[Union[str, Path]] = None,
    working_dir: Optional[Union[str, Path]] = None,
    description: str = "ProLab Smart Labeler - Mobile Sales & Repair Lab",
    arguments: str = "",
) -> bool:
    """
    Creates a Windows Desktop shortcut (.lnk) pointing to the application.

    Args:
        target_exe: Target executable path. Defaults to sys.executable.
        icon_path: Path to .ico file. Defaults to assets/app_icon.ico.
        shortcut_name: Name of the shortcut file (e.g. 'ProLab SmartLabeler.lnk').
        desktop_dir: Destination desktop folder. Defaults to resolved user Desktop.
        working_dir: Working directory. Defaults to target_exe directory or project root.
        description: Shortcut tooltip and shell description.
        arguments: Command line arguments string (used in dev mode to launch main.py).

    Returns:
        bool: True if created and verified on disk, False otherwise.
    """
    if sys.platform != "win32":
        logger.warning("Desktop shortcut creation is only supported on Windows.")
        return False

    try:
        if desktop_dir is not None:
            target_desktop = Path(desktop_dir).resolve()
        else:
            target_desktop = get_desktop_dir()

        if not target_desktop.exists():
            try:
                target_desktop.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                logger.error("Failed to create destination directory %s: %s", target_desktop, e)
                return False

        # Normalize shortcut name
        if not shortcut_name or not isinstance(shortcut_name, str) or not shortcut_name.strip():
            name = "ProLab SmartLabeler.lnk"
        else:
            name = shortcut_name.strip()
            if not name.lower().endswith(".lnk"):
                name += ".lnk"
        lnk_path = target_desktop / name

        # Resolve and validate target executable
        if target_exe is None:
            raw_target = sys.executable
        elif isinstance(target_exe, (str, Path, os.PathLike)):
            target_str = str(target_exe).strip()
            if not target_str:
                logger.error("Target executable path cannot be empty or whitespace.")
                return False
            raw_target = target_str
        else:
            logger.error("Invalid target_exe type '%s'. Expected str or Path.", type(target_exe).__name__)
            return False

        try:
            target_path = Path(os.path.realpath(raw_target))
        except (ValueError, TypeError, OSError) as e:
            logger.error("Failed to resolve target_exe '%s': %s", raw_target, e)
            return False

        if not target_path.exists() or not target_path.is_file():
            logger.error("Target executable does not exist or is not a file: %s", target_path)
            return False


        # Resolve working directory
        if working_dir is None:
            if target_exe is not None:
                work_path = target_path.parent
            elif is_frozen():
                work_path = target_path.parent
            else:
                work_path = get_bundle_dir()
        else:
            work_path = Path(working_dir).resolve()

        # In dev mode, configure arguments to run main.py if target is python.exe
        if not is_frozen() and not arguments and target_exe is None:
            main_script = get_bundle_dir() / "main.py"
            if main_script.exists():
                arguments = f'"{main_script}"'

        # Resolve icon path
        final_icon: Optional[Path] = None
        if icon_path is not None:
            p = Path(icon_path).resolve()
            if p.exists():
                final_icon = p
        if final_icon is None:
            candidate = get_asset_path("app_icon.ico")
            if candidate.exists():
                final_icon = candidate.resolve()
            elif is_frozen():
                final_icon = target_path

        # Primary engine: Headless PowerShell COM
        if _create_via_powershell(lnk_path, target_path, work_path, final_icon, description, arguments):
            return True

        # Fallback engine: In-process win32com
        if _create_via_win32com(lnk_path, target_path, work_path, final_icon, description, arguments):
            return True

        logger.error("Failed to create desktop shortcut %s via all available mechanisms.", lnk_path)
        return False
    except Exception as exc:
        logger.error("Unexpected error creating desktop shortcut: %s", exc)
        return False
