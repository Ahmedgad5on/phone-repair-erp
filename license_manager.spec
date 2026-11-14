# -*- mode: python ; coding: utf-8 -*-
"""
license_manager.spec — PyInstaller Specification for ThermalLabPro License Manager
Compiles Component C into a standalone single-file Windows Executable (.exe)
Independent administrative tool for the software owner and licensing engineers.
"""
from pathlib import Path
import os
import sys

project_dir = os.path.abspath(SPECPATH)

datas = [
    (os.path.join(project_dir, 'assets'), 'assets'),
]

hiddenimports = [
    'PyQt6',
    'PyQt6.QtCore',
    'PyQt6.QtGui',
    'PyQt6.QtWidgets',
    'requests',
    'json',
    'logging',
    'license_manager',
    'license_manager.api_client',
]

a = Analysis(
    [os.path.join(project_dir, 'license_manager', 'main.py')],
    pathex=[project_dir, os.path.join(project_dir, 'license_manager')],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'scipy', 'numpy', 'pandas', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ThermalLabPro License Manager',
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
    icon=os.path.join(project_dir, 'assets', 'app_icon.ico') if os.path.exists(os.path.join(project_dir, 'assets', 'app_icon.ico')) else None,
)
