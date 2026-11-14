"""
Milestone 1 Adversarial Stress Test Suite.
Adversarially stress-tests edge cases, malformed data, extreme values, and crash resilience across:
- core.adb_reader
- core.ios_reader
- core.mock_device
- core.models
"""
import json
import os
import plistlib
import unittest
from typing import Any, Dict

from core.models import DeviceSpecs, RepairTicket
from core.adb_reader import (
    parse_android_commercial_storage,
    parse_storage_from_df,
    parse_android_commercial_ram,
    parse_ram_from_meminfo,
    resolve_marketing_name,
    resolve_samsung_model,
    validate_luhn,
    parse_imei_from_service_call,
    parse_battery_info,
    parse_bootloader_status,
    sanitize_adb_output,
)
from core.ios_reader import (
    parse_ideviceinfo_xml,
    calculate_ios_battery_health,
    resolve_apple_model,
    parse_ios_commercial_storage,
    decode_apple_region,
    resolve_apple_color,
    parse_apple_part_and_region,
)
from core.mock_device import (
    calculate_luhn_check_digit,
    validate_luhn_imei,
    generate_luhn_imei,
    generate_random_profile,
    MockDeviceProvider,
    PRECONFIGURED_PROFILES,
)


class TestAdversarialIosXmlAndPlist(unittest.TestCase):
    """1. Malformed XML and corrupt plist inputs to parse_ideviceinfo_xml."""

    def test_corrupt_xml_syntax(self):
        """Malformed XML syntax and binary junk should return None without crashing."""
        corrupt_inputs = [
            "",
            "   \n\t",
            "This is completely unparseable plain text",
            "<?xml version=\"1.0\"?><plist><dict><key>ProductType</key>",  # unclosed tags
            "<xml><broken></unmatched></xml>",
            b"\x00\x01\x02\xff\xfe\xca\xfe\xba\xbe",  # raw binary garbage
            "<!DOCTYPE plist [ <!ENTITY xxe SYSTEM 'file:///dev/random'> ]><plist></plist>",
        ]
        for item in corrupt_inputs:
            with self.subTest(item=item[:30] if isinstance(item, (str, bytes)) else item):
                try:
                    result = parse_ideviceinfo_xml(item)
                    self.assertIsNone(result)
                except Exception as e:
                    self.fail(f"parse_ideviceinfo_xml raised unhandled {type(e).__name__}: {e}")

    def test_non_dict_plist_root_crash(self):
        """
        VULNERABILITY CHECK: Plists with valid XML syntax but non-dict root.
        E.g. <plist><array>...</plist> or <plist><string>...</plist>.
        The parser must handle non-dict root without crashing with AttributeError.
        """
        test_roots = [
            ["iPhone16,1", "128GB"],
            "Just a string plist root",
            12345678,
            3.14159,
            True,
        ]
        for root in test_roots:
            payload = plistlib.dumps(root)
            with self.subTest(root_type=type(root).__name__):
                try:
                    result = parse_ideviceinfo_xml(payload)
                    self.assertIsNone(result, f"Expected None for non-dict root, got {result}")
                except Exception as e:
                    self.fail(f"VULNERABILITY: parse_ideviceinfo_xml crashed with {type(e).__name__} on root type {type(root).__name__}: {e}")

    def test_plist_with_corrupt_or_unexpected_types_crash(self):
        """
        VULNERABILITY CHECK: Plists where TotalDiskCapacity is not an integer.
        E.g. TotalDiskCapacity is string 'corrupted_capacity_string' or a dictionary.
        The parser must not crash with ValueError or TypeError.
        """
        test_payloads = [
            # TotalDiskCapacity is string
            {"ProductType": "iPhone16,1", "TotalDiskCapacity": "corrupted_capacity_string"},
            # TotalDiskCapacity is dict
            {"ProductType": "iPhone16,1", "TotalDiskCapacity": {"nested": "value"}},
            # TotalDiskCapacity is list
            {"ProductType": "iPhone16,1", "TotalDiskCapacity": [1, 2, 3]},
            # TotalDiskCapacity is negative
            {"ProductType": "iPhone16,1", "TotalDiskCapacity": -999999999},
            # TotalDiskCapacity is float
            {"ProductType": "iPhone16,1", "TotalDiskCapacity": 128035676160.75},
            # Missing all optional keys
            {"ProductType": "iPhone16,1"},
            # Completely empty dict
            {},
        ]
        for data in test_payloads:
            payload = plistlib.dumps(data)
            with self.subTest(data=data):
                try:
                    result = parse_ideviceinfo_xml(payload)
                    if result is not None:
                        self.assertIsInstance(result, DeviceSpecs)
                except Exception as e:
                    self.fail(f"VULNERABILITY: parse_ideviceinfo_xml crashed with {type(e).__name__} on payload {data}: {e}")

    def test_large_xml_plist(self):
        """5 MB XML payload with junk keys should not crash or hang."""
        large_dict = {"ProductType": "iPhone16,2", "TotalDiskCapacity": 256000000000}
        for i in range(10000):
            large_dict[f"ExtraKey_{i}"] = f"ExtraneousPaddingValue_{i}" * 10
        payload = plistlib.dumps(large_dict)
        try:
            result = parse_ideviceinfo_xml(payload)
            self.assertIsNotNone(result)
            self.assertEqual(result.marketing_name, "iPhone 15 Pro Max")
        except Exception as e:
            self.fail(f"parse_ideviceinfo_xml failed on large plist: {e}")


