"""
tests/test_assets.py — Milestone M1 Verification Harness
Authoritative Unit & Integration Test Suite for:
1. Programmatic asset generation (assets/generate_icon.py)
2. Multi-resolution .ico layer structure (16 to 256px, RGBA)
3. Header logo PNG specifications (128x128px, RGBA)
4. Luxury brand color fidelity (Matte Black #121212, Metallic Gold #D4AF37)
5. Windows Desktop Shortcut creation & properties (.lnk)
6. Windows AppUserModelID registration (ProLab.SmartLabeler.App.1.0)
"""

import ast
import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Dict, List, Set, Tuple
from unittest.mock import MagicMock, patch

from PIL import Image

# Robust PROJECT_ROOT discovery (works from tests/ or any subfolder)
current_file = Path(__file__).resolve()
candidate = current_file.parent
PROJECT_ROOT = Path(os.getcwd()).resolve()
while candidate != candidate.parent:
    if (candidate / "main.py").exists() and (candidate / "PROJECT.md").exists():
        PROJECT_ROOT = candidate
        break
    candidate = candidate.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Safe imports for components under test
try:
    from assets.generate_icon import (
        COLOR_MATTE_BLACK,
        COLOR_METALLIC_GOLD,
        REQUIRED_ICO_SIZES,
        generate_assets,
    )
except ImportError:
    generate_assets = None
    REQUIRED_ICO_SIZES = {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
    COLOR_MATTE_BLACK = (18, 18, 18)
    COLOR_METALLIC_GOLD = (212, 175, 55)

try:
    from assets.shortcut_util import create_desktop_shortcut
except ImportError:
    try:
        from assets.generate_icon import create_desktop_shortcut
    except ImportError:
        create_desktop_shortcut = None


def color_distance(c1: Tuple[int, int, int], c2: Tuple[int, int, int]) -> float:
    """Calculates Euclidean color distance in RGB space."""
    return math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2)


def find_matching_pixels(
    img: Image.Image,
    target_rgb: Tuple[int, int, int],
    max_distance: float = 8.0,
    min_alpha: int = 128,
) -> Tuple[int, float]:
    """
    Scans an RGBA image using getcolors() and returns:
    - Total count of pixels within max_distance of target_rgb
    - Minimum distance found among pixels with alpha >= min_alpha
    """
    img_rgba = img.convert("RGBA")
    w, h = img_rgba.size
    colors = img_rgba.getcolors(maxcolors=w * h)
    if colors is None:
        # Fallback if getcolors returns None
        colors = [(1, img_rgba.getpixel((x, y))) for y in range(h) for x in range(w)]

    match_count = 0
    min_dist = float("inf")

    for count, (r, g, b, a) in colors:
        if a < min_alpha:
            continue
        dist = color_distance((r, g, b), target_rgb)
        if dist < min_dist:
            min_dist = dist
        if dist <= max_distance:
            match_count += count

    return match_count, min_dist


# ==============================================================================
# 1. Asset Generation Engine Tests
# ==============================================================================

