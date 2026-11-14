"""
Unit tests for iOS Extraction Engine (core/ios_reader.py).
Tests Apple ProductType mappings up to iPhone 16 series, decimal disk capacity conversions,
plist XML deserialization, battery health diagnostics, region decoding, and color resolution.
"""
import os
import unittest
from unittest.mock import patch

from core.models import DeviceSpecs

from core.ios_reader import (
    resolve_apple_model,
    parse_ios_commercial_storage,
    parse_ios_storage,
    calculate_ios_battery_health,
    decode_apple_region,
    resolve_apple_color,
    parse_apple_part_and_region,
    parse_ideviceinfo_xml,
    IOSReader,
)


class TestAppleProductTypeMapping(unittest.TestCase):
    """Validates ProductType mapping from iPhone 6 through iPhone 16 Pro Max."""

    def test_iphone_16_series(self):
        self.assertEqual(resolve_apple_model("iPhone17,1"), "iPhone 16 Pro")
        self.assertEqual(resolve_apple_model("iPhone17,2"), "iPhone 16 Pro Max")
        self.assertEqual(resolve_apple_model("iPhone17,3"), "iPhone 16")
        self.assertEqual(resolve_apple_model("iPhone17,4"), "iPhone 16 Plus")

    def test_iphone_15_series(self):
        self.assertEqual(resolve_apple_model("iPhone16,1"), "iPhone 15 Pro")
        self.assertEqual(resolve_apple_model("iPhone16,2"), "iPhone 15 Pro Max")
        self.assertEqual(resolve_apple_model("iPhone15,4"), "iPhone 15")
        self.assertEqual(resolve_apple_model("iPhone15,5"), "iPhone 15 Plus")

    def test_iphone_14_and_legacy(self):
        self.assertEqual(resolve_apple_model("iPhone15,2"), "iPhone 14 Pro")
        self.assertEqual(resolve_apple_model("iPhone14,2"), "iPhone 13 Pro")
        self.assertEqual(resolve_apple_model("iPhone13,2"), "iPhone 12")
        self.assertEqual(resolve_apple_model("iPhone12,1"), "iPhone 11")
        self.assertEqual(resolve_apple_model("iPhone11,2"), "iPhone XS")
        self.assertEqual(resolve_apple_model("iPhone10,3"), "iPhone X")
        self.assertEqual(resolve_apple_model("iPhone14,6"), "iPhone SE (3rd Gen)")

    def test_unknown_future_model(self):
        # Should gracefully return identifier string without crashing
        resolved = resolve_apple_model("iPhone18,1")
        self.assertIn("iPhone18,1", resolved)


class TestIosCommercialStorage(unittest.TestCase):
    """Validates decimal capacity conversions (1 GB = 1e9 bytes) into commercial sizes."""

    def test_standard_tiers(self):
        self.assertEqual(parse_ios_commercial_storage(64000000000), "64GB")
        self.assertEqual(parse_ios_commercial_storage(128035676160), "128GB")
        self.assertEqual(parse_ios_commercial_storage(256071352320), "256GB")
        self.assertEqual(parse_ios_commercial_storage(512142704640), "512GB")
        self.assertEqual(parse_ios_commercial_storage(1024285409280), "1TB")

    def test_alias_parse_ios_storage(self):
        self.assertEqual(parse_ios_storage(128035676160), "128GB")
        self.assertEqual(parse_ios_storage(256071352320), "256GB")

    def test_boundary_thresholds(self):
        # 64GB vs 128GB boundary (72 GB)
        self.assertEqual(parse_ios_commercial_storage(72000000000), "64GB")
        self.assertEqual(parse_ios_commercial_storage(72000000001), "128GB")
        # 128GB vs 256GB boundary (145 GB)
        self.assertEqual(parse_ios_commercial_storage(145000000000), "128GB")
        self.assertEqual(parse_ios_commercial_storage(145000000001), "256GB")
        # 256GB vs 512GB boundary (290 GB)
        self.assertEqual(parse_ios_commercial_storage(290000000000), "256GB")
        self.assertEqual(parse_ios_commercial_storage(290000000001), "512GB")
        # 512GB vs 1TB boundary (580 GB)
        self.assertEqual(parse_ios_commercial_storage(580000000000), "512GB")
        self.assertEqual(parse_ios_commercial_storage(580000000001), "1TB")