class TestAdversarialStorageAndRam(unittest.TestCase):
    """2. Extreme / negative / overflow storage and RAM values."""

    def test_android_commercial_storage_extremes(self):
        """Test boundary, negative, zero, and petabyte storage values."""
        cases = [
            (0, "Unknown"),
            (-1, "Unknown"),
            (-5000000, "Unknown"),
            (1, "16GB"),
            (1000, "16GB"),
            (10**12, "1024TB"),  # 1 Petabyte (1,000,000,000,000 KB)
            (2**50, f"{round(((2**50 * 1024) / 1e9) / 1000)}TB"),  # Extreme overflow
        ]
        for kb, expected in cases:
            with self.subTest(kb=kb):
                try:
                    res = parse_android_commercial_storage(kb)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"parse_android_commercial_storage({kb}) raised {type(e).__name__}: {e}")

    def test_storage_from_df_adversarial(self):
        """Adversarial and malformed df outputs."""
        adversarial_outputs = [
            "",  # empty
            "Permission denied",
            "/dev/block/dm-0: Read-only file system",
            "/dev/block/dm-0 0 0 0 0% /data",  # 0 KB
            "/dev/block/dm-0 -50000000 0 0 0% /data",  # negative
            "/dev/block/dm-0 1000000000000 0 0 0% /data",  # 1 PB
            "/dev/block/dm-0 NOT_A_NUMBER 0 0 0% /data",  # corrupt tokens
            "\n".join([f"dummy_line_{i} 12345 6789 0 /system" for i in range(1000)] + ["/dev/block/bootdevice/by-name/userdata 114688000 45000000 69688000 40% /data"]),
            # Multiline wrapped df output
            "Filesystem           1K-blocks      Used Available Use% Mounted on\n/dev/block/dm-7\n                     229376000  50000000 179376000  22% /data",
            # Emojis and unicode in path
            "/dev/block/dm-0 229376000 0 0 0% /data 🚀📱",
        ]
        for df_out in adversarial_outputs:
            with self.subTest(df_out=df_out[:40]):
                try:
                    res = parse_storage_from_df(df_out)
                    self.assertIsInstance(res, str)
                    self.assertTrue(len(res) > 0)
                except Exception as e:
                    self.fail(f"parse_storage_from_df raised {type(e).__name__}: {e}")

    def test_android_commercial_ram_extremes(self):
        """RAM calculator with negative, zero, petabyte, and overflow."""
        cases = [
            (0, "Unknown"),
            (-1, "Unknown"),
            (-1000000, "Unknown"),
            (500, "2GB"),
            (100 * 1024 * 1024, "100GB"),  # 100 GB RAM
            (10**10, f"{round((10**10 / 1024.0) / 1024.0)}GB"),  # Extreme RAM
        ]
        for kb, expected in cases:
            with self.subTest(kb=kb):
                try:
                    res = parse_android_commercial_ram(kb)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"parse_android_commercial_ram({kb}) raised {type(e).__name__}: {e}")

    def test_ram_from_meminfo_adversarial(self):
        """cat /proc/meminfo outputs with malformed, corrupt, or missing fields."""
        adversarial_meminfo = [
            "",
            "MemTotal: kB",  # missing digit
            "MemTotal: -5000 kB",  # negative
            "MemTotal: 0 kB",  # zero
            "MemTotal: 100000000000 kB",  # 100 TB
            "SomethingElse: 12345 kB",  # missing MemTotal
            "MemTotal: 7854320 kB\nMemTotal: 11854320 kB",  # duplicate lines
            "\x00\xff\xfe binary meminfo garbage",
        ]
        for text in adversarial_meminfo:
            with self.subTest(text=text[:30]):
                try:
                    res = parse_ram_from_meminfo(text)
                    self.assertIsInstance(res, str)
                except Exception as e:
                    self.fail(f"parse_ram_from_meminfo raised {type(e).__name__}: {e}")

    def test_ios_commercial_storage_extremes(self):
        """iOS TotalDiskCapacity byte conversions with negative, zero, and petabytes."""
        cases = [
            (0, "Unknown"),
            (-1, "Unknown"),
            (-1000000000, "Unknown"),
            (1, "16GB"),
            (10**15, "1000000GB"),  # 1 PB
        ]
        for b, expected in cases:
            with self.subTest(b=b):
                try:
                    res = parse_ios_commercial_storage(b)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"parse_ios_commercial_storage({b}) raised {type(e).__name__}: {e}")


