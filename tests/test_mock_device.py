"""
Unit tests for Hardware Simulation & Mock Device Engine (core/mock_device.py).
Validates pre-configured profiles, Luhn algorithm calculation and generation,
procedural generator distribution, provider state machine, and raw command fixtures.
"""
import time
import unittest

from core.mock_device import (
    calculate_luhn_check_digit,
    validate_luhn_imei,
    generate_luhn_imei,
    MOCK_S24_ULTRA,
    MOCK_IPHONE16_PROMAX,
    MOCK_IPHONE15_PRO,
    MOCK_FASTBOOT_DEVICE,
    PRECONFIGURED_PROFILES,
    generate_random_profile,
    MockDeviceProvider,
    MockCommandSimulator
)
from core.models import DeviceSpecs


class TestLuhnAlgorithm(unittest.TestCase):
    """Validates Luhn calculation, generation, and validation functions."""

    def test_luhn_check_digit_calculation(self):
        # 14 digits -> 15th check digit
        self.assertEqual(calculate_luhn_check_digit("35890123456789"), "6")
        self.assertEqual(calculate_luhn_check_digit("35178211029384"), "0")
        self.assertEqual(calculate_luhn_check_digit("35890123019283"), "0")
        self.assertEqual(calculate_luhn_check_digit("35178211029385"), "7")
        self.assertEqual(calculate_luhn_check_digit("35890123019284"), "8")

    def test_luhn_validation_known_vectors(self):
        self.assertTrue(validate_luhn_imei("358901234567896"))
        self.assertTrue(validate_luhn_imei("351782110293840"))
        self.assertTrue(validate_luhn_imei("358901230192830"))
        # Tampered check digits
        self.assertFalse(validate_luhn_imei("358901234567890"))
        self.assertFalse(validate_luhn_imei("351782110293846"))
        self.assertFalse(validate_luhn_imei("358901230192839"))

    def test_luhn_generator_produces_valid_imeis(self):
        for _ in range(50):
            imei = generate_luhn_imei()
            self.assertEqual(len(imei), 15)
            self.assertTrue(imei.isdigit())
            self.assertTrue(validate_luhn_imei(imei))


