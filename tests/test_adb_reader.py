"""
Unit tests for Android & Fastboot Extraction Engine (core/adb_reader.py).
Tests storage boundary thresholds, RAM boundary thresholds, OEM model resolvers,
IMEI extraction with Luhn verification, battery telemetry, and Fastboot parsers.
"""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from core.adb_reader import (
    sanitize_adb_output,
    parse_storage_from_df,
    parse_android_commercial_storage,
    parse_ram_from_meminfo,
    parse_android_commercial_ram,
    validate_luhn,
    validate_luhn_imei,
    parse_imei_from_service_call,
    resolve_marketing_name,
    resolve_samsung_model,
    decode_samsung_product_code,
    resolve_oem_color_from_props,
    extract_imei_from_properties,
    extract_imei_from_fastboot,
    parse_battery_info,
    parse_bootloader_status,
    parse_fastboot_devices,
    AdbReader,
)
from core.paths import (
    get_adb_keys_dir,
    setup_adb_environment,
    ensure_keypair_exists,
    ensure_adb_keypair_exists,
)


class TestAdbSanitization(unittest.TestCase):
    """Tests ADB stdout sanitization against transient daemon startup messages."""

    def test_strip_daemon_notices(self):
        raw = (
            "* daemon not running; starting now at tcp:5037 *\n"
            "* daemon started successfully *\n"
            "List of devices attached\n"
            "R5CX109876U\tdevice\n"
        )
        clean = sanitize_adb_output(raw)
        self.assertNotIn("* daemon", clean)
        self.assertIn("List of devices attached", clean)
        self.assertIn("R5CX109876U\tdevice", clean)

    def test_strip_daemon_restart_clash(self):
        raw = (
            "adb server version (40) doesn't match this client (41); killing...\n"
            "* daemon started successfully *\n"
            "samsung\n"
        )
        clean = sanitize_adb_output(raw)
        self.assertEqual(clean, "samsung")


class TestCommercialStorageParsing(unittest.TestCase):
    """Validates deterministic mapping from raw /data 1K-blocks to commercial sizes."""

    def test_standard_df_toybox(self):
        df_out = (
            "Filesystem      1K-blocks      Used Available Use% Mounted on\n"
            "/dev/block/dm-7 114688000  42104320  72583680  37% /data\n"
        )
        self.assertEqual(parse_storage_from_df(df_out), "128GB")

    def test_standard_df_busybox(self):
        df_out = "/dev/block/bootdevice/by-name/userdata 458752000 120400000 338352000 27% /data"
        self.assertEqual(parse_storage_from_df(df_out), "512GB")

    def test_storage_boundary_thresholds(self):
        # 16GB: <= 18.0 GB
        self.assertEqual(parse_storage_from_df("/dev/data 17578125 0 0 0% /data"), "16GB")
        # 32GB: 18.0 < GB <= 36.0
        self.assertEqual(parse_storage_from_df("/dev/data 17675781 0 0 0% /data"), "32GB")
        self.assertEqual(parse_storage_from_df("/dev/data 35156250 0 0 0% /data"), "32GB")
        # 64GB: 36.0 < GB <= 72.0
        self.assertEqual(parse_storage_from_df("/dev/data 36132812 0 0 0% /data"), "64GB")
        self.assertEqual(parse_storage_from_df("/dev/data 70312500 0 0 0% /data"), "64GB")
        # 128GB: 72.0 < GB <= 145.0
        self.assertEqual(parse_storage_from_df("/dev/data 71289062 0 0 0% /data"), "128GB")
        self.assertEqual(parse_storage_from_df("/dev/data 141601562 0 0 0% /data"), "128GB")
        # 256GB: 145.0 < GB <= 290.0
        self.assertEqual(parse_storage_from_df("/dev/data 142578125 0 0 0% /data"), "256GB")
        self.assertEqual(parse_storage_from_df("/dev/data 283203125 0 0 0% /data"), "256GB")
        # 512GB: 290.0 < GB <= 580.0
        self.assertEqual(parse_storage_from_df("/dev/data 284179687 0 0 0% /data"), "512GB")
        self.assertEqual(parse_storage_from_df("/dev/data 566406250 0 0 0% /data"), "512GB")
        # 1TB: 580.0 < GB <= 1150.0
        self.assertEqual(parse_storage_from_df("/dev/data 567382812 0 0 0% /data"), "1TB")
        self.assertEqual(parse_storage_from_df("/dev/data 1123046875 0 0 0% /data"), "1TB")

    def test_direct_commercial_storage_calc(self):
        self.assertEqual(parse_android_commercial_storage(55000000), "64GB")
        self.assertEqual(parse_android_commercial_storage(114688000), "128GB")
        self.assertEqual(parse_android_commercial_storage(235929600), "256GB")
        self.assertEqual(parse_android_commercial_storage(488281250), "512GB")
        self.assertEqual(parse_android_commercial_storage(976562500), "1TB")

    def test_storage_empty_or_permission_denied(self):
        self.assertEqual(parse_storage_from_df(""), "Unknown")
        self.assertEqual(parse_storage_from_df("/data: Permission denied"), "Unknown")


