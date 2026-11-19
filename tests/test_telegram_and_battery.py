"""
tests/test_telegram_and_battery.py — Verifies Telegram notifications & Apple-only battery health logic
"""
import os
import tempfile
import unittest

from core.database import DatabaseManager
from core.models import DeviceSpecs, DeviceRecord
from core.label_template_model import LabelElement, resolve_field_value
from core.label_template_renderer import should_render_element
from core.label_renderer import format_compact_smart_merge


class TestTelegramAndBattery(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")
        self.db = DatabaseManager(db_path=self.db_path)

    def tearDown(self):
        self.db.close()
        self.temp_dir.cleanup()

    def test_battery_omitted_for_android_rendered_for_apple(self):
        el = LabelElement(id="bat", field_key="battery_health", title="Bat", content="100%")

        # Android device
        android_specs = DeviceSpecs.empty()
        android_specs.connection_type = "adb"
        android_specs.device_id = "android_1"
        android_specs.brand = "Samsung"
        android_specs.marketing_name = "Galaxy S24 Ultra"
        android_specs.battery_health = 85
        self.assertFalse(should_render_element(el, android_specs))
        self.assertEqual(resolve_field_value(el.field_key, android_specs), "")
        merge_android = format_compact_smart_merge("Galaxy S24", "256GB", "Black", 85, is_apple=False)
        self.assertNotIn("85%", merge_android)

        # Apple device
        apple_specs = DeviceSpecs.empty()
        apple_specs.connection_type = "ios"
        apple_specs.device_id = "apple_1"
        apple_specs.brand = "Apple"
        apple_specs.marketing_name = "iPhone 15 Pro Max"
        apple_specs.battery_health = 99
        self.assertTrue(should_render_element(el, apple_specs))
        self.assertEqual(resolve_field_value(el.field_key, apple_specs), "99%")
        merge_apple = format_compact_smart_merge("iPhone 15 Pro", "256GB", "Natural", 99, is_apple=True)
        self.assertIn("99%", merge_apple)

    def test_telegram_enqueue_and_message_content(self):
        # Insert Android device
        dev_android = DeviceRecord(
            stock_no="STK-A01",
            condition="Used",
            brand="Xiaomi",
            model_name="Redmi Note 13",
            buy_price=5000,
            target_selling_price=6500,
            battery_health=90
        )
        dev_id = self.db.insert_device(dev_android)
        self.assertGreater(dev_id, 0)

        # Check offline queue
        pending = self.db.get_pending_telegram_queue(limit=10)
        self.assertTrue(len(pending) > 0)
        latest_item = pending[-1]
        self.assertEqual(latest_item["item_type"], "intake_alert")
        # Android intake message must NOT contain battery health line
        self.assertNotIn("حالة البطارية", latest_item["payload_json"])

        # Insert Apple device
        dev_apple = DeviceRecord(
            stock_no="STK-IP01",
            condition="Used",
            brand="Apple",
            model_name="iPhone 13",
            buy_price=18000,
            target_selling_price=21000,
            battery_health=88
        )
        dev_id_apple = self.db.insert_device(dev_apple)
        self.assertGreater(dev_id_apple, 0)

        pending = self.db.get_pending_telegram_queue(limit=10)
        latest_item = pending[-1]
        self.assertEqual(latest_item["item_type"], "intake_alert")
        # Apple intake message MUST contain battery health line
        self.assertIn("حالة البطارية:</b> 88%", latest_item["payload_json"])

    def test_telegram_bot_emit_log_and_commands(self):
        from core.telegram_bot import TradingTelegramBot
        self.db.set_setting("telegram_bot_token", "123456789:ABCdefGHIjklMNOpqrsTUVwxyz")
        self.db.set_setting("telegram_owner_chat_id", "1065573291")
        self.db.set_setting("owner_pin", "1234")

        bot = TradingTelegramBot(self.db)
        # Test _emit_log does not raise AttributeError
        bot._emit_log("Test log emission")

        # Test execute_direct_command
        help_res = bot.execute_direct_command("/help")
        self.assertIn("دليل الأوامر", help_res)

        status_res = bot.execute_direct_command("/status")
        self.assertIn("حالة نظام تيليجرام", status_res)

        # Test auth_owner with correct PIN
        bot._handle_message({
            "chat": {"id": 1065573291},
            "text": "/auth_owner 1234",
            "from": {"first_name": "Ahmed", "last_name": "Gad", "username": "ahmed"}
        })
        self.assertEqual(bot._get_user_role(1065573291), "Owner")

    def test_telegram_card_and_lookup_battery_filter(self):
        from core.telegram_bot import TradingTelegramBot
        bot = TradingTelegramBot(self.db)

        # Mock direct messages sent
        sent_messages = []
        bot.send_direct_message = lambda chat_id, text, reply_markup=None: sent_messages.append(text)

        # Android card
        android_dev = {
            "id": 1,
            "brand": "Samsung",
            "model_name": "Galaxy S24",
            "model_code": "SM-S921B",
            "storage": "256GB",
            "color": "Black",
            "condition": "Used",
            "tax_status": "Paid",
            "battery_health": 90,
            "battery_cycles": 120,
            "target_selling_price": 30000,
            "min_allowed_price": 28000,
            "buy_price": 25000,
            "secret_cost_cipher": "ABC",
            "stock_no": "STK-SAM-1",
            "imei1": "123456789012345"
        }
        bot._send_device_card(1065573291, android_dev, "Owner")
        self.assertTrue(len(sent_messages) > 0)
        self.assertNotIn("البطارية", sent_messages[-1])

        # Apple card
        apple_dev = {
            "id": 2,
            "brand": "Apple",
            "model_name": "iPhone 15 Pro",
            "model_code": "A3102",
            "storage": "256GB",
            "color": "Natural Titanium",
            "condition": "Used",
            "tax_status": "Paid",
            "battery_health": 95,
            "battery_cycles": 45,
            "target_selling_price": 50000,
            "min_allowed_price": 48000,
            "buy_price": 42000,
            "secret_cost_cipher": "XYZ",
            "stock_no": "STK-APL-1",
            "imei1": "987654321098765"
        }
        bot._send_device_card(1065573291, apple_dev, "Owner")
        self.assertIn("البطارية:</b> 95%", sent_messages[-1])


if __name__ == "__main__":
    unittest.main()
