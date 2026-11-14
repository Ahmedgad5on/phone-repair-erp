import sys
import os
sys.path.insert(0, os.path.abspath("."))
import logging
import traceback
from PyQt6.QtWidgets import QApplication

logging.basicConfig(level=logging.DEBUG)

def test_full_launch():
    app = QApplication.instance() or QApplication(sys.argv)
    from core.database import DatabaseManager
    from core.licensing.client import get_licensing_client
    from ui.auth_dialog import AuthDialog
    from ui.main_window import MainWindow

    lic_client = get_licensing_client()
    
    # 1. Test login
    auth_dlg = AuthDialog(client=lic_client)
    auth_dlg.txt_login_user.setText("superadmin")
    auth_dlg.txt_login_pass.setText("ProLabAdmin2026!Secure")
    auth_dlg._handle_login()
    
    print("auth_dlg.authenticated:", auth_dlg.authenticated)
    print("lic_client.is_logged_in():", lic_client.is_logged_in())
    
    # 2. Check main.py check
    if not auth_dlg.authenticated and not lic_client.is_logged_in():
        print("FAIL: would have exited!")
        sys.exit(1)
        
    print("PASSED auth check!")
    
    # 3. MainWindow creation
    st = lic_client.get_license_status()
    db = DatabaseManager()
    try:
        win = MainWindow(db=db, license_status=st)
        print("MainWindow instantiated successfully!")
    except Exception as e:
        print("MainWindow CRASHED with exception:")
        traceback.print_exc()

if __name__ == "__main__":
    test_full_launch()

