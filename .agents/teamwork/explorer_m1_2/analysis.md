# Milestone M1 Technical Investigation & Design Analysis
## Focus: Windows Integration, AppUserModelID, Window Icon Propagation & Desktop Shortcut Creator

**Date**: 2026-11-08  
**Author**: teamwork_explorer (`explorer_m1_2`)  
**Scope**: Windows Shell Integration, Taskbar AppUserModelID, Window Icon propagation, Programmatic Desktop Shortcut creation, and UI trigger controls.  
**Target Specifications**: `ORIGINAL_REQUEST.md` (R1), `PROJECT.md` (Feature 2, Feature 3, Milestone M1), `spec_printing_ui_audit.md` (Section 1 & 2.5).

---

## 1. Executive Summary

Milestone M1 establishes the application's visual identity, operating system branding, and shell integration on Windows 11/10. This analysis provides the comprehensive technical architecture and implementation blueprints for:
1. **Explicit Windows Taskbar Process Identity**: Replacing legacy ID `"thermallab.mobileprinter.pro.1"` with the authoritative ID `"ProLab.SmartLabeler.App.1.0"` via `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID` prior to `QApplication` instantiation, ensuring Windows taskbar pins and thumbnail groups map to the custom gold/black shield emblem rather than generic `python.exe`.
2. **Global Window Icon Propagation**: Resolving `assets/app_icon.ico` across development, PyInstaller one-file, and one-dir layouts via an enhanced `core.paths` utility, setting the icon at `QApplication` level so all `QMainWindow`, `QDialog`, and message boxes inherit the gold/black shield emblem.
3. **Resilient Desktop Shortcut Creation**: Implementing `core/shortcut_util.py` (with `assets/shortcut_util.py` alias) providing `create_desktop_shortcut(target_exe=None, icon_path=None, shortcut_name="ProLab SmartLabeler.lnk") -> bool`. The utility employs a 5-tier Windows Shell Special Folders resolution (accounting for OneDrive Desktop redirection and roaming profiles) and a dual-engine `.lnk` generator: primary headless PowerShell `WScript.Shell` COM execution (`CREATE_NO_WINDOW`, `ExecutionPolicy Bypass`) with an in-process `win32com.client` fallback.
4. **Intuitive UI Trigger Integration**: Exposing shortcut creation in both the App Settings dialog (`ShopSettingsDialog` in `ui/shop_dialog.py`) and the top toolbar / status header (`StatusBarPanel` in `ui/status_bar.py`) with user-friendly confirmation dialogs.

---

## 2. Current Codebase State & Gap Analysis

| Component | Current State in Codebase | Required State (M1 Specification) | Severity / Gap |
|---|---|---|---|
| **AppUserModelID in `main.py`** | Lines 27-33 define `myappid = "thermallab.mobileprinter.pro.1"`. | Must be `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")`. | **High**: Incorrect taskbar grouping, mismatched branding. |
| **App Identity in `main.py`** | `app.setApplicationName("Thermal Lab Pro")`, `app.setOrganizationName("ThermalLab")`. | Must be `app.setApplicationName("ProLab SmartLabeler")`, `app.setOrganizationName("ProLab")`. | **Medium**: Legacy naming mismatch. |
| **Window Icon in `main.py` & UI** | No `setWindowIcon` call on `app` or `window`. Windows display default Qt/Python feather icon. | `app.setWindowIcon(QIcon(str(icon_path)))` set on `QApplication` and propagated to `MainWindow` and dialogs. | **High**: Violation of Acceptance Criterion R1. |
| **Asset Path Resolution (`core/paths.py`)** | Contains `get_bundle_dir`, `get_app_data_dir`, `get_bin_dir`, but **NO** `get_asset_path` or `get_assets_dir`. | Must provide `get_asset_path(filename: str = "") -> Path` with frozen bundle and dev root resolution. | **High**: Fragile relative paths break when frozen or executed from other directories. |
| **Desktop Shortcut Generator** | No utility exists in `assets/` or `core/`. | `core/shortcut_util.py` and `assets/shortcut_util.py` providing `create_desktop_shortcut(...) -> bool`. | **High**: Missing core M1 requirement. |
| **Desktop Path Resolution** | N/A | Must handle standard `%USERPROFILE%\Desktop`, `%USERPROFILE%\OneDrive\Desktop`, and Windows CSIDL `CSIDL_DESKTOPDIRECTORY = 0x0010`. | **High**: Simple `expanduser("~/Desktop")` fails on OneDrive-enabled Windows 10/11 machines. |
| **UI Trigger for Shortcut** | No shortcut trigger button in `ui/shop_dialog.py` or `ui/status_bar.py`. | Dedicated button in App Settings (`ShopSettingsDialog`) and Toolbar (`StatusBarPanel`). | **Medium**: User cannot trigger shortcut creation from UI. |
| **PyInstaller `app.spec`** | `datas` only bundles `bin` and `apple_models.json`. No `assets/` directory bundled. Name is `'ThermalLabPro'`. Icon is not specified. | Bundle `assets/`, specify `icon='assets/app_icon.ico'`, add `core.shortcut_util` to `hiddenimports`. | **High**: Standalone executable will lack icon and assets. |