class TestAdversarialBatteryConditions(unittest.TestCase):
    """3. Unusual battery conditions (0% health, 200% health, negative cycles, missing keys)."""

    def test_adb_battery_info_unusual(self):
        """Test parse_battery_info against extreme dumpsys outputs."""
        cases = [
            # Empty dumpsys: should not crash
            "",
            # 0% level, 0 scale
            "level: 0\nscale: 0\nhealth: 2",
            # 200% level
            "level: 200\nscale: 100\nhealth: 2",
            # Negative level
            "level: -15\nscale: 100\nhealth: 2",
            # Negative scale
            "level: 50\nscale: -100\nhealth: 2",
            # ASOC exact percentage 0%
            "level: 50\nscale: 100\nmSavedBatteryAsoc: 0",
            # ASOC exact percentage 200%
            "level: 50\nscale: 100\nmSavedBatteryAsoc: 200",
            # Negative cycle count
            "level: 80\ncycle_count: -10",
            # Extreme cycle count
            "level: 80\ncycle_count: 99999",
            # Missing health, missing scale, missing level
            "status: 2\npresent: true",
            # Non-numeric garbage
            "level: high\nscale: full\nhealth: good",
            # Unicode and emojis in dumpsys
            "level: 90\nscale: 100\nhealth: 2 🔋",
        ]
        for text in cases:
            with self.subTest(text=text.replace('\n', '; ')):
                try:
                    level, health, cycles = parse_battery_info(text)
                    self.assertIsInstance(level, int)
                    self.assertTrue(health is None or isinstance(health, int))
                    self.assertTrue(cycles is None or isinstance(cycles, int))
                except Exception as e:
                    self.fail(f"parse_battery_info crashed with {type(e).__name__} on '{text}': {e}")

    def test_ios_battery_health_unusual(self):
        """calculate_ios_battery_health with extreme, corrupt, or missing keys."""
        cases = [
            # Empty dict
            ({}, (None, None)),
            # MaximumCapacityPercent = 0
            ({"MaximumCapacityPercent": 0}, (None, None)),
            # MaximumCapacityPercent = 100
            ({"MaximumCapacityPercent": 100}, (100, None)),
            # MaximumCapacityPercent = 200 (out of 1-100 range)
            ({"MaximumCapacityPercent": 200}, (None, None)),
            # Negative cycles
            ({"CycleCount": -25, "MaximumCapacityPercent": 92}, (92, -25)),
            # Zero cycles
            ({"CycleCount": 0, "MaximumCapacityPercent": 100}, (100, 0)),
            # Huge cycles
            ({"CycleCount": 50000, "MaximumCapacityPercent": 50}, (50, 50000)),
            # Capacities: Nominal > Design (overprovisioned, e.g. 115%)
            ({"NominalChargeCapacity": 3450, "DesignCapacity": 3000}, (100, None)),  # Clamped to 100
            # Capacities: DesignCapacity 0 (must not divide by zero)
            ({"NominalChargeCapacity": 2500, "DesignCapacity": 0}, (None, None)),
            # Capacities: Negative
            ({"NominalChargeCapacity": -500, "DesignCapacity": 3000}, (0, None)),
            ({"NominalChargeCapacity": 2500, "DesignCapacity": -3000}, (None, None)),
            # Corrupted XML bytes
            (b"not an xml plist", (None, None)),
            # Deeply nested battery dictionary
            ({"root": {"sub": {"GasGauge": {"CycleCount": 150, "MaximumCapacityPercent": 88}}}}, (88, 150)),
        ]
        for data, expected in cases:
            with self.subTest(data=str(data)[:40]):
                try:
                    health, cycles = calculate_ios_battery_health(data)
                    self.assertEqual((health, cycles), expected)
                except Exception as e:
                    self.fail(f"calculate_ios_battery_health raised {type(e).__name__} on {data}: {e}")

    def test_ios_battery_health_string_capacity_crash(self):
        """
        VULNERABILITY CHECK: calculate_ios_battery_health crashes when capacity values are strings.
        E.g. NominalChargeCapacity='2500', DesignCapacity='3000'.
        Should return (None, None) or cast, but must not crash with TypeError.
        """
        data = {"NominalChargeCapacity": "2500", "DesignCapacity": "3000"}
        try:
            health, cycles = calculate_ios_battery_health(data)
            # Safe behavior: either parsed or None
            self.assertTrue(health is None or isinstance(health, int))
        except Exception as e:
            self.fail(f"VULNERABILITY: calculate_ios_battery_health crashed with {type(e).__name__} on string capacities: {e}")