class TestIosBatteryHealth(unittest.TestCase):
    """Validates battery health calculation and clamping from AppleSmartBattery XML."""

    def test_direct_maximum_capacity_percent(self):
        battery_data = {"MaximumCapacityPercent": 94, "CycleCount": 180}
        health, cycles = calculate_ios_battery_health(battery_data)
        self.assertEqual(health, 94)
        self.assertEqual(cycles, 180)

    def test_calculated_from_capacities(self):
        battery_data = {
            "NominalChargeCapacity": 3200,
            "DesignCapacity": 3274,
            "CycleCount": 65
        }
        health, cycles = calculate_ios_battery_health(battery_data)
        # 3200 / 3274 * 100 = 97.74 -> 98%
        self.assertEqual(health, 98)
        self.assertEqual(cycles, 65)

    def test_overprovisioned_clamping(self):
        # Nominal exceeds design on brand new battery
        battery_data = {
            "NominalChargeCapacity": 3400,
            "DesignCapacity": 3274,
            "CycleCount": 3
        }
        health, cycles = calculate_ios_battery_health(battery_data)
        self.assertEqual(health, 100)

    def test_battery_health_with_cli_banner_noise(self):
        noisy_xml = (
            b"Connecting to device...\n"
            b"Requesting IORegistry AppleSmartBattery...\n"
            b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            b"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
            b"<plist version=\"1.0\">\n"
            b"<dict>\n"
            b"    <key>MaximumCapacityPercent</key>\n"
            b"    <integer>93</integer>\n"
            b"    <key>CycleCount</key>\n"
            b"    <integer>112</integer>\n"
            b"</dict>\n"
            b"</plist>\n"
        )
        health, cycles = calculate_ios_battery_health(noisy_xml)
        self.assertEqual(health, 93)
        self.assertEqual(cycles, 112)

    def test_extract_battery_telemetry_does_not_confuse_charge_with_health(self):
        reader = IOSReader()
        with patch.object(reader, "_exec") as mock_exec:
            # Diagnostics fail, com.apple.mobile.battery returns charge level
            mock_exec.side_effect = [
                (-1, b"", b"error"),
                (-1, b"", b"error"),
                (0, b"<?xml version=\"1.0\"?><plist><dict><key>BatteryCurrentCapacity</key><integer>75</integer></dict></plist>", b"")
            ]
            health, cycles = reader.extract_battery_telemetry("MOCKUDID")
            self.assertIsNone(health)


class TestIosRegionAndColor(unittest.TestCase):
    """Validates region code expansion and marketing color resolution."""

    def test_region_decoding(self):
        self.assertEqual(decode_apple_region("LL/A"), "LL/A (USA eSIM)")
        self.assertEqual(decode_apple_region("J/A"), "J/A (Japan)")
        self.assertEqual(decode_apple_region("CH/A"), "CH/A (China Dual SIM)")
        self.assertEqual(decode_apple_region("ZP/A"), "ZP/A (Hong Kong / Singapore)")
        self.assertEqual(decode_apple_region("B/A"), "B/A (United Kingdom)")

    def test_region_suffix_deduplication(self):
        part, reg = parse_apple_part_and_region("MYWV3LL/A", "LL/A")
        self.assertEqual(part, "MYWV3LL/A")
        self.assertEqual(reg, "LL/A")

        part2, reg2 = parse_apple_part_and_region("MYWV3", "LL/A")
        self.assertEqual(part2, "MYWV3LL/A")
        self.assertEqual(reg2, "LL/A")

        part3, reg3 = parse_apple_part_and_region("MYWV3LL/A", None)
        self.assertEqual(part3, "MYWV3LL/A")
        self.assertEqual(reg3, "LL/A")

    def test_color_resolving(self):
        self.assertEqual(resolve_apple_color("Natural Titanium"), "Natural Titanium")
        self.assertEqual(resolve_apple_color("Desert Titanium"), "Desert Titanium")
        self.assertEqual(resolve_apple_color("#505e6b"), "Natural Titanium")
        self.assertEqual(resolve_apple_color("#3b444b"), "Space Gray")
        self.assertEqual(resolve_apple_color("1"), "Black")
        self.assertEqual(resolve_apple_color("2"), "White")
        self.assertEqual(resolve_apple_color("4"), "Green")