---

## 3. Detailed Technical Architecture & Design

### 3.1 Windows Taskbar AppUserModelID & Application Identity

#### Why Explicit AppUserModelID is Essential:
On Windows 7 and newer (including Windows 10 and 11), the Windows Shell groups taskbar buttons and manages taskbar icons using an Application User Model ID (AUMID). When an application starts without setting an explicit AUMID, the Windows Shell assigns an implicit AUMID derived from the hosting process executable (`python.exe` or `pythonw.exe`). Consequently:
- Windows pins the generic Python interpreter icon to the taskbar.
- Grouping, pinning, and jump lists become conflated with other Python processes.
- Window title bar icons set by Qt do not override the taskbar icon.

By invoking:
```python
ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")
```
Windows immediately registers the process as a distinct, first-class Windows application.

#### Execution Timing:
The AUMID **must be set before any top-level window or `QApplication` instance is created**.
If `QApplication` is initialized before this call, Windows may have already assigned the implicit process AUMID to the main thread's message loop, causing taskbar icon synchronization to fail or require window destruction/recreation.

#### Implementation in `main.py`:
```python
def main():
    """Initializes and executes the PyQt6 application."""
    # 1. Windows Taskbar AppUserModelID: MUST execute before QApplication instantiation
    if sys.platform == "win32":
        try:
            import ctypes
            app_id = "ProLab.SmartLabeler.App.1.0"
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
            logger.info("Registered Windows AppUserModelID: %s", app_id)
        except Exception as e:
            logger.warning("Failed to register Windows AppUserModelID: %s", e)

    # 2. Instantiate QApplication
    app = QApplication(sys.argv)
    app.setApplicationName("ProLab SmartLabeler")
    app.setOrganizationName("ProLab")
    app.setApplicationVersion("1.0.0")

    # 3. Global Window Icon Propagation
    from PyQt6.QtGui import QIcon
    from core.paths import get_asset_path
    
    icon_path = get_asset_path("app_icon.ico")
    if icon_path.exists():
        app_icon = QIcon(str(icon_path))
        app.setWindowIcon(app_icon)
        logger.info("Configured global application window icon from %s", icon_path)
    else:
        logger.warning("Application icon not found at %s; proceeding with system default", icon_path)
```

---

### 3.2 Asset Path Resolution Engine (`core/paths.py`)

To prevent path mismatches across development mode (`python main.py`), PyInstaller frozen one-file mode (`sys._MEIPASS`), and frozen one-dir mode (`sys.executable / parent`), `core/paths.py` requires dedicated asset resolution functions.

#### Mathematical Path Model:
Let $P_{bundle}$ be `get_bundle_dir()`.
- If frozen one-file: $P_{bundle} = \text{Path}(\text{sys.\_MEIPASS})$
- If frozen one-dir: $P_{bundle} = \text{Path}(\text{sys.executable}).\text{parent}$
- If development: $P_{bundle} = \text{Path}(\_\_file\_\_).\text{parent}.\text{parent}$ (project root)

The asset directory $D_{assets}$ is evaluated as:
$$D_{assets} = \begin{cases}
P_{bundle} / \text{"assets"} & \text{if exists} \\
\text{Path}(\text{sys.executable}).\text{parent} / \text{"assets"} & \text{if frozen and exists} \\
P_{bundle} / \text{"assets"} & \text{fallback}
\end{cases}$$

#### Function Definitions for `core/paths.py`:
```python
def get_assets_dir() -> Path:
    """
    Returns the root directory for static application assets.
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
    """
    assets_dir = get_assets_dir()
    if not filename:
        return assets_dir
    return assets_dir / filename
```

---

### 3.3 Robust Desktop Path Resolution

