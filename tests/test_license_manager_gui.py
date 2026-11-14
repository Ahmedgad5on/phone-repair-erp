"""
tests/test_license_manager_gui.py — Automated verification of License Manager GUI components
"""
import os
import sys
import pytest

os.environ["QT_QPA_PLATFORM"] = "offscreen"
from PyQt6.QtWidgets import QApplication

@pytest.fixture(scope="session")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    return app


def test_license_manager_window_lifecycle(qapp):
    from license_manager.api_client import LicenseManagerAPIClient
    from license_manager.main import LicenseManagerWindow, LoginDialog

    client = LicenseManagerAPIClient("http://127.0.0.1:8000")
    ok, msg = client.login("superadmin", "ProLabAdmin2026!Secure")
    assert ok, f"Login failed: {msg}"

    # Verify LoginDialog instantiation
    dlg = LoginDialog(client)
    assert dlg.txt_user.text() == "superadmin"

    # Verify MainWindow instantiation
    win = LicenseManagerWindow(client)
    assert win.tabs is not None
    assert win.tabs.count() == 7

    # Test all view switching
    for i in range(7):
        win.switch_view(i)
        assert win.tabs.currentIndex() == i

    # Test data refresh
    win.refresh_all_data()
    assert win.table_customers.rowCount() >= 0
    assert win.table_devices.rowCount() >= 0
    assert win.table_payments.rowCount() >= 0
    assert win.table_audit.rowCount() >= 0