class TestIdeviceinfoXmlParsing(unittest.TestCase):
    """Validates end-to-end deserialization of ideviceinfo -x XML plist into DeviceSpecs."""

    def test_xml_deserialization(self):
        xml_data = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceName</key>
    <string>John's iPhone</string>
    <key>ProductType</key>
    <string>iPhone17,2</string>
    <key>ProductVersion</key>
    <string>18.1</string>
    <key>SerialNumber</key>
    <string>H2LGD0987XMY</string>
    <key>UniqueDeviceID</key>
    <string>00008140-001928374650001E</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>358901230192830</string>
    <key>InternationalMobileEquipmentIdentity2</key>
    <string>358901230192848</string>
    <key>TotalDiskCapacity</key>
    <integer>256071352320</integer>
    <key>DeviceEnclosureColor</key>
    <string>Desert Titanium</string>
    <key>ModelNumber</key>
    <string>MYWV3</string>
    <key>RegionInfo</key>
    <string>LL/A</string>
</dict>
</plist>"""
        specs = parse_ideviceinfo_xml(xml_data)
        self.assertIsNotNone(specs)
        self.assertEqual(specs.marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(specs.storage, "256GB")
        self.assertEqual(specs.os_version, "iOS 18.1")
        self.assertEqual(specs.color, "Desert Titanium")
        self.assertEqual(specs.serial_number, "H2LGD0987XMY")
        self.assertEqual(specs.imei1, "358901230192830")
        self.assertEqual(specs.imei2, "358901230192848")
        self.assertEqual(specs.sales_region, "LL/A (USA eSIM)")

    def test_xml_deserialization_with_banner_noise(self):
        noisy_xml = b"""Connecting to device...
Lockdownd session started.
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductType</key>
    <string>iPhone17,1</string>
    <key>ProductVersion</key>
    <string>18.0</string>
    <key>SerialNumber</key>
    <string>F2LGD0987XMY</string>
    <key>TotalDiskCapacity</key>
    <integer>128035676160</integer>
    <key>DeviceEnclosureColor</key>
    <string>Natural Titanium</string>
</dict>
</plist>"""
        specs = parse_ideviceinfo_xml(noisy_xml)
        self.assertIsNotNone(specs)
        self.assertEqual(specs.marketing_name, "iPhone 16 Pro")
        self.assertEqual(specs.storage, "128GB")


class TestIosReaderTelemetryExtraction(unittest.TestCase):
    """Validates lockdown check logic, storage fallback, and battery extraction."""

    def test_extract_telemetry_unlocked_device_with_password_protected_false(self):
        xml_data = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductType</key>
    <string>iPhone12,1</string>
    <key>SerialNumber</key>
    <string>G0NZN1P2N72P</string>
    <key>UniqueDeviceID</key>
    <string>00008030-001159420292802E</string>
    <key>PasswordProtected</key>
    <false/>
    <key>DeviceColor</key>
    <string>1</string>
    <key>ModelNumber</key>
    <string>MWJK2</string>
    <key>RegionInfo</key>
    <string>LL/A</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>353968109991662</string>
</dict>
</plist>"""
        disk_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>TotalDiskCapacity</key>
    <integer>64000000000</integer>