class TestAdversarialOemModelStrings(unittest.TestCase):
    """4. Strange OEM model strings, non-ASCII characters, and spaces."""

    def test_resolve_marketing_name_robustness(self):
        """Test resolve_marketing_name against non-ASCII, spaces, control chars, and None."""
        test_inputs = [
            # Standard
            ("SM-S928B", "samsung", ""),
            # Whitespace only
            ("   ", "   ", "   "),
            ("", "", ""),
            # Non-ASCII Arabic
            ("SM-S928B", "سامسونج", "جالكسي S24 الترا"),
            # Emojis and special characters
            ("📱 Model 🔥", "Brand ⚡", "Market ✨"),
            # Control characters and potential injection strings
            ("SM-S928B\x00\r\n\t", "Samsung\x00", "Galaxy\r\n"),
            ("SM-S928B'; DROP TABLE devices;--", "Samsung", ""),
            # 10,000 character strings
            ("SM-" + "A" * 10000, "Samsung", "Long" * 1000),
            # Model code None or Manufacturer None
            ("SM-S928B", None, ""),
            ("SM-S928B", "Samsung", None),
        ]
        for model, mfr, market in test_inputs:
            with self.subTest(model=str(model)[:20], mfr=str(mfr)[:20]):
                try:
                    brand, name = resolve_marketing_name(model, mfr, market)
                    self.assertIsInstance(brand, str)
                    self.assertIsInstance(name, str)
                    self.assertTrue(len(brand) >= 0)
                    self.assertTrue(len(name) >= 0)
                except Exception as e:
                    self.fail(f"resolve_marketing_name({model!r}, {mfr!r}, {market!r}) raised {type(e).__name__}: {e}")

    def test_resolve_marketing_name_none_model_crash(self):
        """
        VULNERABILITY CHECK: resolve_marketing_name crashes with AttributeError when model_code is None.
        Must handle None model_code gracefully without crashing.
        """
        try:
            brand, name = resolve_marketing_name(None, "Samsung", "")
            self.assertIsInstance(brand, str)
            self.assertIsInstance(name, str)
        except Exception as e:
            self.fail(f"VULNERABILITY: resolve_marketing_name crashed with {type(e).__name__} when model_code is None: {e}")

    def test_resolve_samsung_model_robustness(self):
        """resolve_samsung_model robustness against blanks, lowercase, unicode."""
        cases = [
            ("SM-S928B", "Galaxy S24 Ultra"),
            ("sm-s928b", "Galaxy S24 Ultra"),
            ("  SM-S928B  ", "Galaxy S24 Ultra"),
            ("SM-UNKNOWN999", None),
            ("", None),
            ("   ", None),
            ("📱 SM-S928B", None),
        ]
        for model_code, expected in cases:
            with self.subTest(model_code=model_code):
                try:
                    res = resolve_samsung_model(model_code)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"resolve_samsung_model({model_code!r}) raised {type(e).__name__}: {e}")

    def test_resolve_samsung_model_none_crash(self):
        """
        VULNERABILITY CHECK: resolve_samsung_model crashes with AttributeError when model_code is None.
        Must return None instead of crashing.
        """
        try:
            res = resolve_samsung_model(None)
            self.assertIsNone(res)
        except Exception as e:
            self.fail(f"VULNERABILITY: resolve_samsung_model crashed with {type(e).__name__} when model_code is None: {e}")

    def test_resolve_apple_model_robustness(self):
        """resolve_apple_model robustness against unknown models, non-strings."""
        cases = [
            ("iPhone17,2", "iPhone 16 Pro Max"),
            ("iPhone18,1", "Unknown iPhone (iPhone18,1)"),
            ("iPhone99,9", "Unknown iPhone (iPhone99,9)"),
            ("iPad14,1", "iPad14,1"),
            ("", "Apple Device"),
            ("   ", "   "),
        ]
        for pt, expected in cases:
            with self.subTest(product_type=pt):
                try:
                    res = resolve_apple_model(pt)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"resolve_apple_model({pt!r}) raised {type(e).__name__}: {e}")

    def test_resolve_apple_model_none_crash(self):
        """
        VULNERABILITY CHECK: resolve_apple_model crashes with AttributeError when product_type is None.
        Must return safe default string (e.g. 'Apple Device') instead of crashing.
        """
        try:
            res = resolve_apple_model(None)
            self.assertIsInstance(res, str)
        except Exception as e:
            self.fail(f"VULNERABILITY: resolve_apple_model crashed with {type(e).__name__} when product_type is None: {e}")


