"""
Unit tests for Zero-Click Background USB Detector (core/device_detector.py).
Tests DeviceDetectorWorker, mock mode routing, state machine transitions,
idempotency guards, and target mobile VIDs filtering.
"""
import time
import unittest
from unittest.mock import MagicMock, patch

from core.device_detector import (
    DeviceDetectorWorker,
    ConnectionState,
    TARGET_MOBILE_VIDS,
    PollingWorker
)
from core.models import DeviceSpecs


class TestDeviceDetectorConstants(unittest.TestCase):
    """Validates constants, VIDs, and Enums."""

    def test_target_mobile_vids_contain_major_oems(self):
        self.assertIn("05AC", TARGET_MOBILE_VIDS)  # Apple
        self.assertIn("18D1", TARGET_MOBILE_VIDS)  # Google
        self.assertIn("04E8", TARGET_MOBILE_VIDS)  # Samsung
        self.assertIn("2717", TARGET_MOBILE_VIDS)  # Xiaomi
        self.assertIn("22D9", TARGET_MOBILE_VIDS)  # Oppo
        self.assertIn("12D1", TARGET_MOBILE_VIDS)  # Huawei
        self.assertIn("0E8D", TARGET_MOBILE_VIDS)  # MediaTek
        self.assertIn("05C6", TARGET_MOBILE_VIDS)  # Qualcomm

    def test_connection_state_enum(self):
        self.assertEqual(ConnectionState.DISCONNECTED.value, "disconnected")
        self.assertEqual(ConnectionState.CONNECTED_ADB.value, "adb")
        self.assertEqual(ConnectionState.CONNECTED_FASTBOOT.value, "fastboot")
        self.assertEqual(ConnectionState.CONNECTED_IOS.value, "ios")
        self.assertEqual(ConnectionState.CONNECTED_IOS_LOCKED.value, "ios_locked")
        self.assertEqual(ConnectionState.CONNECTED_IOS_TRUST_PENDING.value, "ios_trust_pending")

    def test_polling_worker_alias(self):
        self.assertIs(PollingWorker, DeviceDetectorWorker)


class TestDeviceDetectorWorkerMockModes(unittest.TestCase):
    """Validates mock simulation routing in DeviceDetectorWorker."""

    def setUp(self):
        self.worker = DeviceDetectorWorker()

    def tearDown(self):
        self.worker.stop_polling()

    def test_mock_s24_mode(self):
        received_specs = []
        statuses = []
        self.worker.on_device_connected = lambda s: received_specs.append(s)
        self.worker.on_status_changed = lambda st: statuses.append(st)

        self.worker.set_mock_mode("mock_s24")

        self.assertGreaterEqual(len(received_specs), 1)
        specs = received_specs[0]
        self.assertEqual(specs.brand, "Samsung")
        self.assertEqual(specs.marketing_name, "Galaxy S24 Ultra")
        self.assertEqual(specs.storage, "512GB")

        self.assertGreaterEqual(len(statuses), 1)
        st = statuses[-1]
        self.assertTrue(st["adb"])
        self.assertEqual(st["state"], "adb")
        self.assertIn("S24", st["description"])

    def test_mock_iphone16_mode(self):
        received_specs = []
        statuses = []
        self.worker.on_device_connected = lambda s: received_specs.append(s)
        self.worker.on_status_changed = lambda st: statuses.append(st)

        self.worker.set_mock_mode("mock_iphone16")

        self.assertGreaterEqual(len(received_specs), 1)
        specs = received_specs[0]
        self.assertEqual(specs.brand, "Apple")
        self.assertEqual(specs.marketing_name, "iPhone 16 Pro Max")
        self.assertEqual(specs.storage, "256GB")

        self.assertGreaterEqual(len(statuses), 1)
        st = statuses[-1]
        self.assertTrue(st["ios"])
        self.assertEqual(st["state"], "ios")

    def test_mock_fastboot_mode(self):
        received_specs = []
        statuses = []
        self.worker.on_device_connected = lambda s: received_specs.append(s)
        self.worker.on_status_changed = lambda st: statuses.append(st)

        self.worker.set_mock_mode("mock_fastboot")

        self.assertGreaterEqual(len(received_specs), 1)
        specs = received_specs[0]
        self.assertEqual(specs.connection_type, "fastboot")

        st = statuses[-1]
        self.assertTrue(st["fastboot"])
        self.assertEqual(st["state"], "fastboot")

    def test_mock_offline_mode_emits_disconnect(self):
        received_specs = []
        disconnected = []
        self.worker.on_device_connected = lambda s: received_specs.append(s)
        self.worker.on_device_disconnected = lambda: disconnected.append(True)

        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(received_specs), 1)

        self.worker.set_mock_mode("mock_offline")
        self.assertEqual(len(disconnected), 1)


class TestDeviceDetectorIdempotencyAndDebounce(unittest.TestCase):
    """Validates connection idempotency and debouncing behavior."""

    def setUp(self):
        self.worker = DeviceDetectorWorker()

    def tearDown(self):
        self.worker.stop_polling()

    def test_idempotent_duplicate_suppression(self):
        # Multiple triggers for same device within 2 seconds should only emit once
        received_specs = []
        self.worker.on_device_connected = lambda s: received_specs.append(s)

        self.worker.set_mock_mode("mock_s24")
        self.assertEqual(len(received_specs), 1)

        # Trigger poll tick again immediately
        self.worker.trigger_detection_check()
        self.assertEqual(len(received_specs), 1)  # Suppressed by idempotency guard

    def test_recovery_after_disconnect(self):
        events = []
        self.worker.on_device_connected = lambda s: events.append(("connected", s.device_id))
        self.worker.on_device_disconnected = lambda: events.append(("disconnected", None))

        self.worker.set_mock_mode("mock_s24")
        self.worker.set_mock_mode("mock_offline")
        self.worker.set_mock_mode("mock_s24")

        self.assertEqual(len(events), 3)
        self.assertEqual(events[0][0], "connected")
        self.assertEqual(events[1][0], "disconnected")
        self.assertEqual(events[2][0], "connected")


if __name__ == "__main__":
    unittest.main()