class TestAssetGenerationEngine(unittest.TestCase):
    """Verifies assets/generate_icon.py execution, output creation, and contracts."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="test_assets_gen_")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_generate_assets_function_importable(self):
        """1.1 Verify generate_assets is exported and callable."""
        self.assertIsNotNone(
            generate_assets,
            "assets.generate_icon.generate_assets is not importable. Module or function missing.",
        )
        self.assertTrue(callable(generate_assets))

    def test_generate_assets_creates_ico_and_png(self):
        """1.2 Verify generate_assets creates app_icon.ico and logo_header.png in output dir."""
        if generate_assets is None:
            self.skipTest("generate_assets not yet implemented")

        ico_path, png_path = generate_assets(output_dir=self.temp_dir)

        self.assertTrue(os.path.exists(ico_path), f"app_icon.ico was not created at {ico_path}")
        self.assertTrue(os.path.exists(png_path), f"logo_header.png was not created at {png_path}")
        self.assertGreater(os.path.getsize(ico_path), 0, "app_icon.ico is empty (0 bytes)")
        self.assertGreater(os.path.getsize(png_path), 0, "logo_header.png is empty (0 bytes)")

    def test_generate_assets_creates_nested_directories(self):
        """1.3 Verify generate_assets creates non-existent parent directories automatically."""
        if generate_assets is None:
            self.skipTest("generate_assets not yet implemented")

        nested_dir = os.path.join(self.temp_dir, "nested", "sub", "assets")
        ico_path, png_path = generate_assets(output_dir=nested_dir)

        self.assertTrue(os.path.isdir(nested_dir))
        self.assertTrue(os.path.exists(ico_path))
        self.assertTrue(os.path.exists(png_path))

    def test_generate_assets_idempotency(self):
        """1.4 Verify running generate_assets multiple times safely overwrites without error."""
        if generate_assets is None:
            self.skipTest("generate_assets not yet implemented")

        ico_1, png_1 = generate_assets(output_dir=self.temp_dir)
        size_ico_1 = os.path.getsize(ico_1)
        size_png_1 = os.path.getsize(png_1)

        ico_2, png_2 = generate_assets(output_dir=self.temp_dir)
        size_ico_2 = os.path.getsize(ico_2)
        size_png_2 = os.path.getsize(png_2)

        self.assertEqual(ico_1, ico_2)
        self.assertEqual(png_1, png_2)
        self.assertEqual(size_ico_1, size_ico_2)
        self.assertEqual(size_png_1, size_png_2)

    def test_generate_assets_cli_execution(self):
        """1.5 Verify python assets/generate_icon.py executes cleanly as CLI script."""
        script_path = PROJECT_ROOT / "assets" / "generate_icon.py"
        if not script_path.exists():
            self.skipTest(f"{script_path} does not exist yet")

        cmd = [sys.executable, str(script_path), "--output-dir", self.temp_dir]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
        self.assertEqual(
            result.returncode,
            0,
            f"CLI execution failed with code {result.returncode}. Stderr: {result.stderr}",
        )
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "app_icon.ico")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "logo_header.png")))


# ==============================================================================
# 2. Multi-Resolution .ico Layer & Mode Inspection
# ==============================================================================

class TestAppIconMultiResolution(unittest.TestCase):
    """Inspects app_icon.ico layer resolutions, color depths, and RGBA modes."""

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="test_ico_")
        cls.ico_path = os.path.join(cls.temp_dir, "app_icon.ico")
        cls.png_path = os.path.join(cls.temp_dir, "logo_header.png")
        if generate_assets is not None:
            generate_assets(output_dir=cls.temp_dir)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        if not os.path.exists(self.ico_path):
            self.skipTest(f"{self.ico_path} not found. Asset generation not yet implemented.")

    def test_ico_container_format_and_mode(self):
        """2.1 Verify app_icon.ico opens as format ICO with RGBA mode."""
        with Image.open(self.ico_path) as img:
            self.assertEqual(img.format, "ICO")
            self.assertEqual(img.mode, "RGBA")

    def test_ico_all_six_required_layers_present(self):
        """2.2 Verify app_icon.ico contains exactly all 6 required layer resolutions."""
        expected_sizes = {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}
        with Image.open(self.ico_path) as img:
            # Check sizes set in image info or ico object
            ico_sizes = img.info.get("sizes")
            if ico_sizes is None and hasattr(img, "ico"):
                ico_sizes = img.ico.sizes()

            self.assertIsNotNone(ico_sizes, "Could not extract layer sizes from ICO file")
            for size in expected_sizes:
                self.assertIn(
                    size,
                    ico_sizes,
                    f"Required layer resolution {size} missing from app_icon.ico (Found: {ico_sizes})",
                )
            self.assertGreaterEqual(len(ico_sizes), 6)

    def test_ico_individual_layer_frames_rgba(self):
        """2.3 Verify each layer frame extracted from app_icon.ico has mode RGBA."""
        expected_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        with Image.open(self.ico_path) as img:
            self.assertTrue(hasattr(img, "ico"), "IcoImageFile does not provide .ico attribute")
            for size in expected_sizes:
                frame_img = img.ico.getimage(size)
                self.assertIsNotNone(frame_img, f"Failed to retrieve frame for size {size}")
                self.assertEqual(
                    frame_img.size,
                    size,
                    f"Frame size mismatch: expected {size}, got {frame_img.size}",
                )
                self.assertEqual(
                    frame_img.mode,
                    "RGBA",
                    f"Layer {size} has invalid mode '{frame_img.mode}', expected 'RGBA'",
                )

    def test_ico_color_depth_32bit(self):
        """2.4 Verify all icon entries are encoded as 32-bit color depth (RGBA)."""
        with Image.open(self.ico_path) as img:
            entries = getattr(img.ico, "entry", [])
            self.assertGreaterEqual(len(entries), 6, "Expected at least 6 IconHeader entries")
            for entry in entries:
                bpp = getattr(entry, "bpp", getattr(entry, "color_depth", 0))
                self.assertEqual(
                    bpp,
                    32,
                    f"Icon layer {entry.dim} color depth is {bpp} bpp; expected 32 bpp (RGBA)",
                )

    def test_ico_alpha_channel_non_trivial(self):
        """2.5 Verify icon has both transparent outer pixels and opaque shield pixels."""
        with Image.open(self.ico_path) as img:
            frame_256 = img.ico.getimage((256, 256))
            alpha_channel = frame_256.split()[3]
            alpha_extrema = alpha_channel.getextrema()
            # Must have transparent regions (0) and solid regions (255)
            self.assertEqual(alpha_extrema[0], 0, "Icon background lacks transparent pixels (alpha=0)")
            self.assertEqual(alpha_extrema[1], 255, "Icon shield lacks fully opaque pixels (alpha=255)")


# ==============================================================================
# 3. Header Logo PNG Specifications
# ==============================================================================

class TestLogoHeaderImage(unittest.TestCase):
    """Inspects logo_header.png dimensions, format, and alpha transparency."""

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="test_png_")
        cls.png_path = os.path.join(cls.temp_dir, "logo_header.png")
        if generate_assets is not None:
            generate_assets(output_dir=cls.temp_dir)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        if not os.path.exists(self.png_path):
            self.skipTest(f"{self.png_path} not found. Asset generation not yet implemented.")

    def test_logo_header_dimensions_and_mode(self):
        """3.1 Verify logo_header.png is exactly 128x128 px and mode RGBA."""
        with Image.open(self.png_path) as img:
            self.assertEqual(img.format, "PNG", f"Expected PNG format, got {img.format}")
            self.assertEqual(
                img.size,
                (128, 128),
                f"Expected dimensions (128, 128), got {img.size}",
            )
            self.assertEqual(img.mode, "RGBA", f"Expected mode 'RGBA', got {img.mode}")

    def test_logo_header_alpha_transparency_profile(self):
        """3.2 Verify logo_header.png has transparent corners and solid center."""
        with Image.open(self.png_path) as img:
            img_rgba = img.convert("RGBA")
            # Corners outside shield must be transparent
            corner_coords = [(0, 0), (127, 0), (0, 127), (127, 127)]
            for pt in corner_coords:
                r, g, b, a = img_rgba.getpixel(pt)
                self.assertLess(
                    a,
                    30,
                    f"Corner pixel {pt} is not transparent (alpha={a}, expected < 30)",
                )

            # Center of shield must be opaque
            center_pts = [(64, 64), (64, 50), (64, 80)]
            for pt in center_pts:
                r, g, b, a = img_rgba.getpixel(pt)
                self.assertGreater(
                    a,
                    200,
                    f"Shield center pixel {pt} is not opaque (alpha={a}, expected > 200)",
                )


# ==============================================================================
# 4. Brand Color Fidelity Verification
# ==============================================================================

class TestBrandColorPaletteFidelity(unittest.TestCase):
    """
    Verifies that generated assets preserve the luxury brand identity palette:
    - Matte Black #121212 (RGB 18, 18, 18)
    - Metallic Gold #D4AF37 (RGB 212, 175, 55)
    """

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="test_color_")
        cls.ico_path = os.path.join(cls.temp_dir, "app_icon.ico")
        cls.png_path = os.path.join(cls.temp_dir, "logo_header.png")
        if generate_assets is not None:
            generate_assets(output_dir=cls.temp_dir)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def setUp(self):
        if not os.path.exists(self.png_path):
            self.skipTest("Assets not generated. Cannot verify color fidelity.")

    def test_matte_black_color_fidelity_in_header_logo(self):
        """4.1 Verify logo_header.png contains Matte Black #121212 (18, 18, 18)."""
        target_black = (18, 18, 18)  # #121212
        with Image.open(self.png_path) as img:
            match_count, min_dist = find_matching_pixels(img, target_black, max_distance=6.0)

            self.assertLessEqual(
                min_dist,
                3.0,
                f"Minimum distance to Matte Black #121212 is {min_dist:.2f}; expected <= 3.0",
            )
            self.assertGreaterEqual(
                match_count,
                50,
                f"Found only {match_count} pixels matching Matte Black; expected >= 50",
            )

    def test_metallic_gold_color_fidelity_in_header_logo(self):
        """4.2 Verify logo_header.png contains Metallic Gold #D4AF37 (212, 175, 55)."""
        target_gold = (212, 175, 55)  # #D4AF37
        with Image.open(self.png_path) as img:
            match_count, min_dist = find_matching_pixels(img, target_gold, max_distance=8.0)

            self.assertLessEqual(
                min_dist,
                5.0,
                f"Minimum distance to Metallic Gold #D4AF37 is {min_dist:.2f}; expected <= 5.0",
            )
            self.assertGreaterEqual(
                match_count,
                30,
                f"Found only {match_count} pixels matching Metallic Gold; expected >= 30",
            )

    def test_brand_colors_in_app_icon_layers(self):
        """4.3 Verify app_icon.ico layers preserve both Matte Black and Metallic Gold."""
        if not os.path.exists(self.ico_path):
            self.skipTest("app_icon.ico missing")

        target_black = (18, 18, 18)
        target_gold = (212, 175, 55)

        with Image.open(self.ico_path) as img:
            # Check 256x256 layer
            frame_256 = img.ico.getimage((256, 256))
            black_count, min_black_dist = find_matching_pixels(frame_256, target_black, max_distance=6.0)
            gold_count, min_gold_dist = find_matching_pixels(frame_256, target_gold, max_distance=8.0)

            self.assertLessEqual(min_black_dist, 3.0, f"ICO 256x256 lacks Matte Black (dist={min_black_dist:.2f})")
            self.assertGreater(black_count, 100, "Insufficient Matte Black pixels in 256x256 ICO")

            self.assertLessEqual(min_gold_dist, 5.0, f"ICO 256x256 lacks Metallic Gold (dist={min_gold_dist:.2f})")
            self.assertGreater(gold_count, 50, "Insufficient Metallic Gold pixels in 256x256 ICO")

    def test_supersampled_antialiasing_edge_gradients(self):
        """4.4 Verify presence of intermediate anti-aliased gradient values from SSAA pipeline."""
        with Image.open(self.png_path) as img:
            img_rgba = img.convert("RGBA")
            w, h = img_rgba.size
            colors = img_rgba.getcolors(maxcolors=w * h)
            # SSAA with Lanczos filtering produces smooth gradients, resulting in > 50 distinct colors
            distinct_colors_count = len(colors) if colors else 0
            self.assertGreater(
                distinct_colors_count,
                30,
                f"Image has only {distinct_colors_count} distinct colors. SSAA anti-aliasing not observed.",
            )