class TestAdversarialImeiAndParcel(unittest.TestCase):
    """5. Malformed parcel outputs from service call iphonesubinfo."""

    def test_parse_imei_service_call_parcels(self):
        """service call iphonesubinfo parser with corrupt, truncated, non-ASCII parcels."""
        cases = [
            # Empty
            ("", None),
            # Plain noise
            ("No parcel here", None),
            # No quotes
            ("Result: Parcel( 0x00000000: 00000000 0000000f )", None),
            # Quotes with letters
            ("Result: Parcel( 'abcdefghijklmno' )", None),
            # Quotes with emojis
            ("Result: Parcel( '..📱..✨..🎉..' )", None),
            # Less than 15 digits
            ("Result: Parcel( '..1234567890..' )", None),
            # Exactly 15 digits
            ("Result: Parcel( '..351782110293840..' )", "351782110293840"),
            # More than 15 digits (should take first 15)
            ("Result: Parcel( '..351782110293840999999..' )", "351782110293840"),
            # Unbalanced / unterminated quote
            ("Result: Parcel( '..351782110293840", None),
            # Multiple quotes split across lines (standard Android parcel layout)
            (
                "Result: Parcel(\n"
                "  0x00000000: 00000000 0000000f 00380033 00310035 '........3517'\n"
                "  0x00000010: 00380036 00330030 00390035 00340032 '82110293'\n"
                "  0x00000020: 00370030 00000031                   '840..        ')\n",
                "351782110293840"
            ),
            # Null bytes in parcel string
            ("Result: Parcel( '..\x003\x005\x001\x007\x008\x002\x001\x001\x000\x002\x009\x003\x008\x004\x000..' )", "351782110293840"),
        ]
        for text, expected in cases:
            with self.subTest(text=text[:35]):
                try:
                    res = parse_imei_from_service_call(text)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"parse_imei_from_service_call raised {type(e).__name__}: {e}")

    def test_validate_luhn_adversarial(self):
        """Luhn validator against non-strings, negative, unicode, corrupt types."""
        cases = [
            (None, False),
            ("", False),
            ("123", False),
            ("not an imei", False),
            (123456789012345, False),  # int
            ("351782110293840", True),  # valid S24 IMEI
            ("351782110293841", False),  # bad check digit
            ("3517821102938400", False),  # 16 digits
            ("35178211029384", False),  # 14 digits
            ("-35178211029384", False),
            ("35178211029384A", False),
            ("📱 351782110293840", True),  # non-digits stripped -> 15 digits -> valid Luhn!
        ]
        for imei, expected in cases:
            with self.subTest(imei=imei):
                try:
                    res = validate_luhn(imei)
                    self.assertEqual(res, expected)
                except Exception as e:
                    self.fail(f"validate_luhn raised {type(e).__name__}: {e}")


