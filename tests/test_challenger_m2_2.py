"""
Empirical Challenge Test Suite - Challenger M2 Instance 2.
Adversarially stress-tests iOS extraction and DeviceDetectorWorker:
1. calculate_ios_battery_health edge cases (banner noise, missing closing plist, Nominal > Design clamping, negative/zero).
2. parse_apple_part_and_region variations (LL/A, ZP/A, B/A, J/A, KH/A, CH/A, already combined suffixes, bare codes).
3. DeviceDetectorWorker lifecycle (rapid connect/disconnect, debouncing, <2s idempotency guard, mock modes).
"""
import time
import unittest
from unittest.mock import patch, MagicMock

from core.models import DeviceSpecs
from core.ios_reader import (
    calculate_ios_battery_health,
    parse_apple_part_and_region,
    decode_apple_region,
    resolve_apple_model,
    resolve_apple_color,
    parse_ios_commercial_storage,
    parse_ideviceinfo_xml,
)
from core.device_detector import (
    DeviceDetectorWorker,
    ConnectionState,
    TARGET_MOBILE_VIDS,
)


class TestIosBatteryHealthEmpirical(unittest.TestCase):
    """Adversarial stress-testing of calculate_ios_battery_health."""

    def test_banner_text_prepended_standard(self):
        """Banner noise prepended before standard <?xml... declaration."""
        raw = (
            b"Connecting to device via USB...\n"
            b"Device connected: UDID=00008140-001928374650001E\n"
            b"Reading IORegistry entry AppleSmartBattery...\n"
            b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            b"<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
            b"<plist version=\"1.0\">\n"
            b"<dict>\n"
            b"    <key>NominalChargeCapacity</key>\n"
            b"    <integer>3100</integer>\n"
            b"    <key>DesignCapacity</key>\n"
            b"    <integer>3274</integer>\n"
            b"    <key>CycleCount</key>\n"
            b"    <integer>142</integer>\n"
            b"</dict>\n"
            b"</plist>\n"
        )
        health, cycles = calculate_ios_battery_health(raw)
        # 3100 / 3274 * 100 = 94.685 -> 95
        self.assertEqual(health, 95)
        self.assertEqual(cycles, 142)

    def test_banner_text_prepended_without_xml_prolog(self):
        """Banner noise prepended directly before <plist... when <?xml is omitted."""
        raw = (
            b"Service response code: 200 OK\n"
            b"<plist version=\"1.0\">\n"
            b"<dict>\n"
            b"    <key>MaximumCapacityPercent</key>\n"
            b"    <integer>88</integer>\n"
            b"    <key>CycleCount</key>\n"
            b"    <integer>320</integer>\n"
            b"</dict>\n"
            b"</plist>\n"
        )
        health, cycles = calculate_ios_battery_health(raw)
        self.assertEqual(health, 88)
        self.assertEqual(cycles, 320)

    def test_banner_containing_fake_tags(self):
        """Banner text containing pseudo-XML tags before real XML declaration."""
        raw = (
            b"<status>OK</status>\n"
            b"<device state=\"active\"/>\n"
            b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            b"<plist version=\"1.0\">\n"
            b"<dict>\n"
            b"    <key>NominalChargeCapacity</key>\n"
            b"    <integer>2800</integer>\n"
            b"    <key>DesignCapacity</key>\n"
            b"    <integer>3200</integer>\n"
            b"    <key>CycleCount</key>\n"
            b"    <integer>210</integer>\n"
            b"</dict>\n"
            b"</plist>\n"
        )
        health, cycles = calculate_ios_battery_health(raw)
        # 2800 / 3200 * 100 = 87.5 -> 88%
        self.assertEqual(health, 88)
        self.assertEqual(cycles, 210)

    def test_missing_closing_plist_tag(self):
        """Truncated XML missing </plist> tag must fail safely returning (None, None)."""
        truncated = (
            b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            b"<plist version=\"1.0\">\n"
            b"<dict>\n"
            b"    <key>NominalChargeCapacity</key>\n"
            b"    <integer>3100</integer>\n"
            b"    <key>DesignCapacity</key>\n"
            b"    <integer>3274</integer>\n"
        )
        health, cycles = calculate_ios_battery_health(truncated)
        self.assertIsNone(health)
        self.assertIsNone(cycles)

    def test_corrupted_closing_tag(self):
        """Corrupted closing tag </plis>."""
        corrupted = (
            b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            b"<plist version=\"1.0\">\n"
            b"<dict><key>CycleCount</key><integer>50</integer></dict>\n"
            b"</plis>\n"
        )
        health, cycles = calculate_ios_battery_health(corrupted)
        self.assertIsNone(health)
        self.assertIsNone(cycles)

    def test_completely_empty_or_malformed_input(self):
        """Empty bytes, invalid types, garbage strings."""
        self.assertEqual(calculate_ios_battery_health(b""), (None, None))
        self.assertEqual(calculate_ios_battery_health(b"NOT XML AT ALL"), (None, None))
        self.assertEqual(calculate_ios_battery_health(None), (None, None))
        self.assertEqual(calculate_ios_battery_health(12345), (None, None))
        self.assertEqual(calculate_ios_battery_health([]), (None, None))

    def test_nominal_exceeds_design_clamped_to_100(self):
        """NominalChargeCapacity > DesignCapacity must clamp to 100%."""
        # 3500 / 3200 = 109.375% -> clamped to 100%
        data1 = {"NominalChargeCapacity": 3500, "DesignCapacity": 3200, "CycleCount": 1}
        health1, cycles1 = calculate_ios_battery_health(data1)
        self.assertEqual(health1, 100)
        self.assertEqual(cycles1, 1)

        # Extreme overprovisioning (e.g. 5000 / 2500 = 200%) -> clamped to 100%
        data2 = {"NominalChargeCapacity": 5000, "DesignCapacity": 2500, "CycleCount": 0}
        health2, _ = calculate_ios_battery_health(data2)
        self.assertEqual(health2, 100)

        # Exactly 100%
        data3 = {"NominalChargeCapacity": 3200, "DesignCapacity": 3200, "CycleCount": 10}
        health3, _ = calculate_ios_battery_health(data3)
        self.assertEqual(health3, 100)

    def test_negative_nominal_value(self):
        """Negative NominalChargeCapacity clamped to 0 or handled gracefully."""
        data = {"NominalChargeCapacity": -500, "DesignCapacity": 3000, "CycleCount": 5}
        health, cycles = calculate_ios_battery_health(data)
        # Clamped to 0
        self.assertEqual(health, 0)
        self.assertEqual(cycles, 5)

    def test_zero_nominal_value(self):
        """NominalChargeCapacity = 0 -> 0%."""
        data = {"NominalChargeCapacity": 0, "DesignCapacity": 3000, "CycleCount": 5}
        health, cycles = calculate_ios_battery_health(data)
        self.assertEqual(health, 0)
        self.assertEqual(cycles, 5)

    def test_zero_design_capacity_prevents_zero_division(self):
        """DesignCapacity = 0 must not raise ZeroDivisionError and return None."""
        data = {"NominalChargeCapacity": 3000, "DesignCapacity": 0, "CycleCount": 10}
        health, cycles = calculate_ios_battery_health(data)
        self.assertIsNone(health)
        self.assertEqual(cycles, 10)

    def test_negative_design_capacity(self):
        """DesignCapacity < 0 must be rejected and return None."""
        data = {"NominalChargeCapacity": 3000, "DesignCapacity": -3000, "CycleCount": 10}
        health, cycles = calculate_ios_battery_health(data)
        self.assertIsNone(health)
        self.assertEqual(cycles, 10)

    def test_both_zero(self):
        """Both Nominal and Design zero."""
        data = {"NominalChargeCapacity": 0, "DesignCapacity": 0}
        health, cycles = calculate_ios_battery_health(data)
        self.assertIsNone(health)
        self.assertIsNone(cycles)

    def test_maximum_capacity_percent_boundary_conditions(self):
        """Test MaximumCapacityPercent out of [1, 100] falls back to capacities."""
        # 0 is rejected as max_pct -> falls back to nom/des
        data0 = {
            "MaximumCapacityPercent": 0,
            "NominalChargeCapacity": 2700,
            "DesignCapacity": 3000
        }
        health0, _ = calculate_ios_battery_health(data0)
        self.assertEqual(health0, 90)

        # > 100 is rejected as max_pct -> falls back to nom/des
        data_over = {
            "MaximumCapacityPercent": 105,
            "NominalChargeCapacity": 3150,
            "DesignCapacity": 3000
        }
        health_over, _ = calculate_ios_battery_health(data_over)
        self.assertEqual(health_over, 100)  # clamped from 105% to 100%


