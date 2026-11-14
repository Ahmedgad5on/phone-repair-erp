"""
Empirical Verification and Deep Adversarial Stress Harness
Milestone 1 Iteration 2 (Remediation)
"""
import sys
import plistlib
import math
from typing import Any, List, Dict

# Ensure project root is in path
sys.path.insert(0, r"c:\Users\Eng_Ahmed\Desktop\label")

from core.ios_reader import (
    resolve_apple_model,
    parse_ios_commercial_storage,
    resolve_apple_color,
    decode_apple_region,
    parse_apple_part_and_region,
    calculate_ios_battery_health,
    parse_ideviceinfo_xml,
    IOSReader,
)
from core.adb_reader import (
    sanitize_adb_output,
    parse_android_commercial_storage,
    parse_android_commercial_ram,
    parse_storage_from_df,
    parse_ram_from_meminfo,
    resolve_samsung_model,
    resolve_marketing_name,
    parse_imei_from_service_call,
    parse_battery_info,
    parse_bootloader_status,
    AdbReader,
)
from core.mock_device import MockDeviceProvider, MockCommandSimulator, validate_luhn_imei
from core.models import DeviceSpecs, RepairTicket

results = []

def record(test_name: str, passed: bool, detail: str = ""):
    results.append((test_name, passed, detail))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {test_name}: {detail}")

print("=== 1. VERIFYING SPECIFIED CRASH VECTORS ===")

# Vector 1: parse_ideviceinfo_xml with list root
try:
    for root in [["iPhone16,1", "128GB"], "just a string", 12345, True, None]:
        if root is not None:
            xml_data = plistlib.dumps(root)
        else:
            xml_data = None
        res = parse_ideviceinfo_xml(xml_data)
        assert res is None, f"Expected None for non-dict root {type(root)}, got {res}"
    record("parse_ideviceinfo_xml_non_dict_root", True, "Returns None safely for all non-dict roots")
except Exception as e:
    record("parse_ideviceinfo_xml_non_dict_root", False, f"Crash: {e}")

# Vector 2: parse_ideviceinfo_xml with non-integer TotalDiskCapacity
try:
    bad_capacities = [
        "corrupted_capacity_string",
        "  128000000000  ",
        "-5000",
        {"nested": "dict"},
        ["list"],
        3.14159,
        True,
        False,
    ]
    for cap in bad_capacities:
        plist_dict = {
            "ProductType": "iPhone16,1",
            "TotalDiskCapacity": cap,
            "SerialNumber": "F17ABCDEF123",
            "UniqueDeviceID": "00008101-0011223344556677",
        }
        xml_data = plistlib.dumps(plist_dict)
        res = parse_ideviceinfo_xml(xml_data)
        assert res is not None, f"Failed to parse plist with capacity {cap}"
        assert isinstance(res.storage, str), f"Storage should be str, got {type(res.storage)}"
    # Also test with raw XML string missing TotalDiskCapacity or having strange tag
    xml_no_cap = b"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductType</key><string>iPhone16,1</string>
    <key>TotalDiskCapacity</key><string></string>