class TestAdversarialModelsAndSimulation(unittest.TestCase):
    """6. core.models and core.mock_device adversarial cases."""

    def test_device_specs_serialization_adversarial(self):
        """DeviceSpecs JSON roundtrip with extreme values, Arabic, emojis."""
        specs = DeviceSpecs(
            connection_type="adb",
            device_id="TEST_SERIAL_999",
            brand="سامسونج 📱",
            marketing_name="Galaxy S24 Ultra (مخصص)",
            model_code="SM-S928B/DS",
            storage="1024TB",
            ram="128GB",
            color="ذهبي تيتانيوم (Gold Titanium)",
            os_version="Android 15 (Vanilla Ice Cream)",
            serial_number="R5CX999999",
            imei1="351782110293840",
            imei2="351782110293857",
            battery_health=0,  # 0% battery
            battery_cycles=-10,  # negative cycles
            sales_region="KSA/A",
            bootloader_locked=False,
            condition_grade="B+",
            remarks="ملاحظات فحص الجهاز: شاشة سليمة وبطارية ميتة",
            raw_properties={"extreme_key": 10**18, "unicode_val": "تجربة"}
        )
        json_str = specs.to_json()
        self.assertIn("سامسونج", json_str)
        self.assertIn("1024TB", json_str)

        roundtrip = DeviceSpecs.from_json(json_str)
        self.assertEqual(roundtrip.brand, "سامسونج 📱")
        self.assertEqual(roundtrip.battery_health, 0)
        self.assertEqual(roundtrip.battery_cycles, -10)
        self.assertEqual(roundtrip.storage, "1024TB")

    def test_device_specs_from_dict_extra_and_missing_keys(self):
        """from_dict should ignore unknown keys safely."""
        data = {
            "connection_type": "ios",
            "device_id": "00008140-TEST",
            "brand": "Apple",
            "marketing_name": "iPhone 16 Pro",
            "model_code": "iPhone17,1",
            "storage": "256GB",
            "ram": "8GB",
            "color": "Natural Titanium",
            "os_version": "iOS 18.0",
            "serial_number": "TESTSER123",
            "imei1": "358901230192830",
            "extra_unrecognized_key_1": "should be ignored",
            "extra_nested_dict": {"foo": "bar"},
        }
        specs = DeviceSpecs.from_dict(data)
        self.assertEqual(specs.device_id, "00008140-TEST")
        self.assertFalse(hasattr(specs, "extra_unrecognized_key_1"))

    def test_mock_device_provider_edge_cases(self):
        """MockDeviceProvider invalid profile and thread lifecycle."""
        provider = MockDeviceProvider()
        self.assertFalse(provider.is_connected())

        # Invalid profile key
        with self.assertRaises(KeyError):
            provider.connect_profile("non_existent_profile_key")

        # Connect valid profile
        specs = provider.connect_profile("mock_s24_ultra")
        self.assertTrue(provider.is_connected())
        self.assertEqual(specs.marketing_name, "Galaxy S24 Ultra")

        # Disconnect
        provider.disconnect()
        self.assertFalse(provider.is_connected())
        self.assertIsNone(provider.get_active_specs())


if __name__ == "__main__":
    unittest.main()