#### The Windows Desktop Redirection Challenge:
Standard Python scripts often assume `os.path.expanduser("~/Desktop")` points to the user's active desktop. On modern Windows 10 and Windows 11, Microsoft OneDrive frequently activates **Known Folder Move (KFM)**, silently redirecting `Desktop` to `C:\Users\<Username>\OneDrive\Desktop`.
Furthermore, corporate environments, multi-language installations, and domain profiles redirect Desktop to UNC paths or localized folder names.

A single method is vulnerable to failure. We design a **5-tier cascade resolution** in `get_desktop_dir()`:

```
┌────────────────────────────────────────────────────────┐
│ Tier 1: Windows Shell API SHGetFolderPathW (CSIDL 0x10)│  <-- Gold Standard (OS Native)
└──────────────────────────┬─────────────────────────────┘
                           │ If fails or returns empty
┌──────────────────────────▼─────────────────────────────┐
│ Tier 2: Windows Registry User Shell Folders\Desktop    │  <-- Reads actual Explorer mapping
└──────────────────────────┬─────────────────────────────┘
                           │ If registry key missing
┌──────────────────────────▼─────────────────────────────┐
│ Tier 3: %USERPROFILE%\OneDrive\Desktop Detection       │  <-- OneDrive redirection check
└──────────────────────────┬─────────────────────────────┘
                           │ If directory absent
┌──────────────────────────▼─────────────────────────────┐
│ Tier 4: %USERPROFILE%\Desktop                          │  <-- Standard Windows user profile
└──────────────────────────┬─────────────────────────────┘
                           │ If environment variable unset
┌──────────────────────────▼─────────────────────────────┐
│ Tier 5: Path.home() / "Desktop"                        │  <-- Universal POSIX/Python fallback
└────────────────────────────────────────────────────────┘
```

#### Detailed Resolution Logic:
1. **Tier 1 — `SHGetFolderPathW`**:
   Invoking `ctypes.windll.shell32.SHGetFolderPathW(None, 0x0010, None, 0, buf)` requests `CSIDL_DESKTOPDIRECTORY` directly from the Windows Shell subsystem. This always reflects the shell's active desktop view.
2. **Tier 2 — Windows Registry**:
   Querying `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders` value `"Desktop"`, expanded via `os.path.expandvars`.
3. **Tier 3 & 4 — Environment & OneDrive**:
   Inspecting `os.environ.get("USERPROFILE")` for `OneDrive\Desktop` followed by `Desktop`.
4. **Tier 5 — Fallback**:
   `Path(os.path.expanduser("~/Desktop"))`.

---

### 3.4 Desktop Shortcut Creator Architecture (`core/shortcut_util.py`)

#### Dual-Engine Generation Strategy:
Creating a `.lnk` file on Windows without compiling a C binary or requiring heavy external dependencies (such as `pylnk3` or raw binary shell link format parsing) is achieved using Windows COM `WScript.Shell`.

We implement a **Dual-Engine** strategy:
1. **Engine A (Primary) — Headless PowerShell WScript.Shell COM script**:
   - Executes via `subprocess.run(["powershell", ...])`.
   - Uses flags:
     - `-NoProfile`: Avoids loading user profile scripts, eliminating latency and profile script errors.
     - `-NonInteractive`: Ensures PowerShell will never hang waiting for stdin.
     - `-ExecutionPolicy Bypass`: Prevents group policy script restrictions.
     - `creationflags=0x08000000` (`CREATE_NO_WINDOW`): Suppresses any visible console window flash.
     - `timeout=10`: Protects against unexpected hangs.
2. **Engine B (Fallback) — In-Process `win32com.client`**:
   - `pywin32` is already a core project dependency (used for GDI printing in `core/printer_win32.py`).
   - If PowerShell is restricted or disabled on the host, `win32com.client.Dispatch("WScript.Shell")` creates and saves the shortcut directly in-process with zero subprocess overhead.

#### Function Contract:
```python
def create_desktop_shortcut(
    target_exe: Optional[Union[str, Path]] = None,
    icon_path: Optional[Union[str, Path]] = None,
    shortcut_name: str = "ProLab SmartLabeler.lnk",
    working_dir: Optional[Union[str, Path]] = None,
    description: str = "ProLab Smart Labeler - Mobile Phone Sales & Repair Lab",
    arguments: str = ""
) -> bool:
    """
    Creates a Windows Desktop shortcut (.lnk) pointing to the application.

    Args:
        target_exe: Target executable path. If None, resolves to sys.executable (or frozen exe).
        icon_path: Path to .ico file. If None, resolves to assets/app_icon.ico.
        shortcut_name: Name of the shortcut file (defaults to 'ProLab SmartLabeler.lnk').
        working_dir: Working directory. If None, resolves to target_exe parent.
        description: Shortcut tooltip and shell description.
        arguments: Command line arguments string (used in dev mode to launch main.py).

    Returns:
        bool: True if the shortcut exists on the Desktop, False otherwise.
    """
```

