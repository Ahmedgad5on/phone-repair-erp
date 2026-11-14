# Handoff Report: Milestone M1 — Windows Integration & Desktop Shortcut

**Sender**: teamwork_explorer (`explorer_m1_2`)  
**Recipient**: Orchestrator / Implementers  
**Target Milestone**: M1 (Windows Taskbar AppUserModelID, Window Icon Propagation, Desktop Shortcut Creator, and UI Trigger Controls)  
**Report Type**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

1. **Legacy AppUserModelID in `main.py`**:
   Direct inspection of `main.py` lines 27–34 revealed:
   ```python
   # Ensure Windows app ID for taskbar icon
   if sys.platform == "win32":
       try:
           import ctypes
           myappid = "thermallab.mobileprinter.pro.1"
           ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
       except Exception:
           pass
   ```
   The process ID is set to `"thermallab.mobileprinter.pro.1"` instead of the required `"ProLab.SmartLabeler.App.1.0"`.

2. **Missing Window Icon Setup in `main.py`**:
   Direct inspection of `main.py` lines 35–46 revealed:
   ```python
   app = QApplication(sys.argv)
   app.setApplicationName("Thermal Lab Pro")
   app.setOrganizationName("ThermalLab")

   # Initialize master window
   db = DatabaseManager()
   window = MainWindow(db=db)
   window.show()
   ```
   No `setWindowIcon` call exists on either `app` (`QApplication`) or `window` (`MainWindow`), leaving all windows displaying generic default icons.

3. **Absence of Asset Resolution in `core/paths.py`**:
   `core/paths.py` defines `get_bundle_dir()`, `get_app_data_dir()`, `get_bin_dir()`, but has no `get_asset_path()` or `get_assets_dir()`. Direct search for `get_asset_path` across the codebase returned `No results found`.

4. **Absence of Shortcut Utility in Codebase**:
   Neither `core/shortcut_util.py` nor `assets/shortcut_util.py` exists in the filesystem.

5. **Desktop Path Diversity on Target Machine**:
   Testing on the current Windows host using Python demonstrated:
   - Registry query (`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders` -> `Desktop`) returned: `C:\Users\Eng_Ahmed\Desktop`
   - `SHGetFolderPathW(None, 0x0010, None, 0, buf)` returned: `C:\Users\Eng_Ahmed\Desktop`
   - `os.path.expanduser('~/Desktop')` returned: `C:\Users\Eng_Ahmed/Desktop` (forward slash)

6. **PowerShell and win32com Execution Feasibility**:
   Direct execution test in `.agents/teamwork/explorer_m1_2/test_scratch.py` confirmed:
   - Headless PowerShell invocation of `WScript.Shell` with `creationflags=0x08000000` (`CREATE_NO_WINDOW`) created a `.lnk` file and exited with code `0`.
   - In-process `win32com.client.Dispatch("WScript.Shell")` successfully created and saved a `.lnk` file.

7. **UI Settings and Toolbar Structure**:
   - `ui/shop_dialog.py` lines 1–184 implement `ShopSettingsDialog` (Shop Info, Logo, Design & Typography), which serves as the application's configuration dialog.
   - `ui/status_bar.py` lines 150–220 implement the top header status bar with quick action buttons (`btn_shop`, `btn_drivers`, `btn_lang`).

8. **Existing Test Harness**:
   Executing `python -m unittest tests/test_ui.py` passed 8 tests in 3.025 seconds with exit code `0`. Note that `pytest` is not installed globally in PATH, so `python -m unittest` is the primary test command.

---

## 2. Logic Chain

1. **AppUserModelID Correction**:
   - From Observation 1, `main.py` uses legacy `"thermallab.mobileprinter.pro.1"`.
   - Per `ORIGINAL_REQUEST.md` (R1) and `PROJECT.md` (Feature 2), Windows requires `"ProLab.SmartLabeler.App.1.0"` to associate the process with the custom gold/black shield icon.
   - Calling `ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ProLab.SmartLabeler.App.1.0")` before `app = QApplication(sys.argv)` registers the ID with the Windows Shell before any HWND is bound to the process.

2. **Window Icon Propagation**:
   - From Observation 2, neither `app` nor `MainWindow` sets a window icon.
   - In Qt, invoking `app.setWindowIcon(QIcon(str(icon_path)))` automatically sets the default application icon across all top-level windows (`QMainWindow`, `QDialog`, `QMessageBox`).
   - From Observation 3, to ensure reliable resolution across development and PyInstaller frozen bundles, `core/paths.py` must provide `get_asset_path("app_icon.ico")`.

