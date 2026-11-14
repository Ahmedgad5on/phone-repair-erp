"""
main.py — Main Entrypoint for ProLab Smart Label Studio
Desktop Application for Mobile Phone Sales & Repair Workshops.
"""
import os
import sys
import logging

from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon
from PyQt6.QtCore import Qt

from core.paths import get_app_data_dir, get_asset_path
from core.database import DatabaseManager
from core.version import APP_VERSION, get_version, get_window_title
from core.licensing.client import get_licensing_client
from ui.auth_dialog import AuthDialog
from ui.main_window import MainWindow

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("thermal_lab")

APP_USER_MODEL_ID = "ProLab.SmartLabeler.App.1.0"


def set_app_user_model_id(app_id: str = APP_USER_MODEL_ID) -> bool:
    """Explicitly configures Windows AppUserModelID for taskbar pinning and grouping."""
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
            return True
        except Exception as e:
            logger.warning("Failed to set AppUserModelID: %s", e)
            return False
    return False


def main():
    """Initializes and executes the PyQt6 application with a progress dialog."""
    # Ensure Windows app ID for taskbar icon
    set_app_user_model_id(APP_USER_MODEL_ID)

    # Pre-warm and start ADB server daemon immediately on computer
    try:
        from core.paths import get_binary_path, setup_adb_environment
        from core.adb_reader import run_cmd
        adb_bin = get_binary_path("adb")
        adb_env = setup_adb_environment()
        run_cmd([adb_bin, "start-server"], env=adb_env, timeout=5.0)
        logger.info("Pre-warmed ADB server daemon on application launch.")
    except Exception as e:
        logger.debug("ADB server startup note: %s", e)

    # Ensure local central server is active for licensing & authentication
    try:
        from core.licensing.client import ensure_local_server_running
        ensure_local_server_running()
    except Exception as e:
        logger.debug("Local server autostart note: %s", e)

    # Create application
    app = QApplication(sys.argv)
    app.setApplicationName("ThermalLabPro Commercial ERP")
    app.setOrganizationName("ThermalLabPro")

    # Set global icon
    icon_path = get_asset_path("app_icon.ico")
    if icon_path.exists():
        app.setWindowIcon(QIcon(str(icon_path)))
        logger.info("Configured global application window icon from %s", icon_path)

    # Check commercial licensing and customer session
    lic_client = get_licensing_client()
    session = lic_client.load_session()
    lic_status = lic_client.get_license_status()

    # If first launch / no active customer session, present AuthDialog
    if not lic_client.is_logged_in() and not os.environ.get("PROLAB_SKIP_AUTH_PROMPT"):
        auth_dlg = AuthDialog(client=lic_client)
        auth_dlg.exec()

        # If user closed or rejected the login dialog without authenticating, exit immediately
        if not auth_dlg.authenticated and not lic_client.is_logged_in():
            logger.info("Authentication was closed or canceled by user. Exiting application.")
            sys.exit(0)

        # Refresh license status after auth dialog
        lic_status = lic_client.get_license_status()

    # Initialize database manager
    db = DatabaseManager()

    # Create and show main window
    window = MainWindow(db=db, license_status=lic_status)
    if icon_path.exists():
        window.setWindowIcon(QIcon(str(icon_path)))
    window.show()
    window.raise_()
    window.activateWindow()

    # If unactivated, prompt user with License Dialog smoothly after window is visible
    if not lic_status.is_valid:
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(600, window._open_license_dialog)

    logger.info("ProLab Smart Label Studio desktop application started successfully.")
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