class TestCommercialRamParsing(unittest.TestCase):
    """Validates deterministic mapping from /proc/meminfo MemTotal to commercial RAM tiers."""

    def test_meminfo_standard(self):
        meminfo = (
            "MemTotal:        7854320 kB\n"
            "MemFree:          245120 kB\n"
            "MemAvailable:    3845600 kB\n"
        )
        self.assertEqual(parse_ram_from_meminfo(meminfo), "8GB")

    def test_ram_boundary_thresholds(self):
        # 2GB: <= 2300 MB (2355200 kB)
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2048000 kB"), "2GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2355200 kB"), "2GB")
        # 3GB: 2300 < MB <= 3400
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 2356224 kB"), "3GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 3481600 kB"), "3GB")
        # 4GB: 3400 < MB <= 4600
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 3876124 kB"), "4GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 4710400 kB"), "4GB")
        # 6GB: 4600 < MB <= 6800
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 5812300 kB"), "6GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 6963200 kB"), "6GB")
        # 8GB: 6800 < MB <= 9500
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 7854320 kB"), "8GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 9728000 kB"), "8GB")
        # 12GB: 9500 < MB <= 14000
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 11854320 kB"), "12GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 14336000 kB"), "12GB")
        # 16GB: 14000 < MB <= 19000
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 15642100 kB"), "16GB")
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 19456000 kB"), "16GB")
        # 24GB: > 19000 MB
        self.assertEqual(parse_ram_from_meminfo("MemTotal: 24576000 kB"), "24GB")

    def test_direct_commercial_ram_calc(self):
        self.assertEqual(parse_android_commercial_ram(3854320), "4GB")
        self.assertEqual(parse_android_commercial_ram(5854320), "6GB")
        self.assertEqual(parse_android_commercial_ram(7854320), "8GB")
        self.assertEqual(parse_android_commercial_ram(11854320), "12GB")
        self.assertEqual(parse_android_commercial_ram(15854320), "16GB")
        self.assertEqual(parse_android_commercial_ram(24000000), "24GB")

    def test_meminfo_malformed(self):
        self.assertEqual(parse_ram_from_meminfo("cat: /proc/meminfo: No such file"), "Unknown")
        self.assertEqual(parse_ram_from_meminfo(""), "Unknown")