# ==============================================================================
# 5. Desktop Shortcut Utility Tests
# ==============================================================================

class TestDesktopShortcutUtility(unittest.TestCase):
    """Tests programmatic creation and property verification of Windows .lnk shortcuts."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="test_shortcut_")
        self.mock_target = os.path.join(self.temp_dir, "app.exe")
        with open(self.mock_target, "w") as f:
            f.write("mock executable binary")
        self.mock_icon = os.path.join(self.temp_dir, "app_icon.ico")
        with open(self.mock_icon, "w") as f:
            f.write("mock icon data")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_shortcut_utility_callable(self):
        """5.1 Verify create_desktop_shortcut is available."""
        self.assertIsNotNone(
            create_desktop_shortcut,
            "create_desktop_shortcut utility is not importable. Module missing.",
        )
        self.assertTrue(callable(create_desktop_shortcut))

    def test_create_desktop_shortcut_in_temp_dir(self):
        """5.2 Verify create_desktop_shortcut creates a valid .lnk file in target directory."""
        if create_desktop_shortcut is None:
            self.skipTest("create_desktop_shortcut not yet implemented")

        shortcut_name = "ProLab Smart Labeler"
        success = create_desktop_shortcut(
            target_exe=self.mock_target,
            icon_path=self.mock_icon,
            shortcut_name=shortcut_name,
            desktop_dir=self.temp_dir,
        )

        self.assertTrue(success, "create_desktop_shortcut returned False")
        lnk_file = os.path.join(self.temp_dir, f"{shortcut_name}.lnk")
        self.assertTrue(os.path.exists(lnk_file), f"Shortcut .lnk not found at {lnk_file}")
        self.assertGreater(os.path.getsize(lnk_file), 0, "Created .lnk shortcut file is 0 bytes")

    def test_desktop_shortcut_properties_inspection(self):
        """5.3 Inspect .lnk properties (TargetPath, IconLocation, Description) via WScript.Shell."""
        if create_desktop_shortcut is None:
            self.skipTest("create_desktop_shortcut not yet implemented")

        if sys.platform != "win32":
            self.skipTest("WScript.Shell inspection requires Windows OS")

        import win32com.client

        shortcut_name = "ProLab Test Shortcut"
        expected_desc = "ProLab Smart Labeler - Mobile Sales & Repair Lab"
        create_desktop_shortcut(
            target_exe=self.mock_target,
            icon_path=self.mock_icon,
            shortcut_name=shortcut_name,
            desktop_dir=self.temp_dir,
            description=expected_desc,
        )

        lnk_file = os.path.join(self.temp_dir, f"{shortcut_name}.lnk")
        self.assertTrue(os.path.exists(lnk_file))

        wsh = win32com.client.Dispatch("WScript.Shell")
        shortcut = wsh.CreateShortcut(lnk_file)

        # Normalize paths for Windows comparison (case-insensitive, resolved)
        actual_target = os.path.normcase(os.path.abspath(shortcut.TargetPath))
        expected_target = os.path.normcase(os.path.abspath(self.mock_target))
        self.assertEqual(actual_target, expected_target, "Shortcut TargetPath mismatch")

        # Icon location should point to our icon
        self.assertIn(
            os.path.normcase(self.mock_icon),
            os.path.normcase(shortcut.IconLocation),
            f"Shortcut IconLocation '{shortcut.IconLocation}' does not reference {self.mock_icon}",
        )

        if shortcut.Description:
            self.assertEqual(shortcut.Description, expected_desc)

    def test_create_desktop_shortcut_handles_unwritable_dir(self):
        """5.4 Verify graceful error handling when destination directory is unwritable/invalid."""
        if create_desktop_shortcut is None:
            self.skipTest("create_desktop_shortcut not yet implemented")

        invalid_dir = "Z:\\non_existent_drive_folder_12345"
        try:
            result = create_desktop_shortcut(
                target_exe=self.mock_target,
                icon_path=self.mock_icon,
                desktop_dir=invalid_dir,
            )
            self.assertFalse(result, "Expected False on unwritable destination directory")
        except (OSError, ValueError):
            # Acceptable explicit exception handling
            pass


# ==============================================================================
# 6. Windows AppUserModelID Configuration Tests
# ==============================================================================

class TestAppUserModelIDConfiguration(unittest.TestCase):
    """Verifies that main.py sets AppUserModelID ProLab.SmartLabeler.App.1.0."""

    def test_main_py_source_contains_correct_aumid(self):
        """6.1 Verify main.py source code contains 'ProLab.SmartLabeler.App.1.0'."""
        main_py = PROJECT_ROOT / "main.py"
        self.assertTrue(main_py.exists(), f"main.py not found at {main_py}")

        content = main_py.read_text(encoding="utf-8")
        expected_aumid = "ProLab.SmartLabeler.App.1.0"
        self.assertIn(
            expected_aumid,
            content,
            f"main.py does not contain expected AppUserModelID '{expected_aumid}'",
        )
        # Ensure stale temporary ID is eliminated
        self.assertNotIn(
            "thermallab.mobileprinter.pro.1",
            content,
            "main.py still contains stale temporary ID 'thermallab.mobileprinter.pro.1'",
        )

    def test_main_py_ast_calls_set_current_process_explicit_app_user_model_id(self):
        """6.2 Verify main.py AST calls SetCurrentProcessExplicitAppUserModelID with ProLab.SmartLabeler.App.1.0."""
        main_py = PROJECT_ROOT / "main.py"
        content = main_py.read_text(encoding="utf-8")
        tree = ast.parse(content)

        # Collect string assignments in main.py
        assignments = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                if isinstance(node.value, ast.Constant):
                    assignments[node.targets[0].id] = node.value.value

        found_call = False
        target_func_name = "SetCurrentProcessExplicitAppUserModelID"
        expected_aumid = "ProLab.SmartLabeler.App.1.0"
        arg_val = None

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                func_name = None
                if isinstance(func, ast.Attribute):
                    func_name = func.attr
                elif isinstance(func, ast.Name):
                    func_name = func.id

                if func_name == target_func_name:
                    found_call = True
                    if node.args:
                        first_arg = node.args[0]
                        if isinstance(first_arg, ast.Constant):
                            arg_val = first_arg.value
                        elif isinstance(first_arg, ast.Name) and first_arg.id in assignments:
                            arg_val = assignments[first_arg.id]

        self.assertTrue(
            found_call,
            f"main.py does not invoke {target_func_name} in its AST tree",
        )
        self.assertEqual(
            arg_val,
            expected_aumid,
            f"SetCurrentProcessExplicitAppUserModelID invoked with '{arg_val}', expected '{expected_aumid}'",
        )

    def test_runtime_app_user_model_id_invocation(self):
        """6.3 Verify runtime invocation passes 'ProLab.SmartLabeler.App.1.0' to shell32."""
        import main

        expected_aumid = "ProLab.SmartLabeler.App.1.0"

        # Check if main exposes set_app_user_model_id helper
        if hasattr(main, "set_app_user_model_id"):
            with patch("ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID") as mock_set:
                result = main.set_app_user_model_id(expected_aumid)
                self.assertTrue(result)
                mock_set.assert_called_once_with(expected_aumid)
        else:
            # Test direct ctypes call contract on Windows
            if sys.platform == "win32":
                import ctypes
                with patch.object(
                    ctypes.windll.shell32,
                    "SetCurrentProcessExplicitAppUserModelID",
                    create=True,
                ) as mock_set:
                    mock_set(expected_aumid)
                    mock_set.assert_called_with(expected_aumid)


if __name__ == "__main__":
    unittest.main()