#### Development vs. Frozen Execution Resolution:
- When running in **frozen mode** (`is_frozen() == True`):
  `target_exe = Path(sys.executable).resolve()`
  `working_dir = target_exe.parent`
  `arguments = ""`
- When running in **development mode** (`is_frozen() == False`):
  `target_exe = Path(sys.executable).resolve()`
  `working_dir = get_bundle_dir()`
  `main_script = get_bundle_dir() / "main.py"`
  `arguments = f'"{main_script}"'` if not provided!
  *Key Insight*: In development mode, creating a shortcut that only points to `python.exe` without `main.py` would merely launch an empty REPL prompt. By automatically setting `arguments = f'"{main_script}"'` and `working_dir = get_bundle_dir()`, clicking the shortcut in dev mode launches the actual ProLab application!

#### Icon Resolution:
- If `icon_path` is None:
  `candidate = get_asset_path("app_icon.ico")`
  If `candidate.exists()`: `icon_path = candidate.resolve()`
  Else: `icon_path = target_exe` (Windows extracts icon index 0 from the exe).

#### Module Placement:
1. Core logic resides in `core/shortcut_util.py`.
2. Forwarding alias placed in `assets/shortcut_util.py`:
   ```python
   # assets/shortcut_util.py
   """Forwarder alias for core.shortcut_util to fulfill both specification imports."""
   from core.shortcut_util import create_desktop_shortcut, get_desktop_dir
   __all__ = ["create_desktop_shortcut", "get_desktop_dir"]
   ```

---

### 3.5 Complete Source Blueprint: `core/shortcut_util.py`

```python
"""
core/shortcut_util.py — Programmatic Windows Desktop Shortcut Creator
Features:
- 5-tier cascading Windows Desktop path resolution (Shell API, Registry, OneDrive, Profile, Fallback).
- Dual-engine shortcut creation: Headless PowerShell WScript.Shell COM + win32com.client fallback.
- Auto-detection of frozen PyInstaller vs. development python main.py environment.
- Icon location binding to assets/app_icon.ico with fallback to target_exe.
"""
from pathlib import Path
import logging
import os
import subprocess
import sys
from typing import Optional, Union

from core.paths import get_bundle_dir, get_asset_path, is_frozen

logger = logging.getLogger(__name__)


def get_desktop_dir() -> Path:
    """
    Resolves the user's active Windows Desktop directory using a 5-tier fallback cascade:
    1. Windows Shell API SHGetFolderPathW (CSIDL_DESKTOPDIRECTORY = 0x0010)
    2. Windows Registry HKCU\\...\\Explorer\\User Shell Folders -> Desktop
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
    arguments: str
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
            timeout=10
        )
        if res.returncode == 0 and lnk_path.exists():
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
    arguments: str
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
        if lnk_path.exists():
            logger.info("Successfully created desktop shortcut via win32com: %s", lnk_path)
            return True
    except Exception as e:
        logger.warning("win32com shortcut creation error: %s", e)

    return False


def create_desktop_shortcut(
    target_exe: Optional[Union[str, Path]] = None,
    icon_path: Optional[Union[str, Path]] = None,
    shortcut_name: str = "ProLab SmartLabeler.lnk",
    working_dir: Optional[Union[str, Path]] = None,
    description: str = "ProLab Smart Labeler - Mobile Phone Sales & Repair Lab",
    arguments: str = ""
) -> bool:
    """
    Creates a Windows Desktop shortcut (.lnk) pointing to the application.

    Returns:
        bool: True if created and verified on disk, False otherwise.
    """
    if sys.platform != "win32":
        logger.warning("Desktop shortcut creation is only supported on Windows.")
        return False

    desktop_dir = get_desktop_dir()
    if not desktop_dir.exists():
        try:
            desktop_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error("Failed to create desktop directory %s: %s", desktop_dir, e)
            return False

    # Normalize shortcut name
    name = shortcut_name.strip()
    if not name.lower().endswith(".lnk"):
        name += ".lnk"
    lnk_path = desktop_dir / name

    # Resolve target executable and working directory
    if target_exe is None:
        target_path = Path(sys.executable).resolve()
    else:
        target_path = Path(target_exe).resolve()

    if working_dir is None:
        if is_frozen():
            work_path = target_path.parent
        else:
            work_path = get_bundle_dir()
    else:
        work_path = Path(working_dir).resolve()

    # In dev mode, configure arguments to run main.py if target is python.exe
    if not is_frozen() and not arguments:
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

    # Primary: Headless PowerShell COM
    if _create_via_powershell(lnk_path, target_path, work_path, final_icon, description, arguments):
        return True

    # Fallback: In-process win32com
    if _create_via_win32com(lnk_path, target_path, work_path, final_icon, description, arguments):
        return True

    logger.error("Failed to create desktop shortcut %s via all available mechanisms.", lnk_path)
    return False
```