class TestMarketingModelResolver(unittest.TestCase):
    """Validates commercial brand and model resolution across Samsung, Xiaomi, Oppo, and OnePlus."""

    def test_samsung_flagship_resolvers(self):
        self.assertEqual(resolve_marketing_name("SM-S928B", "samsung"), ("Samsung", "Galaxy S24 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S928U", "samsung"), ("Samsung", "Galaxy S24 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S926B", "samsung"), ("Samsung", "Galaxy S24+"))
        self.assertEqual(resolve_marketing_name("SM-S921B", "samsung"), ("Samsung", "Galaxy S24"))
        self.assertEqual(resolve_marketing_name("SM-S918B", "samsung"), ("Samsung", "Galaxy S23 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-S908U", "samsung"), ("Samsung", "Galaxy S22 Ultra"))
        self.assertEqual(resolve_marketing_name("SM-G998B", "samsung"), ("Samsung", "Galaxy S21 Ultra 5G"))
        self.assertEqual(resolve_marketing_name("SM-N986B", "samsung"), ("Samsung", "Galaxy Note 20 Ultra 5G"))
        self.assertEqual(resolve_marketing_name("SM-F946B", "samsung"), ("Samsung", "Galaxy Z Fold 5"))
        self.assertEqual(resolve_marketing_name("SM-F731B", "samsung"), ("Samsung", "Galaxy Z Flip 5"))

    def test_samsung_a_series_resolvers(self):
        self.assertEqual(resolve_marketing_name("SM-A556B", "samsung"), ("Samsung", "Galaxy A55 5G"))
        self.assertEqual(resolve_marketing_name("SM-A546U", "samsung"), ("Samsung", "Galaxy A54 5G"))
        self.assertEqual(resolve_marketing_name("SM-A155F", "samsung"), ("Samsung", "Galaxy A15"))

    def test_resolve_samsung_model_helper(self):
        self.assertEqual(resolve_samsung_model("SM-S928B"), "Galaxy S24 Ultra")
        self.assertEqual(resolve_samsung_model("SM-S918U"), "Galaxy S23 Ultra")
        self.assertIsNone(resolve_samsung_model("Pixel 8"))

    def test_xiaomi_code_resolvers(self):
        self.assertEqual(resolve_marketing_name("2312DRA50G", "Xiaomi"), ("Redmi", "Redmi Note 13 Pro 5G"))
        self.assertEqual(resolve_marketing_name("23049PCD8G", "Xiaomi"), ("POCO", "POCO F5"))
        self.assertEqual(resolve_marketing_name("2210132G", "Xiaomi"), ("Xiaomi", "Xiaomi 13 Pro"))

    def test_oppo_oneplus_resolvers(self):
        self.assertEqual(resolve_marketing_name("CPH2581", "OnePlus"), ("OnePlus", "OnePlus 12"))
        self.assertEqual(resolve_marketing_name("RMX3820", "realme"), ("Realme", "Realme GT Neo 5"))

    def test_google_pixel_resolver(self):
        self.assertEqual(resolve_marketing_name("Pixel 8 Pro", "Google"), ("Google", "Pixel 8 Pro"))

    def test_explicit_marketname_priority(self):
        brand, model = resolve_marketing_name("2312DRA50G", "Xiaomi", marketname="Redmi Note 13 Pro 5G Special Edition")
        self.assertEqual(model, "Redmi Note 13 Pro 5G Special Edition")


class TestImeiExtraction(unittest.TestCase):
    """Validates multi-strategy IMEI parcel decoding and Luhn validation."""

    def test_luhn_algorithm_validation(self):
        # Mathematically valid 15-digit Luhn IMEIs
        self.assertTrue(validate_luhn("358901234567896"))
        self.assertTrue(validate_luhn("351782110293840"))
        self.assertTrue(validate_luhn("358901230192830"))
        # Tampered check digits
        self.assertFalse(validate_luhn("358901234567895"))
        self.assertFalse(validate_luhn("351782110293849"))
        # Invalid lengths
        self.assertFalse(validate_luhn("35178211029384"))
        self.assertFalse(validate_luhn("3517821102938466"))
        # Non-digits
        self.assertFalse(validate_luhn("35178211029384A"))

    def test_parse_imei_service_call_parcel(self):
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00380033 00310035 '........3.5.8.9.'\n"
            "  0x00000010: 00380032 00310031 00300032 00390033 '.0.1.2.3.4.5.6.7.'\n"
            "  0x00000020: 00380034 00000036                   '.8.9.6..        ')\n"
        )
        imei = parse_imei_from_service_call(parcel)
        self.assertEqual(imei, "358901234567896")
        self.assertTrue(validate_luhn(imei))


class TestBatteryParsing(unittest.TestCase):
    """Validates battery level, health code, and cycle count extraction."""

    def test_dumpsys_battery_parsing(self):
        output = (
            "Current Battery Service state:\n"
            "  AC powered: false\n"
            "  USB powered: true\n"
            "  status: 2\n"
            "  health: 2\n"
            "  present: true\n"
            "  level: 85\n"
            "  scale: 100\n"
            "  charge counter: 3450000\n"
            "  cycle_count: 45\n"
        )
        level, health_pct, cycles = parse_battery_info(output)
        self.assertEqual(level, 85)
        self.assertEqual(health_pct, 95)
        self.assertEqual(cycles, 45)

    def test_asoc_battery_parsing(self):
        output = (
            "  level: 92\n"
            "  scale: 100\n"
            "  health: 2\n"
            "  mSavedBatteryAsoc: 98\n"
            "  mSavedBatteryUsage: 64\n"
        )
        level, health_pct, cycles = parse_battery_info(output)
        self.assertEqual(level, 92)
        self.assertEqual(health_pct, 98)
        self.assertEqual(cycles, 64)