class TestPreconfiguredProfiles(unittest.TestCase):
    """Validates all mandatory pre-configured device profiles and field contracts."""

    def test_s24_ultra_profile(self):
        p = MOCK_S24_ULTRA
        self.assertEqual(p.brand, "Samsung")
        self.assertEqual(p.marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(p.model_code, "SM-S928B")
        self.assertEqual(p.storage, "512GB")
        self.assertEqual(p.ram, "12GB")
        self.assertEqual(p.color, "Titanium Gray")
        self.assertEqual(p.os_version, "Android 14")
        self.assertEqual(p.battery_health, 98)
        self.assertEqual(p.battery_cycles, 45)
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertTrue(validate_luhn_imei(p.imei2))
        self.assertEqual(p.connection_type, "adb")
        self.assertTrue(p.bootloader_locked)

    def test_iphone16_promax_profile(self):
        p = MOCK_IPHONE16_PROMAX
        self.assertEqual(p.brand, "Apple")
        self.assertEqual(p.marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(p.model_code, "iPhone17,2")
        self.assertEqual(p.storage, "256GB")
        self.assertEqual(p.color, "Desert Titanium")
        self.assertEqual(p.os_version, "iOS 18.1")
        self.assertEqual(p.battery_health, 100)
        self.assertEqual(p.battery_cycles, 12)
        self.assertEqual(p.sales_region, "LL/A")
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertTrue(validate_luhn_imei(p.imei2))
        self.assertEqual(p.connection_type, "ios")
        self.assertTrue(p.bootloader_locked)

    def test_iphone15_pro_profile(self):
        p = MOCK_IPHONE15_PRO
        self.assertEqual(p.brand, "Apple")
        self.assertEqual(p.marketing_name, "iPhone 15 Pro")
        self.assertEqual(p.model_code, "iPhone16,1")
        self.assertEqual(p.storage, "128GB")
        self.assertEqual(p.color, "Natural Titanium")
        self.assertEqual(p.os_version, "iOS 17.5")
        self.assertEqual(p.battery_health, 89)
        self.assertEqual(p.battery_cycles, 342)
        self.assertEqual(p.sales_region, "J/A")
        self.assertTrue(validate_luhn_imei(p.imei1))
        self.assertEqual(p.connection_type, "ios")

    def test_fastboot_device_profile(self):
        p = MOCK_FASTBOOT_DEVICE
        self.assertEqual(p.brand, "Xiaomi")
        self.assertIn("Fastboot", p.marketing_name)
        self.assertEqual(p.connection_type, "fastboot")
        self.assertFalse(p.bootloader_locked)  # Unlocked
        self.assertIsNone(p.battery_health)
        self.assertIsNone(p.battery_cycles)


class TestDynamicMockGenerator(unittest.TestCase):
    """Validates statistical integrity and schema compliance of procedurally generated profiles."""

    def test_generated_profiles_schema_and_luhn(self):
        for _ in range(100):
            specs = generate_random_profile()
            self.assertIsInstance(specs, DeviceSpecs)
            self.assertIn(specs.connection_type, ["adb", "ios", "fastboot"])
            self.assertTrue(len(specs.brand) > 0)
            self.assertTrue(len(specs.marketing_name) > 0)
            self.assertTrue(len(specs.storage) > 0)
            self.assertTrue(len(specs.ram) > 0)
            self.assertTrue(len(specs.serial_number) > 0)
            self.assertTrue(validate_luhn_imei(specs.imei1))
            if specs.imei2:
                self.assertTrue(validate_luhn_imei(specs.imei2))
            if specs.battery_health is not None:
                self.assertTrue(0 <= specs.battery_health <= 100)
            if specs.battery_cycles is not None:
                self.assertTrue(specs.battery_cycles >= 0)

    def test_brand_hint_selection(self):
        apple_specs = generate_random_profile(brand_hint="Apple")
        self.assertEqual(apple_specs.brand, "Apple")
        self.assertEqual(apple_specs.connection_type, "ios")

        samsung_specs = generate_random_profile(brand_hint="Samsung")
        self.assertEqual(samsung_specs.brand, "Samsung")
        self.assertEqual(samsung_specs.connection_type, "adb")


class TestMockDeviceProvider(unittest.TestCase):
    """Validates provider state transitions, callbacks, and polling loop."""

    def test_connect_and_disconnect_lifecycle(self):
        provider = MockDeviceProvider()
        self.assertFalse(provider.is_connected())
        self.assertIsNone(provider.get_active_specs())

        connected_events = []
        disconnected_events = []
        status_events = []

        provider.on_device_connected = lambda specs: connected_events.append(specs)
        provider.on_device_disconnected = lambda: disconnected_events.append(True)
        provider.on_status_changed = lambda status: status_events.append(status)

        # Connect S24 Ultra
        provider.connect_profile("mock_s24_ultra")
        self.assertTrue(provider.is_connected())
        self.assertEqual(len(connected_events), 1)
        self.assertEqual(connected_events[0].marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(status_events[-1], "adb")

        # Disconnect
        provider.disconnect()
        self.assertFalse(provider.is_connected())
        self.assertEqual(len(disconnected_events), 1)
        self.assertEqual(status_events[-1], "none")

    def test_polling_loop_daemon(self):
        provider = MockDeviceProvider()
        events = []
        provider.on_device_connected = lambda specs: events.append(specs.marketing_name)

        provider.start_polling(interval=0.05)
        time.sleep(0.02)
        provider.connect_profile("mock_iphone16_promax")
        time.sleep(0.12)
        provider.stop_polling()

        self.assertIn("iPhone 16 Pro Max", events)


class TestMockCommandSimulator(unittest.TestCase):
    """Validates that simulated raw command strings contain expected substrings."""

    def test_adb_raw_outputs(self):
        specs = MOCK_S24_ULTRA
        getprop = MockCommandSimulator.get_adb_getprop(specs)
        self.assertIn("[ro.product.model]: [SM-S928B]", getprop)

        df_out = MockCommandSimulator.get_adb_df(specs)
        self.assertIn("/data", df_out)
        self.assertIn("458752000", df_out)

        meminfo = MockCommandSimulator.get_adb_meminfo(specs)
        self.assertIn("MemTotal:        11854320 kB", meminfo)

        battery = MockCommandSimulator.get_adb_dumpsys_battery(specs)
        self.assertIn("level: 98", battery)

        parcel = MockCommandSimulator.get_adb_service_call_imei(specs)
        self.assertIn("Result: Parcel(", parcel)

    def test_ios_raw_xml_outputs(self):
        specs = MOCK_IPHONE16_PROMAX
        xml_out = MockCommandSimulator.get_ios_ideviceinfo_xml(specs)
        self.assertIn("<key>ProductType</key>", xml_out)
        self.assertIn("<string>iPhone17,2</string>", xml_out)

        battery_xml = MockCommandSimulator.get_ios_battery_xml(specs)
        self.assertIn("<key>MaximumCapacityPercent</key>", battery_xml)
        self.assertIn("<integer>100</integer>", battery_xml)


if __name__ == "__main__":
    unittest.main()