</dict></plist>"""
    res_no_cap = parse_ideviceinfo_xml(xml_no_cap)
    assert res_no_cap is not None and res_no_cap.storage == "Unknown"
    record("parse_ideviceinfo_xml_non_integer_capacity", True, "Handles corrupt / strange storage types safely")
except Exception as e:
    record("parse_ideviceinfo_xml_non_integer_capacity", False, f"Crash: {e}")

# Vector 3: calculate_ios_battery_health with string values
try:
    test_cases = [
        ({"NominalChargeCapacity": "2500", "DesignCapacity": "3000"}, (83, None)),
        ({"NominalChargeCapacity": "0", "DesignCapacity": "3000"}, (0, None)),
        ({"NominalChargeCapacity": 0, "DesignCapacity": 3000}, (0, None)),
        ({"NominalChargeCapacity": "corrupt", "DesignCapacity": "bad"}, (None, None)),
        ({"MaximumCapacityPercent": "98", "CycleCount": "120"}, (98, 120)),
        ({"MaximumCapacityPercent": "invalid", "NominalChargeCapacity": "2000", "DesignCapacity": "2000"}, (100, None)),
        ({"NominalChargeCapacity": 3000, "DesignCapacity": 0}, (None, None)),
        ({"NominalChargeCapacity": -500, "DesignCapacity": 3000}, (0, None)),
        ({}, (None, None)),
        (None, (None, None)),
        (b"garbage not xml", (None, None)),
    ]
    for payload, expected in test_cases:
        res = calculate_ios_battery_health(payload)
        assert res == expected, f"Payload {payload} expected {expected}, got {res}"
    record("calculate_ios_battery_health_string_values", True, "Accurately parses strings and depleted batteries")
except Exception as e:
    record("calculate_ios_battery_health_string_values", False, f"Crash/Mismatch: {e}")

# Vector 4: resolve_apple_model(None) and extreme types
try:
    for pt in [None, "", "   ", 12345, ["list"], {"dict": 1}, True, False, "iPhone99,9", "iPad14,1"]:
        res = resolve_apple_model(pt)
        assert isinstance(res, str) and len(res) > 0, f"Failed for {pt}: {res}"
    assert resolve_apple_model(None) == "Apple Device"
    assert resolve_apple_model("iPhone16,1") == "iPhone 15 Pro"
    record("resolve_apple_model_none_and_types", True, "Safe against None, non-strings, and future models")
except Exception as e:
    record("resolve_apple_model_none_and_types", False, f"Crash: {e}")

# Vector 5: resolve_marketing_name(None, ...)
try:
    for m_code in [None, "", "   ", 123, True, "SM-S928B", "23117RK66C", "CPH2415", "Pixel 8 Pro", "Unknown"]:
        for mfr in [None, "", "Samsung", "Xiaomi", "Google", "OPPO", 456]:
            for mkt in [None, "", "Custom Market Name", 789]:
                b, m = resolve_marketing_name(m_code, mfr, mkt)
                assert isinstance(b, str) and isinstance(m, str)
    assert resolve_marketing_name(None, "Samsung", "") == ("Samsung", "Samsung Galaxy")
    assert resolve_marketing_name("SM-S928B", "Samsung", "") == ("Samsung", "Galaxy S24 Ultra")
    record("resolve_marketing_name_none_and_matrix", True, "Matrix of None and non-string inputs evaluated safely")
except Exception as e:
    record("resolve_marketing_name_none_and_matrix", False, f"Crash: {e}")

# Vector 6: resolve_samsung_model(None)
try:
    for sc in [None, "", "   ", 12345, True, "sm-s928b", "SM-A546B", "NON-SAMSUNG", "SM-UNKNOWN"]:
        res = resolve_samsung_model(sc)
        if sc in [None, "", "   ", 12345, True, "NON-SAMSUNG", "SM-UNKNOWN"]:
            # SM-UNKNOWN might return None or fallback
            pass
        elif "s928" in str(sc):
            assert res == "Galaxy S24 Ultra"
    assert resolve_samsung_model(None) is None
    record("resolve_samsung_model_none", True, "Safe against None and non-matching model codes")
except Exception as e:
    record("resolve_samsung_model_none", False, f"Crash: {e}")

# Vector 7: parse_battery_info("") and anomalies
try:
    res_empty = parse_battery_info("")
    assert res_empty == (0, None, None), f"Expected (0, None, None) on empty, got {res_empty}"
    
    res_none = parse_battery_info(None)
    assert res_none == (0, None, None), f"Expected (0, None, None) on None, got {res_none}"
    
    res_whitespace = parse_battery_info("   \n\r  ")
    assert res_whitespace == (0, None, None), f"Expected (0, None, None) on whitespace, got {res_whitespace}"

    dumpsys_healthy = """Current Battery Service state:
  AC powered: true
  level: 85
  scale: 100
  health: 2
  mSavedBatteryAsoc: 94
  mSavedBatteryUsage: 215
"""
    assert parse_battery_info(dumpsys_healthy) == (85, 94, 215)

    dumpsys_legacy_good = """Current Battery Service state:
  level: 50
  scale: 100
  health: 2
"""
    assert parse_battery_info(dumpsys_legacy_good) == (50, 95, None)

    dumpsys_legacy_poor = """Current Battery Service state:
  level: 50
  scale: 100
  health: 3
"""
    assert parse_battery_info(dumpsys_legacy_poor) == (50, 70, None)
    
    record("parse_battery_info_anomalies", True, "Accurate level, health code, ASOC, and cycles parsing without false 95%")
except Exception as e:
    record("parse_battery_info_anomalies", False, f"Crash/Mismatch: {e}")

# Vector 8: parse_storage_from_df(None) and anomalies
try:
    assert parse_storage_from_df(None) == "Unknown"
    assert parse_storage_from_df("") == "Unknown"
    assert parse_storage_from_df("Permission denied") == "Unknown"
    assert parse_storage_from_df(12345) == "Unknown"

    df_sample = """Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/block/dm-4 233766788 12345678 221421110  6% /data