3. **Desktop Shortcut Architecture**:
   - From Observations 4, 5, and 6, shortcut generation must operate reliably without third-party binary dependencies.
   - Windows 10/11 environments often redirect the Desktop folder (e.g. OneDrive KFM). A 5-tier resolution (`SHGetFolderPathW`, Registry, OneDrive, UserProfile, Fallback) ensures accurate resolution of the active desktop folder.
   - A dual-engine approach (headless PowerShell `WScript.Shell` primary + in-process `win32com.client` fallback) guarantees shortcut creation even on locked-down environments with restricted execution policies.
   - In development mode, `create_desktop_shortcut` must configure `arguments = f'"{main_script}"'` so clicking the shortcut executes `main.py` rather than opening an empty Python shell.

4. **UI Integration**:
   - From Observation 7, `ShopSettingsDialog` (`ui/shop_dialog.py`) and `StatusBarPanel` (`ui/status_bar.py`) are the designated entry points for settings and toolbar actions.
   - Adding a "Create Desktop Shortcut" action to both components provides maximum discoverability with informative feedback dialogs.

---

## 3. Caveats

1. **Icon File Availability Dependency**:
   `assets/app_icon.ico` is generated by `assets/generate_icon.py` (handled by peer agent `explorer_m1_1` / `worker_m1`). If `main.py` or shortcut creation runs before icon generation, `get_asset_path("app_icon.ico")` must fall back gracefully to `sys.executable` or log a non-fatal warning without crashing.
2. **Elevated Administrator Permissions**:
   On rare enterprise configurations with strict AppLocker or mandatory administrator restrictions on the desktop folder, `create_desktop_shortcut` may catch an OS permission error and return `False`. This is mitigated by returning a `bool` status and displaying a user-friendly `QMessageBox.warning`.
3. **Execution Shell**:
   The development and build environment uses standard `python.exe` (Python 3.12 64-bit on Windows 11). Test runs must use `python -m unittest` rather than bare `pytest` unless pytest is explicitly invoked via Python module.

---

## 4. Conclusion

The technical strategy for Milestone M1 Windows Integration & Desktop Shortcut is fully designed, verified on the active Windows OS, and ready for implementation:
1. **`main.py`**:
   - Replace `"thermallab.mobileprinter.pro.1"` with `"ProLab.SmartLabeler.App.1.0"` at lines 27–33 before `QApplication` instantiation.
   - Update application name to `"ProLab SmartLabeler"` and organization to `"ProLab"`.
   - Set global window icon via `app.setWindowIcon(QIcon(str(get_asset_path("app_icon.ico"))))` with safe existence fallback.
2. **`core/paths.py`**:
   - Add `get_assets_dir() -> Path` and `get_asset_path(filename: str = "") -> Path` with frozen bundle support.
3. **`core/shortcut_util.py` & `assets/shortcut_util.py`**:
   - Implement `create_desktop_shortcut(target_exe=None, icon_path=None, shortcut_name="ProLab SmartLabeler.lnk") -> bool`.
   - Implement 5-tier `get_desktop_dir() -> Path` (Win32 API `SHGetFolderPathW`, Registry, OneDrive, Profile, Fallback).
   - Implement headless PowerShell `WScript.Shell` COM script execution (`CREATE_NO_WINDOW`, `-ExecutionPolicy Bypass`, `-NoProfile`) with `win32com.client` fallback.
4. **UI Triggers**:
   - Add "Create Desktop Shortcut" button in `ShopSettingsDialog` (`ui/shop_dialog.py`).
   - Add "📌 اختصار سطح المكتب" button in `StatusBarPanel` (`ui/status_bar.py`).
5. **PyInstaller Spec (`app.spec`)**:
   - Add `assets` to `datas`, `core.shortcut_util` to `hiddenimports`, and `icon='assets/app_icon.ico'`.

---

## 5. Verification Method

1. **Verify AppUserModelID Registration**:
   Execute:
   ```cmd
   python -c "import ctypes; ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('ProLab.SmartLabeler.App.1.0'); print('AppUserModelID success')"
   ```
   *Expected output*: `AppUserModelID success` with return code 0.

2. **Verify Desktop Directory Resolution**:
   Execute:
   ```cmd
   python -c "from core.shortcut_util import get_desktop_dir; p = get_desktop_dir(); print('Desktop path:', p); assert p.exists()"
   ```
   *Expected output*: Absolute desktop path matching the active Windows Desktop.

3. **Verify Programmatic Shortcut Creation**:
   Execute:
   ```cmd
   python -c "from core.shortcut_util import create_desktop_shortcut, get_desktop_dir; success = create_desktop_shortcut(shortcut_name='TestVerification.lnk'); print('Created:', success); lnk = get_desktop_dir() / 'TestVerification.lnk'; assert lnk.exists(); lnk.unlink(); print('Verified and cleaned up')"
   ```
   *Expected output*: `Created: True`, `Verified and cleaned up`.

4. **Verify UI Integration & Unit Tests**:
   Execute:
   ```cmd
   python -m unittest tests/test_ui.py
   python -m unittest tests/test_assets.py
   ```
   *Expected output*: All tests pass with code 0.