class TestApplePartAndRegionEmpirical(unittest.TestCase):
    """Adversarial stress-testing of parse_apple_part_and_region."""

    def test_region_lla(self):
        """USA region LL/A."""
        # Clean model + region
        part, reg = parse_apple_part_and_region("MYWV3", "LL/A")
        self.assertEqual(part, "MYWV3LL/A")
        self.assertEqual(reg, "LL/A")

        # Model already combined
        part_comb, reg_comb = parse_apple_part_and_region("MYWV3LL/A", "LL/A")
        self.assertEqual(part_comb, "MYWV3LL/A")
        self.assertEqual(reg_comb, "LL/A")

        # Model already combined, region is None
        part_none, reg_none = parse_apple_part_and_region("MYWV3LL/A", None)
        self.assertEqual(part_none, "MYWV3LL/A")
        self.assertEqual(reg_none, "LL/A")

        # Model already combined, region is bare "LL"
        part_bare, reg_bare = parse_apple_part_and_region("MYWV3LL/A", "LL")
        self.assertEqual(part_bare, "MYWV3LL/A")
        self.assertEqual(reg_bare, "LL/A")

        # Bare region "LL" auto-expanded to "LL/A"
        part_exp, reg_exp = parse_apple_part_and_region("MYWV3", "LL")
        self.assertEqual(part_exp, "MYWV3LL/A")
        self.assertEqual(reg_exp, "LL/A")

    def test_region_zpa(self):
        """Hong Kong / Singapore region ZP/A."""
        part, reg = parse_apple_part_and_region("MLQ73", "ZP/A")
        self.assertEqual(part, "MLQ73ZP/A")
        self.assertEqual(reg, "ZP/A")

        part_comb, reg_comb = parse_apple_part_and_region("MLQ73ZP/A", "ZP/A")
        self.assertEqual(part_comb, "MLQ73ZP/A")
        self.assertEqual(reg_comb, "ZP/A")

        part_bare, reg_bare = parse_apple_part_and_region("MLQ73", "ZP")
        self.assertEqual(part_bare, "MLQ73ZP/A")
        self.assertEqual(reg_bare, "ZP/A")

    def test_region_ba(self):
        """United Kingdom region B/A (single-letter region)."""
        part, reg = parse_apple_part_and_region("MN9D2", "B/A")
        self.assertEqual(part, "MN9D2B/A")
        self.assertEqual(reg, "B/A")

        part_comb, reg_comb = parse_apple_part_and_region("MN9D2B/A", "B/A")
        self.assertEqual(part_comb, "MN9D2B/A")
        self.assertEqual(reg_comb, "B/A")

        part_bare, reg_bare = parse_apple_part_and_region("MN9D2", "B")
        self.assertEqual(part_bare, "MN9D2B/A")
        self.assertEqual(reg_bare, "B/A")

    def test_region_ja(self):
        """Japan region J/A (single-letter region)."""
        part, reg = parse_apple_part_and_region("MG8Y3", "J/A")
        self.assertEqual(part, "MG8Y3J/A")
        self.assertEqual(reg, "J/A")

        part_comb, reg_comb = parse_apple_part_and_region("MG8Y3J/A", "J/A")
        self.assertEqual(part_comb, "MG8Y3J/A")
        self.assertEqual(reg_comb, "J/A")

        part_bare, reg_bare = parse_apple_part_and_region("MG8Y3", "J")
        self.assertEqual(part_bare, "MG8Y3J/A")
        self.assertEqual(reg_bare, "J/A")

    def test_region_kha(self):
        """South Korea region KH/A."""
        part, reg = parse_apple_part_and_region("MQ9X3", "KH/A")
        self.assertEqual(part, "MQ9X3KH/A")
        self.assertEqual(reg, "KH/A")

        part_comb, reg_comb = parse_apple_part_and_region("MQ9X3KH/A", "KH/A")
        self.assertEqual(part_comb, "MQ9X3KH/A")
        self.assertEqual(reg_comb, "KH/A")

        part_bare, reg_bare = parse_apple_part_and_region("MQ9X3", "KH")
        self.assertEqual(part_bare, "MQ9X3KH/A")
        self.assertEqual(reg_bare, "KH/A")

    def test_region_cha(self):
        """China Dual SIM region CH/A."""
        part, reg = parse_apple_part_and_region("MU1E3", "CH/A")
        self.assertEqual(part, "MU1E3CH/A")
        self.assertEqual(reg, "CH/A")

        part_comb, reg_comb = parse_apple_part_and_region("MU1E3CH/A", "CH/A")
        self.assertEqual(part_comb, "MU1E3CH/A")
        self.assertEqual(reg_comb, "CH/A")

        part_bare, reg_bare = parse_apple_part_and_region("MU1E3", "CH")
        self.assertEqual(part_bare, "MU1E3CH/A")
        self.assertEqual(reg_bare, "CH/A")

    def test_model_ending_with_bare_region_code_without_slash_a(self):
        """ModelNumber ending with bare code e.g. 'MYWV3LL' with region 'LL/A'."""
        part, reg = parse_apple_part_and_region("MYWV3LL", "LL/A")
        self.assertEqual(part, "MYWV3LL/A")
        self.assertEqual(reg, "LL/A")

        part_zp, reg_zp = parse_apple_part_and_region("MLQ73ZP", "ZP/A")
        self.assertEqual(part_zp, "MLQ73ZP/A")
        self.assertEqual(reg_zp, "ZP/A")

        part_b, reg_b = parse_apple_part_and_region("MN9D2B", "B/A")
        self.assertEqual(part_b, "MN9D2B/A")
        self.assertEqual(reg_b, "B/A")

    def test_edge_cases_empty_and_none(self):
        """Edge cases: empty strings, None values."""
        self.assertEqual(parse_apple_part_and_region(None, "LL/A"), ("LL/A", "LL/A"))
        self.assertEqual(parse_apple_part_and_region("", "LL/A"), ("LL/A", "LL/A"))
        self.assertEqual(parse_apple_part_and_region("MYWV3", None), ("MYWV3", "Unknown"))
        self.assertEqual(parse_apple_part_and_region("MYWV3", ""), ("MYWV3", "Unknown"))
        self.assertEqual(parse_apple_part_and_region("", ""), ("Unknown", "Unknown"))
        self.assertEqual(parse_apple_part_and_region(None, None), ("Unknown", "Unknown"))