"""
    assert parse_storage_from_df(df_sample) == "256GB"
    record("parse_storage_from_df_adversarial", True, "Safe against None, non-strings, and parses valid 256GB correctly")
except Exception as e:
    record("parse_storage_from_df_adversarial", False, f"Crash/Mismatch: {e}")

print("\n=== 2. DEEP STRESS TESTING ON REMAINING PARSERS ===")

# RAM parser
try:
    assert parse_ram_from_meminfo(None) == "Unknown"
    assert parse_ram_from_meminfo("") == "Unknown"
    assert parse_ram_from_meminfo(123) == "Unknown"
    assert parse_ram_from_meminfo("MemTotal:        11728340 kB\n") == "12GB"
    assert parse_ram_from_meminfo("MemTotal:        corrupt kB\n") == "Unknown"
    record("parse_ram_from_meminfo_adversarial", True, "Safe against None, non-strings, corrupt values")
except Exception as e:
    record("parse_ram_from_meminfo_adversarial", False, f"Crash: {e}")

# IMEI parcel parser
try:
    assert parse_imei_from_service_call(None) is None
    assert parse_imei_from_service_call("") is None
    assert parse_imei_from_service_call(12345) is None
    assert parse_imei_from_service_call("Result: Parcel(00000000: ...)") is None
    parcel_valid = "Result: Parcel(00000000 0000000f 00350033 00380036 '....3.5.6.8.' 00330030 00300039 '3.0.9.0.' 00310034 00390035 '1.4.5.9.' 00380034 00000030 '8.4.0...')"
    imei_extracted = parse_imei_from_service_call(parcel_valid)
    assert imei_extracted == "356830901459840", f"Extracted: {imei_extracted}"
    record("parse_imei_from_service_call_adversarial", True, "Safe against None, non-strings, extracts valid IMEI")
except Exception as e:
    record("parse_imei_from_service_call_adversarial", False, f"Crash: {e}")

# Bootloader parser
try:
    for fl in [None, "", "unknown", "1", "0", "true", "false", "locked", "unlocked"]:
        for vbs in [None, "", "green", "orange", "yellow", "red", "unknown"]:
            res = parse_bootloader_status(fl, vbs)
            assert res in (True, False, None), f"Unexpected status {res} for ({fl}, {vbs})"
    assert parse_bootloader_status("1", "") is True
    assert parse_bootloader_status("0", "") is False
    assert parse_bootloader_status("", "green") is True
    assert parse_bootloader_status("", "orange") is False
    assert parse_bootloader_status(None, None) is None
    record("parse_bootloader_status_adversarial", True, "Parses unlock state reliably")
except Exception as e:
    record("parse_bootloader_status_adversarial", False, f"Crash: {e}")

# MockDeviceProvider Lifecycle and Stress
try:
    provider = MockDeviceProvider()
    profiles = provider.get_available_profiles()
    assert len(profiles) >= 3, f"Profiles found: {profiles}"
    assert "mock_s24_ultra" in profiles

    specs = provider.connect_profile("mock_s24_ultra")
    assert specs is not None
    assert specs.brand == "Samsung"
    assert validate_luhn_imei(specs.imei1) is True

    # Test random generation
    rand_specs = provider.connect_random()
    assert rand_specs is not None
    assert validate_luhn_imei(rand_specs.imei1) is True

    provider.disconnect()
    ctype, cur = provider.poll_tick()
    assert ctype == "none" and cur is None

    record("mock_device_provider_stress", True, "Mock provider handles connect, random, and disconnect lifecycles")
except Exception as e:
    record("mock_device_provider_stress", False, f"Crash: {e}")

# DeviceSpecs and RepairTicket validation
try:
    specs = DeviceSpecs(
        connection_type="ios",
        device_id="UDID-TEST",
        brand="Apple",
        marketing_name="iPhone 16 Pro Max",
        model_code="MYW23LL/A",
        storage="512GB",
        ram="8GB",
        color="Desert Titanium",
        os_version="iOS 18.1",
        serial_number="DNPTEST1234",
        imei1="351234567890123",
        imei2=None,
        battery_health=100,
        battery_cycles=5,
        sales_region="LL/A",
        bootloader_locked=True,
    )
    d = specs.to_dict()
    # Add unexpected extra keys
    d["extra_bogus_key"] = "adversarial_payload"
    specs2 = DeviceSpecs.from_dict(d)
    assert specs2.marketing_name == "iPhone 16 Pro Max"
    assert specs2.battery_health == 100
    assert not hasattr(specs2, "extra_bogus_key")
    record("models_serialization_and_resilience", True, "DeviceSpecs resilient to extra dictionary keys")
except Exception as e:
    record("models_serialization_and_resilience", False, f"Crash: {e}")

print("\n=== SUMMARY OF CHALLENGE RESULTS ===")
total = len(results)
passed = sum(1 for _, p, _ in results if p)
failed = total - passed
print(f"Total Probes Executed: {total}")
print(f"Passed: {passed}")
print(f"Failed: {failed}")

if failed == 0:
    print("\nFINAL EVALUATION: ALL ADVERSARIAL CHECKS PASSED. ZERO DEFECTS FOUND.")
    sys.exit(0)
else:
    print(f"\nFINAL EVALUATION: {failed} CHECKS FAILED.")
    sys.exit(1)