class TestBootloaderAndFastboot(unittest.TestCase):
    """Validates bootloader status resolution and fastboot device listing."""

    def test_bootloader_status_parsing(self):
        self.assertTrue(parse_bootloader_status("1", "green"))
        self.assertFalse(parse_bootloader_status("0", "orange"))
        self.assertTrue(parse_bootloader_status("locked", "unknown"))
        self.assertFalse(parse_bootloader_status("unlocked", "unknown"))

    def test_fastboot_devices_parsing(self):
        raw = (
            "0x9a8b7c6d\tfastboot\n"
            "2312DRA50G\tfastboot\n"
        )
        serials = parse_fastboot_devices(raw)
        self.assertEqual(serials, ["0x9a8b7c6d", "2312DRA50G"])


class TestPortableAdbKeyVault(unittest.TestCase):
    """Validates portable ADB key vault directory, environment injection, and key persistence."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_adb_keys_dir_resolution_and_creation(self):
        vault_dir = get_adb_keys_dir(self.base_dir)
        self.assertEqual(vault_dir, (self.base_dir / "data" / "adb_keys"))
        self.assertTrue(vault_dir.exists())

    def test_setup_adb_environment_variables(self):
        env = setup_adb_environment(self.base_dir)
        v_str = str((self.base_dir / "data" / "adb_keys").resolve())
        self.assertEqual(env["ANDROID_SDK_HOME"], v_str)
        self.assertEqual(env["ANDROID_PREFS_ROOT"], v_str)
        self.assertTrue(v_str in env["ADB_VENDOR_KEYS"])
        self.assertTrue(v_str in os.environ.get("ADB_VENDOR_KEYS", ""))

    def test_ensure_keypair_creates_and_persists_keys(self):
        vault_dir = get_adb_keys_dir(self.base_dir)
        priv, pub = ensure_keypair_exists(vault_dir)
        self.assertTrue(priv.exists())
        self.assertTrue(pub.exists())
        self.assertIn("PRIVATE KEY", priv.read_text(encoding="utf-8"))
        self.assertIn("adbkey.pub", pub.read_text(encoding="utf-8"))

        # Verify persistence without modification
        original_priv_content = priv.read_text(encoding="utf-8")
        ensure_adb_keypair_exists(vault_dir)
        self.assertEqual(priv.read_text(encoding="utf-8"), original_priv_content)

    def test_corrupted_zero_byte_key_recovery(self):
        vault_dir = get_adb_keys_dir(self.base_dir)
        priv = vault_dir / "adbkey"
        priv.write_text("", encoding="utf-8")
        ensure_keypair_exists(vault_dir)
        self.assertGreater(priv.stat().st_size, 0)
        self.assertIn("PRIVATE KEY", priv.read_text(encoding="utf-8"))

    def test_adb_reader_initializes_vault_state(self):
        reader = AdbReader(base_dir=self.base_dir)
        self.assertEqual(reader.adb_keys_dir, (self.base_dir / "data" / "adb_keys"))
        self.assertTrue((reader.adb_keys_dir / "adbkey").exists())
        self.assertTrue((reader.adb_keys_dir / "adbkey.pub").exists())
        self.assertTrue(str(reader.adb_keys_dir.resolve()) in reader.adb_env["ADB_VENDOR_KEYS"])


class TestAndroidMultiLayerExtraction(unittest.TestCase):
    """Validates Layer 1 parcel, Layer 2 props, Layer 3 fastboot, and Luhn checksum."""

    def test_validate_luhn_imei_function_and_alias(self):
        self.assertTrue(validate_luhn_imei("358901234567896"))
        self.assertFalse(validate_luhn_imei("358901234567895"))
        # Must reject 15 zeros
        self.assertFalse(validate_luhn_imei("000000000000000"))
        # Must reject None / empty
        self.assertFalse(validate_luhn_imei(None))
        self.assertFalse(validate_luhn_imei(""))

    def test_parse_imei_service_call_strategy_b_hex_words(self):
        # Truncated dump where quoted ASCII characters on right are absent or empty
        parcel = (
            "Result: Parcel(\n"
            "  0x00000000: 00000000 0000000f 00350033 00390038\n"
            "  0x00000010: 00310030 00330032 00350034 00370036\n"
            "  0x00000020: 00390038 00000036\n"
            ")"
        )
        imei = parse_imei_from_service_call(parcel)
        self.assertIsNotNone(imei)
        self.assertEqual(len(imei), 15)
        self.assertTrue(validate_luhn(imei))
        self.assertEqual(imei, "358901234567896")

    def test_extract_imei_from_oem_properties_matrix(self):
        # Layer 2 OEM properties fallback
        props = {
            "ro.product.model": "SM-G998B",
            "ro.ril.oem.imei": "358901234567896, 351782110293840",
            "persist.radio.imei": "358901234567896"
        }
        imei1, imei2 = extract_imei_from_properties(props)
        self.assertEqual(imei1, "358901234567896")
        self.assertEqual(imei2, "351782110293840")

    def test_extract_imei_from_fastboot(self):
        with patch("core.adb_reader.run_cmd") as mock_cmd:
            # Mock getvar imei returning valid 15-digit Luhn
            mock_cmd.side_effect = [
                (0, "imei: 358901234567896\nfinished. total time: 0.005s", ""),
                (0, "imei2: 351782110293840\nfinished. total time: 0.005s", "")
            ]
            imei1, imei2 = extract_imei_from_fastboot("TESTSERIAL", "fastboot")
            self.assertEqual(imei1, "358901234567896")
            self.assertEqual(imei2, "351782110293840")


class TestMultiOemColorResolver(unittest.TestCase):
    """Validates Samsung product code decoding and multi-OEM property resolution."""

    def test_decode_samsung_product_code_tokens(self):
        self.assertEqual(decode_samsung_product_code("SM-S928BZKG"), "Black")
        self.assertEqual(decode_samsung_product_code("SM-S928BZKA"), "Black")
        self.assertEqual(decode_samsung_product_code("SM-S928BZWG"), "White")
        self.assertEqual(decode_samsung_product_code("SM-S928BZWA"), "White")
        self.assertEqual(decode_samsung_product_code("SM-S918BZGA"), "Green")
        self.assertEqual(decode_samsung_product_code("SM-S918BZVA"), "Violet")
        self.assertEqual(decode_samsung_product_code("SM-S918BZBA"), "Blue")
        self.assertEqual(decode_samsung_product_code("SM-S918BZDA"), "Gold")
        self.assertEqual(decode_samsung_product_code("SM-S928BZTA"), "Titanium Gray")

    def test_decode_samsung_product_code_with_csc(self):
        # 3-letter CSC region suffix (e.g. EUX)
        self.assertEqual(decode_samsung_product_code("SM-S928BZKGEUX"), "Black")
        self.assertEqual(decode_samsung_product_code("SM-S928BZTAEUX"), "Titanium Gray")

    def test_resolve_oem_color_from_props_hierarchy(self):
        # Xiaomi
        self.assertEqual(resolve_oem_color_from_props({"ro.product.SystemColor": "Midnight Black"}), "Midnight Black")
        self.assertEqual(resolve_oem_color_from_props({"ro.boot.hwc": "BLUE"}), "BLUE")
        # Oppo
        self.assertEqual(resolve_oem_color_from_props({"ro.hw.phone.color": "Sunset Orange"}), "Sunset Orange")
        # Pixel
        self.assertEqual(resolve_oem_color_from_props({"ro.boot.hardware.color": "Obsidian"}), "Obsidian")
        self.assertEqual(resolve_oem_color_from_props({"ro.boot.hardware.color": "bay"}), "Bay Blue")
        # Samsung
        self.assertEqual(resolve_oem_color_from_props({"ril.product_code": "SM-S928BZKGEUX"}), "Black")

    def test_resolve_oem_color_tac_fallback(self):
        tac_store = {"35890123": "Emerald Green"}
        color = resolve_oem_color_from_props(
            {},
            imei1="358901234567896",
            model_code="SM-S928B",
            tac_lookup_fn=lambda tac, model: tac_store.get(tac)
        )
        self.assertEqual(color, "Emerald Green")


if __name__ == "__main__":
    unittest.main()