class TestDeviceDetectorWorkerEmpirical(unittest.TestCase):
    """Adversarial stress-testing of DeviceDetectorWorker."""

    def setUp(self):
        self.worker = DeviceDetectorWorker()

    def tearDown(self):
        self.worker.stop_polling()

    def test_mock_mode_switching_cycle(self):
        """Switch through all mock modes in cycle and verify specs and status."""
        specs_log = []
        status_log = []
        disconnect_count = [0]

        self.worker.on_device_connected = lambda s: specs_log.append(s)
        self.worker.on_status_changed = lambda st: status_log.append(st)
        self.worker.on_device_disconnected = lambda: disconnect_count.__setitem__(0, disconnect_count[0] + 1)

        # 1. mock_s24
        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(specs_log), 1)
        self.assertEqual(specs_log[-1].brand, "Samsung")
        self.assertEqual(specs_log[-1].marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(status_log[-1]["state"], "adb")
        self.assertTrue(status_log[-1]["adb"])

        # 2. mock_iphone16
        self.worker.set_mock_mode("mock_iphone16")
        self.assertEqual(len(specs_log), 2)
        self.assertEqual(specs_log[-1].brand, "Apple")
        self.assertEqual(specs_log[-1].marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(status_log[-1]["state"], "ios")
        self.assertTrue(status_log[-1]["ios"])

        # 3. mock_fastboot
        self.worker.set_mock_mode("mock_fastboot")
        self.assertEqual(len(specs_log), 3)
        self.assertEqual(specs_log[-1].connection_type, "fastboot")
        self.assertEqual(status_log[-1]["state"], "fastboot")
        self.assertTrue(status_log[-1]["fastboot"])

        # 4. mock_offline
        self.worker.set_mock_mode("mock_offline")
        self.assertEqual(len(specs_log), 3)  # No new specs
        self.assertEqual(disconnect_count[0], 1)
        self.assertEqual(status_log[-1]["state"], "disconnected")
        self.assertFalse(status_log[-1]["adb"])
        self.assertFalse(status_log[-1]["ios"])
        self.assertFalse(status_log[-1]["fastboot"])

        # 5. back to mock_s24
        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(specs_log), 4)
        self.assertEqual(specs_log[-1].brand, "Samsung")

    def test_rapid_connect_disconnect_events(self):
        """Stress-test rapid state cycling between connected and offline."""
        connect_events = []
        disconnect_events = []

        self.worker.on_device_connected = lambda s: connect_events.append(s.device_id)
        self.worker.on_device_disconnected = lambda: disconnect_events.append(time.time())

        # Rapidly flip between mock_s24 and mock_offline 20 times
        for i in range(20):
            self.worker.set_mock_mode("mock_s24")
            self.worker.set_mock_mode("mock_offline")

        self.assertEqual(len(connect_events), 20)
        self.assertEqual(len(disconnect_events), 20)

    def test_idempotency_guard_under_2_seconds(self):
        """Verify that polling ticks for the same device within 2.0s are suppressed."""
        specs_emitted = []
        self.worker.on_device_connected = lambda s: specs_emitted.append(s)

        # Connect device
        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(specs_emitted), 1)

        # Fire 15 immediate poll ticks within < 0.1s
        for _ in range(15):
            self.worker.trigger_detection_check()

        # Idempotency guard must suppress all 15 duplicate ticks
        self.assertEqual(len(specs_emitted), 1)

    def test_idempotency_guard_expires_after_2_seconds(self):
        """Verify that identical device triggers re-emission after 2.0s elapsed."""
        specs_emitted = []
        self.worker.on_device_connected = lambda s: specs_emitted.append(s)

        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(specs_emitted), 1)

        # Manually backdate _last_processed_time by 2.1 seconds to simulate time lapse
        self.worker._last_processed_time = time.time() - 2.5
        self.worker.trigger_detection_check()

        # Now it should emit again
        self.assertEqual(len(specs_emitted), 2)

    def test_idempotency_guard_resets_on_serial_change(self):
        """Verify changing device serial immediately triggers emission even if <2s."""
        specs_emitted = []
        self.worker.on_device_connected = lambda s: specs_emitted.append(s)

        # S24 connected
        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(specs_emitted), 1)

        # Immediately switch to iPhone16 (< 0.01s elapsed)
        self.worker.set_mock_mode("mock_iphone16")
        self.assertEqual(len(specs_emitted), 2)
        self.assertEqual(specs_emitted[-1].brand, "Apple")

    def test_qt_signals_parity_with_python_callbacks(self):
        """Verify Qt signals (if available) emit identical payloads as Python callbacks."""
        cb_specs = []
        sig_specs = []
        cb_status = []
        sig_status = []

        self.worker.on_device_connected = lambda s: cb_specs.append(s)
        self.worker.on_status_changed = lambda st: cb_status.append(st)

        self.worker.specs_received.connect(lambda s: sig_specs.append(s))
        self.worker.status_changed.connect(lambda st: sig_status.append(st))

        self.worker.set_mock_mode("mock_s24")

        self.assertEqual(len(cb_specs), len(sig_specs))
        self.assertEqual(cb_specs[0].device_id, sig_specs[0].device_id)
        self.assertEqual(len(cb_status), len(sig_status))
        self.assertEqual(cb_status[0]["state"], sig_status[0]["state"])

    def test_debouncing_wmi_and_track_devices_structure(self):
        """Verify the 600ms debounce constant is maintained in detection listeners."""
        # Check source implementation for the 0.6s sleep
        import inspect
        from core import device_detector

        wmi_src = inspect.getsource(device_detector.DeviceDetectorWorker._start_wmi_listener)
        self.assertIn("0.6", wmi_src, "WMI listener must contain 600ms (0.6s) contact debounce")

        track_src = inspect.getsource(device_detector.DeviceDetectorWorker._start_track_devices_listener)
        self.assertIn("0.6", track_src, "Track-devices listener must contain 600ms (0.6s) contact debounce")

    def test_start_stop_polling_idempotency(self):
        """Calling start_polling and stop_polling repeatedly must not leak or raise."""
        with patch.object(self.worker, "_start_wmi_listener"), patch.object(self.worker, "_start_track_devices_listener"):
            for _ in range(3):
                self.worker.start_polling(interval_ms=5000)
                self.worker.stop_polling()

    def test_concurrent_trigger_detection_check(self):
        """Simultaneous triggers from multiple threads must not raise exceptions."""
        import threading
        self.worker.set_mock_mode("mock_s24")
        threads = []
        errors = []

        def trigger():
            try:
                for _ in range(10):
                    self.worker.trigger_detection_check()
            except Exception as e:
                errors.append(e)

        for _ in range(5):
            t = threading.Thread(target=trigger)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Concurrent triggers raised errors: {errors}")


