# -*- mode: python ; coding: utf-8 -*-
"""
app.spec — PyInstaller Spec File for ProLab Mobile Trading ERP Studio 4.0
Compiles into a single, fully-contained standalone Windows Executable (.exe)
Bundles Python modules, PyQt6 runtime, portable binaries (/bin), assets, drivers, and theme.
Zero external _internal directory dependencies — runs anywhere.
"""
from pathlib import Path
import os
import sys

block_cipher = None

project_dir = os.path.abspath(SPECPATH)

datas = [
    (os.path.join(project_dir, 'bin'), 'bin'),
    (os.path.join(project_dir, 'assets'), 'assets'),
    (os.path.join(project_dir, 'data'), 'data'),
    (os.path.join(project_dir, 'drivers'), 'drivers'),
    (os.path.join(project_dir, 'ui', 'theme.qss'), 'ui'),
]

hiddenimports = [
    'win32print',
    'win32ui',
    'win32con',
    'win32crypt',
    'serial',
    'serial.tools',
    'serial.tools.list_ports',
    'openpyxl',
    'openpyxl.cell',
    'openpyxl.styles',
    'arabic_reshaper',
    'bidi.algorithm',
    'barcode',
    'barcode.writer',
    'qrcode',
    'PIL',
    'PIL.Image',
    'PIL.ImageDraw',
    'PIL.ImageFont',
    'reportlab',
    'reportlab.lib',
    'reportlab.lib.colors',
    'reportlab.lib.pagesizes',
    'reportlab.lib.styles',
    'reportlab.platypus',
    'reportlab.pdfgen',
    'reportlab.pdfgen.canvas',
    'requests',
    'PyQt6',
    'PyQt6.QtCore',
    'PyQt6.QtGui',
    'PyQt6.QtWidgets',
    'core',
    'core.models',
    'core.paths',
    'core.config',
    'core.i18n',
    'core.driver_manager',
    'core.device_detector',
    'core.adb_reader',
    'core.ios_reader',
    'core.mock_device',
    'core.label_renderer',
    'core.label_template_model',
    'core.label_template_renderer',
    'core.printer_win32',
    'core.database',
    'core.shortcut_util',
    'core.pdf_exporter',
    'core.telegram_bot',
    'core.version',
    'core.github_sync',
    'core.licensing',
    'core.licensing.client',
    'core.licensing.license_cache',
    'core.licensing.license_verifier',
    'core.licensing.machine_id',
    'core.licensing.update_checker',
    'cryptography',
    'cryptography.hazmat.primitives.asymmetric.ed25519',
    'cryptography.hazmat.primitives.serialization',
    'ui',
    'ui.styles',
    'ui.status_bar',
    'ui.intake_trading_tab',
    'ui.pos_tab',
    'ui.traders_tab',
    'ui.analytics_tab',
    'ui.audit_tab',
    'ui.security_tab',
    'ui.reports_tab',
    'ui.telegram_hub_tab',
    'ui.fast_adb_dialog',
    'ui.pos_sale_dialog',
    'ui.trade_in_dialog',
    'ui.trader_payment_dialog',
    'ui.pin_dialog',
    'ui.printer_panel',
    'ui.print_labels_canvas',
    'ui.inventory_tab',
    'ui.about_dialog',
    'ui.auth_dialog',
    'ui.customer_profile_dialog',
    'ui.license_dialog',
    'ui.update_dialog',
    'ui.main_window',
    'pyzbar',
    'pyzbar.pyzbar',
]

import pyzbar
pyzbar_dir = os.path.dirname(pyzbar.__file__)
extra_binaries = [
    (os.path.join(pyzbar_dir, 'libiconv.dll'), '.'),
    (os.path.join(pyzbar_dir, 'libzbar-64.dll'), '.'),
]

a = Analysis(
    ['main.py'],
    pathex=[project_dir],
    binaries=extra_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'scipy', 'pandas', 'IPython'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ThermalLabPro',
    icon=os.path.join(project_dir, 'assets', 'app_icon.ico'),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
