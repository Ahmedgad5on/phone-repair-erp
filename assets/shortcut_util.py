"""
assets/shortcut_util.py — Programmatic Windows Desktop Shortcut Creator.
Provides an alias to core.shortcut_util.create_desktop_shortcut.
"""
from __future__ import annotations

from core.shortcut_util import (
    create_desktop_shortcut,
    get_desktop_dir,
    _create_via_powershell,
    _create_via_win32com,
)

__all__ = [
    "create_desktop_shortcut",
    "get_desktop_dir",
    "_create_via_powershell",
    "_create_via_win32com",
]