</dict>
</plist>"""
        reader = IOSReader()
        with patch.object(reader, "_exec") as mock_exec, \
             patch.object(reader, "extract_battery_telemetry") as mock_bat:
            mock_exec.side_effect = [
                (0, xml_data, b""),     # ideviceinfo -x
                (0, disk_xml, b""),     # ideviceinfo -q com.apple.disk_usage -x
            ]
            mock_bat.return_value = (80, 1588)

            specs, status = reader.extract_device_telemetry("00008030-001159420292802E")
            self.assertEqual(status, "Ready")
            self.assertIsNotNone(specs)
            self.assertEqual(specs.marketing_name, "iPhone 11")
            self.assertEqual(specs.storage, "64GB")
            # MWJK2 is retail order code for iPhone 11 Green (matches 3uTools authoritative SKU)
            self.assertEqual(specs.color, "Green")
            self.assertEqual(specs.imei1, "353968109991662")
            self.assertEqual(specs.battery_health, 80)
            self.assertEqual(specs.battery_cycles, 1588)

    def test_extract_telemetry_device_passcode_locked(self):
        xml_data = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductType</key>
    <string>iPhone12,1</string>
    <key>PasswordProtected</key>
    <true/>
</dict>
</plist>"""
        reader = IOSReader()
        with patch.object(reader, "_exec") as mock_exec:
            mock_exec.return_value = (0, xml_data, b"")
            specs, status = reader.extract_device_telemetry("00008030-001159420292802E")
            self.assertIsNone(specs)
            self.assertEqual(status, "Device Locked - Enter Passcode on iPhone")

    def test_resolve_apple_color_numeric_and_hex_variants(self):
        """Verifies numeric codes (#1, #2), exact hex, nearest hex, and names resolve correctly."""
        # Numeric codes with or without hash prefix
        self.assertEqual(resolve_apple_color("#1"), "Black")
        self.assertEqual(resolve_apple_color("1"), "Black")
        self.assertEqual(resolve_apple_color("#2"), "White")
        self.assertEqual(resolve_apple_color("2"), "White")

        # Exact titanium hexes
        self.assertEqual(resolve_apple_color("#505e6b"), "Natural Titanium")
        self.assertEqual(resolve_apple_color("#bca593"), "Desert Titanium")
        self.assertEqual(resolve_apple_color("#35373a"), "Black Titanium")

        # Nearest Euclidean matching for slight shade variants
        self.assertEqual(resolve_apple_color("#515e6c"), "Natural Titanium")

        # String marketing identifiers
        self.assertEqual(resolve_apple_color("desert_titanium"), "Desert Titanium")
        self.assertEqual(resolve_apple_color("natural-titanium"), "Natural Titanium")

    def test_apple_specs_is_apple_and_label_battery_rendering(self):
        """Verifies is_apple property and battery element rendering on Apple devices."""
        from core.label_template_model import LabelElement
        from core.label_template_renderer import should_render_element

        specs = DeviceSpecs(
            connection_type="ios",
            device_id="TEST-UDID",
            brand="Apple",
            marketing_name="iPhone 15 Pro",
            model_code="MYWV3LL/A",
            storage="256GB",
            ram="8GB",
            color="Natural Titanium",
            os_version="iOS 17.5",
            serial_number="DNPZ12345678",
            imei1="352123456789012",
            battery_health=94
        )
        self.assertTrue(specs.is_apple)

        bat_el = LabelElement(id="c_bat", field_key="battery_life", title="Bat", content="100%")
        self.assertTrue(should_render_element(bat_el, specs))

        # Even if battery_health is None on an Apple device, should_render_element respects Apple device
        specs_no_bat = DeviceSpecs(
            connection_type="ios",
            device_id="TEST-UDID-2",
            brand="Apple",
            marketing_name="iPhone 13",
            model_code="MLPF3LL/A",
            storage="128GB",
            ram="4GB",
            color="Midnight",
            os_version="iOS 16.0",
            serial_number="F2LZ98765432",
            imei1="359876543210987",
            battery_health=None
        )
        self.assertTrue(specs_no_bat.is_apple)
        self.assertTrue(should_render_element(bat_el, specs_no_bat))

    def test_database_tac_color_learning_and_lookup(self):
        """Verifies TAC-to-color mapping can be learned and retrieved from DatabaseManager."""
        from core.database import DatabaseManager
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            db = DatabaseManager(tmp_path)
            # Learn TAC
            ok = db.learn_tac_color("35396810", "iPhone 11", "Black")
            self.assertTrue(ok)

            # Lookup by TAC + Model
            found = db.lookup_tac_color("35396810", "iPhone 11")
            self.assertEqual(found, "Black")

            # Lookup by TAC only
            found_tac = db.lookup_tac_color("353968109991662")
            self.assertEqual(found_tac, "Black")

            # Non-existent TAC returns None
            self.assertIsNone(db.lookup_tac_color("99999999"))
            db.close()
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass


if __name__ == "__main__":
    unittest.main()