class TestExtendedIosEdgeCases(unittest.TestCase):
    """Deep nested structures and stringified inputs for calculate_ios_battery_health."""

    def test_deeply_nested_plist_dictionary(self):
        """Keys located deep within nested dictionaries or arrays."""
        nested = {
            "root": {
                "subsystem": {
                    "power": {
                        "NominalChargeCapacity": 3000,
                        "DesignCapacity": 3200,
                        "CycleCount": 75,
                    }
                }
            }
        }
        health, cycles = calculate_ios_battery_health(nested)
        # 3000 / 3200 * 100 = 93.75 -> 94
        self.assertEqual(health, 94)
        self.assertEqual(cycles, 75)

    def test_stringified_numbers(self):
        """Values provided as string representations of numbers."""
        data = {
            "NominalChargeCapacity": "3100",
            "DesignCapacity": "3274",
            "CycleCount": "150"
        }
        health, cycles = calculate_ios_battery_health(data)
        self.assertEqual(health, 95)
        self.assertEqual(cycles, 150)

    def test_stringified_invalid_numbers(self):
        """Non-numeric string values must not raise and return None."""
        data = {
            "NominalChargeCapacity": "corrupt_data",
            "DesignCapacity": "3274",
            "CycleCount": "invalid"
        }
        health, cycles = calculate_ios_battery_health(data)
        self.assertIsNone(health)
        self.assertIsNone(cycles)

    def test_extended_international_regions(self):
        """Test extended regions: AB/A (Middle East), FD/A (France), VN/A (Vietnam), HN/A (India)."""
        # AB/A
        p, r = parse_apple_part_and_region("MLQ73", "AB/A")
        self.assertEqual(p, "MLQ73AB/A")
        self.assertEqual(r, "AB/A")
        self.assertIn("Middle East", decode_apple_region(r))

        # FD/A
        p, r = parse_apple_part_and_region("MLQ73", "FD/A")
        self.assertEqual(p, "MLQ73FD/A")
        self.assertEqual(r, "FD/A")
        self.assertIn("France", decode_apple_region(r))

        # VN/A
        p, r = parse_apple_part_and_region("MLQ73", "VN/A")
        self.assertEqual(p, "MLQ73VN/A")
        self.assertEqual(r, "VN/A")
        self.assertIn("Vietnam", decode_apple_region(r))

        # HN/A
        p, r = parse_apple_part_and_region("MLQ73", "HN/A")
        self.assertEqual(p, "MLQ73HN/A")
        self.assertEqual(r, "HN/A")
        self.assertIn("India", decode_apple_region(r))


if __name__ == "__main__":
    unittest.main()