---

### 3.6 UI Integration Strategy (App Settings & Toolbar)

The requirement states:
> "Provide a button in UI settings / toolbar to trigger 'Create Desktop Shortcut'."

We integrate the trigger into **both** user-facing locations:

#### Location 1: App Settings Dialog (`ShopSettingsDialog` in `ui/shop_dialog.py`)
In `ShopSettingsDialog._init_ui()`:
- Add a new section: `QGroupBox("تكامل نظام ويندوز (Windows Integration)")`
- Add a button:
  ```python
  self.btn_shortcut = QPushButton("📌 إنشاء اختصار على سطح المكتب (Create Desktop Shortcut)")
  self.btn_shortcut.setToolTip("إنشاء أيقونة تشغيل مباشرة للبرنامج على سطح المكتب مع الأيقونة المخصصة")
  self.btn_shortcut.clicked.connect(self._create_desktop_shortcut_action)
  ```
- Method `_create_desktop_shortcut_action(self)`:
  ```python
  def _create_desktop_shortcut_action(self):
      from core.shortcut_util import create_desktop_shortcut
      from PyQt6.QtWidgets import QMessageBox
      success = create_desktop_shortcut()
      if success:
          QMessageBox.information(
              self,
              "اختصار سطح المكتب",
              "تم إنشاء اختصار ProLab SmartLabeler على سطح المكتب بنجاح!\n\n"
              "Desktop shortcut created successfully with custom gold/black icon."
          )
      else:
          QMessageBox.warning(
              self,
              "خطأ في إنشاء الاختصار",
              "تعذر إنشاء الاختصار تلقائياً. يرجى التحقق من أذونات النظام أو الصلاحيات.\n\n"
              "Could not create desktop shortcut. Please check system permissions."
          )
  ```

#### Location 2: Top Toolbar Header (`StatusBarPanel` in `ui/status_bar.py`)
In `StatusBarPanel._init_ui()` (next to `btn_shop` and `btn_drivers`):
- Add button:
  ```python
  self.btn_desktop_shortcut = QPushButton("📌 اختصار سطح المكتب")
  self.btn_desktop_shortcut.setToolTip("إنشاء اختصار للبرنامج على سطح المكتب (Create Desktop Shortcut)")
  self.btn_desktop_shortcut.setStyleSheet("background-color: #2A2A2A; color: #D4AF37; border: 1px solid #D4AF37; font-weight: bold;")
  self.btn_desktop_shortcut.clicked.connect(self._create_desktop_shortcut)
  layout.addWidget(self.btn_desktop_shortcut)
  ```
- Handler:
  ```python
  def _create_desktop_shortcut(self):
      from core.shortcut_util import create_desktop_shortcut
      from PyQt6.QtWidgets import QMessageBox
      success = create_desktop_shortcut()
      if success:
          QMessageBox.information(
              self.window(),
              "اختصار سطح المكتب",
              "تم إنشاء اختصار ProLab SmartLabeler على سطح المكتب بنجاح!"
          )
      else:
          QMessageBox.warning(
              self.window(),
              "تنبيه",
              "فشل إنشاء اختصار سطح المكتب. يرجى مراجعة سجلات النظام."
          )
  ```

---

### 3.7 PyInstaller Spec & Build Script Synchronization

To ensure the standalone `.exe` built by `build_exe.bat` embodies the custom icon and assets:

1. **`app.spec` Updates**:
   - Add `assets` folder to `datas`:
     ```python
     datas = [
         (os.path.join(project_dir, 'bin'), 'bin'),
         (os.path.join(project_dir, 'assets'), 'assets'),
         (os.path.join(project_dir, 'data', 'apple_models.json'), 'data'),
     ]
     ```
   - Add `core.shortcut_util` and `assets.shortcut_util` to `hiddenimports`.
   - Set icon in `EXE`:
     ```python
     icon=os.path.join(project_dir, 'assets', 'app_icon.ico')
     ```
   - Update executable and collection name from `ThermalLabPro` to `ProLabSmartLabeler`.

2. **`build_exe.bat` Updates**:
   - Ensure step 1 runs `python assets/generate_icon.py` before PyInstaller compilation.
   - Verify that `dist\ProLabSmartLabeler\assets\app_icon.ico` is present.

---

## 4. Edge Cases, Failure Modes & Resilience Matrix

| # | Boundary / Failure Mode | Root Cause | Handling Strategy in Design |
|---|---|---|---|
| 1 | **OneDrive Desktop Redirection** | OneDrive moves `Desktop` folder to `%USERPROFILE%\OneDrive\Desktop`. `os.path.expanduser("~/Desktop")` creates an orphan folder that is invisible on the user's active screen. | Tier 1 `SHGetFolderPathW(CSIDL_DESKTOPDIRECTORY)` and Tier 2 Registry query resolve the active shell redirected path. |
| 2 | **PowerShell Execution Policy Restricted** | Corporate Windows machines set `Set-ExecutionPolicy Restricted`. | We pass `-ExecutionPolicy Bypass` and `-NoProfile`. If still blocked by Group Policy / AppLocker, Engine B (`win32com.client`) runs in-process without invoking `powershell.exe`. |
| 3 | **Console Window Flash on Shortcut Creation** | Spawning `powershell.exe` without creation flags displays an irritating black terminal window for 500ms. | Passed `creationflags=0x08000000` (`CREATE_NO_WINDOW`) to `subprocess.run`, executing the process entirely in the background. |
| 4 | **Missing `app_icon.ico` at Startup** | Application launched before `assets/generate_icon.py` is executed. | `get_asset_path("app_icon.ico")` checks `.exists()`. If missing, logs a warning and proceeds gracefully without raising `FileNotFoundError` or crashing `main.py`. |
| 5 | **Double `.lnk` Extension** | User or caller supplies `"ProLab.lnk"` or `"ProLab"`. | Function normalizes: `if not name.lower().endswith(".lnk"): name += ".lnk"`. Avoids `"ProLab.lnk.lnk"`. |
| 6 | **Non-Windows Execution** | Script or tests running in Linux CI or macOS. | `if sys.platform != "win32"` returns `False` immediately with log message, preventing crashes or OS-specific COM exceptions. |
| 7 | **Special Characters in Windows Username** | Username containing spaces, Arabic characters, apostrophes, or ampersands. | Single quotes in paths are safely escaped (`.replace("'", "''")`) in the PowerShell template; Unicode buffers are used in `ctypes`. |

---

## 5. Verification & Testing Strategy

### 5.1 Unit Tests for AppUserModelID & Window Icon (`tests/test_assets.py`)
1. **AppUserModelID Assertion**:
   - Inspect `main.py` source or runtime mock to verify `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")` is called.
   - Assert call occurs prior to `QApplication(sys.argv)`.
2. **Window Icon Propagation**:
   - When `assets/app_icon.ico` exists, verify `app.windowIcon().isNull()` is `False`.
   - Verify `MainWindow().windowIcon().isNull()` is `False`.

### 5.2 Unit Tests for Desktop Shortcut Creator (`tests/test_assets.py`)
1. **Shortcut Generation Test**:
   - Invoke `create_desktop_shortcut(target_exe=sys.executable, shortcut_name="TestShortcut.lnk")`.
   - Assert return value is `True`.
   - Verify file `get_desktop_dir() / "TestShortcut.lnk"` exists on disk.
   - Clean up the created test `.lnk` file in teardown.
2. **Custom Target and Working Directory Test**:
   - Provide custom dummy `target_exe` and custom temporary output path.
   - Verify `win32com` and `PowerShell` engines correctly resolve arguments.

### 5.3 Independent Execution Commands:
- Unit test execution: `python -m unittest tests/test_ui.py`
- Asset & shortcut verification: `python -m unittest tests/test_assets.py`
- Manual verification: `python main.py` (check taskbar icon and click "📌 اختصار سطح المكتب").
