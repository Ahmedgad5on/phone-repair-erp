"""
Unit tests for core/version.py and version management system.
"""
import unittest
from core.version import (
    get_version, get_version_display, get_full_version,
    get_build_date, get_window_title, get_changelog,
    APP_VERSION, VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH,
    bump_version
)


class TestVersionManagement(unittest.TestCase):
    """Verifies that version strings, formats, and changelog adhere to semantic standards."""

    def test_version_constants_and_types(self):
        self.assertIsInstance(VERSION_MAJOR, int)
        self.assertIsInstance(VERSION_MINOR, int)
        self.assertIsInstance(VERSION_PATCH, int)
        self.assertEqual(get_version(), f"{VERSION_MAJOR}.{VERSION_MINOR}.{VERSION_PATCH}")
        self.assertTrue(get_version_display().startswith("v"))

    def test_full_version_contains_build_date(self):
        full = get_full_version()
        self.assertIn("v", full)
        self.assertIn("Build", full)
        self.assertIn(get_build_date().replace("-", "."), full)

    def test_window_title_formatting(self):
        title = get_window_title()
        self.assertIn("ProLab", title)
        self.assertIn(get_version(), title)
        self.assertIn("203 DPI", title)

    def test_changelog_structure(self):
        log = get_changelog()
        self.assertIsInstance(log, list)
        self.assertGreater(len(log), 0)
        # Verify first entry is current version
        latest = log[0]
        self.assertEqual(latest["version"], get_version())
        self.assertIn("changes", latest)
        self.assertIsInstance(latest["changes"], list)
        self.assertGreater(len(latest["changes"]), 0)


if __name__ == "__main__":
    unittest.main()
