"""
Hardware Simulation & Mock Device Engine.
Provides realistic Android (ADB), iOS, and Fastboot device simulation
for zero-hardware development, automated testing, and UI preview workflows.
"""
from dataclasses import replace
import random
import re
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple, Any

from core.models import DeviceSpecs


# ============================================================================
# 1. Luhn Algorithm Utilities
# ============================================================================

def calculate_luhn_check_digit(fourteen_digits: str) -> str:
    """Calculates the 15th Luhn check digit from a 14-digit numeric string."""
    digits = re.sub(r"\D", "", fourteen_digits)
    if len(digits) != 14:
        raise ValueError(f"Input must be exactly 14 digits, got '{fourteen_digits}'")
    total = 0
    for i, char in enumerate(digits):
        n = int(char)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    check = (10 - (total % 10)) % 10
    return str(check)


def validate_luhn_imei(imei: Optional[str]) -> bool:
    """Validates whether a string is a valid 15-digit Luhn-compliant IMEI."""
    if not imei or not isinstance(imei, str):
        return False
    digits = re.sub(r"\D", "", imei)
    if len(digits) != 15:
        return False
    expected_check = calculate_luhn_check_digit(digits[:14])
    return digits[14] == expected_check


def generate_luhn_imei(tac_prefix: Optional[str] = None) -> str:
    """Generates a realistic 15-digit Luhn-valid IMEI."""
    if tac_prefix and tac_prefix.isdigit() and len(tac_prefix) <= 14:
        tac = tac_prefix
    else:
        tac = random.choice(["358901", "351782", "353284", "862341", "359871", "861294"])
    needed = 14 - len(tac)
    body = tac + "".join([str(random.randint(0, 9)) for _ in range(needed)])
    check_digit = calculate_luhn_check_digit(body)
    return body + check_digit


# ============================================================================
# 2. Pre-Configured Mock Profiles
# ============================================================================

MOCK_S24_ULTRA = DeviceSpecs(
    connection_type="adb",
    device_id="R5CX109876U",
    brand="Samsung",
    marketing_name="Galaxy S24 Ultra",
    model_code="SM-S928B",
    storage="512GB",
    ram="12GB",
    color="Titanium Gray",
    os_version="Android 14",
    serial_number="R5CX109876U",
    imei1="351782110293840",
    imei2="351782110293857",
    battery_health=98,
    battery_cycles=45,
    sales_region="EUX",
    bootloader_locked=True,
    condition_grade="A+",
    remarks="Samsung Flagship Demo Unit - Scratchless",
    raw_properties={
        "ro.product.model": "SM-S928B",
        "ro.product.manufacturer": "samsung",
        "ro.build.version.release": "14",
        "df_data_kb": 458752000,
        "mem_total_kb": 11854320,
        "battery_level": 98,
        "is_mock": True,
        "profile_key": "mock_s24_ultra"
    }
)

MOCK_IPHONE16_PROMAX = DeviceSpecs(
    connection_type="ios",
    device_id="00008140-001928374650001E",
    brand="Apple",
    marketing_name="iPhone 16 Pro Max",
    model_code="iPhone17,2",
    storage="256GB",
    ram="8GB",
    color="Desert Titanium",
    os_version="iOS 18.1",
    serial_number="H2LGD0987XMY",
    imei1="358901230192830",
    imei2="358901230192848",
    battery_health=100,
    battery_cycles=12,
    sales_region="LL/A",
    bootloader_locked=True,
    condition_grade="A+",
    remarks="Pristine condition - AppleCare active",
    raw_properties={
        "ProductType": "iPhone17,2",
        "ProductVersion": "18.1",
        "TotalDiskCapacity": 256071352320,
        "ModelNumber": "MYWV3",
        "RegionInfo": "LL/A",
        "is_mock": True,
        "profile_key": "mock_iphone16_promax"
    }
)

MOCK_IPHONE15_PRO = DeviceSpecs(
    connection_type="ios",
    device_id="00008130-001122334455002F",
    brand="Apple",
    marketing_name="iPhone 15 Pro",
    model_code="iPhone16,1",
    storage="128GB",
    ram="8GB",
    color="Natural Titanium",
    os_version="iOS 17.5",
    serial_number="G6VGD012345Z",
    imei1="353284091234560",
    imei2="353284091234578",
    battery_health=89,
    battery_cycles=342,
    sales_region="J/A",
    bootloader_locked=True,
    condition_grade="A",
    remarks="Minor bezel wear - Battery servicing suggested soon",
    raw_properties={
        "ProductType": "iPhone16,1",
        "ProductVersion": "17.5",
        "TotalDiskCapacity": 128035676160,
        "ModelNumber": "MTUX3",
        "RegionInfo": "J/A",
        "is_mock": True,
        "profile_key": "mock_iphone15_pro"
    }
)

MOCK_FASTBOOT_DEVICE = DeviceSpecs(
    connection_type="fastboot",
    device_id="0x9a8b7c6d",
    brand="Xiaomi",
    marketing_name="Xiaomi 13 Pro (Fastboot)",
    model_code="2210132G",
    storage="N/A (Fastboot)",
    ram="N/A (Fastboot)",
    color="Ceramic Black",
    os_version="Fastboot Mode",
    serial_number="0x9a8b7c6d",
    imei1="Fastboot (Scan Barcode)",
    imei2=None,
    battery_health=None,
    battery_cycles=None,
    sales_region="Global",
    bootloader_locked=False,
    condition_grade="A",
    remarks="Fastboot mode detected - Bootloader Unlocked",
    raw_properties={
        "product": "nuwa",
        "unlocked": "yes",
        "is_mock": True,
        "profile_key": "mock_fastboot_device"
    }
)

PRECONFIGURED_PROFILES: Dict[str, DeviceSpecs] = {
    "mock_s24_ultra": MOCK_S24_ULTRA,
    "mock_iphone16_promax": MOCK_IPHONE16_PROMAX,
    "mock_iphone15_pro": MOCK_IPHONE15_PRO,
    "mock_fastboot_device": MOCK_FASTBOOT_DEVICE,
}


# ============================================================================
# 3. Dynamic Profile Generator
# ============================================================================

def generate_random_profile(brand_hint: Optional[str] = None) -> DeviceSpecs:
    """
    Generates a procedurally constructed, fully realistic DeviceSpecs instance
    with authentic storage/RAM ratios, valid Luhn IMEIs, and coherent battery wear.
    """
    brands = ["Apple", "Samsung", "Xiaomi", "OnePlus"]
    selected_brand = brand_hint.title() if brand_hint and brand_hint.title() in brands else random.choice(brands)

    if selected_brand == "Apple":
        models = [
            ("iPhone 16 Pro Max", "iPhone17,2", ["256GB", "512GB", "1TB"], "8GB", ["Desert Titanium", "Natural Titanium", "Black Titanium"]),
            ("iPhone 16 Pro", "iPhone17,1", ["128GB", "256GB", "512GB", "1TB"], "8GB", ["Natural Titanium", "White Titanium", "Black Titanium"]),
            ("iPhone 16", "iPhone17,3", ["128GB", "256GB", "512GB"], "8GB", ["Ultramarine", "Teal", "Pink", "White", "Black"]),
            ("iPhone 15 Pro", "iPhone16,1", ["128GB", "256GB", "512GB", "1TB"], "8GB", ["Natural Titanium", "Blue Titanium", "White Titanium"]),
            ("iPhone 15", "iPhone15,4", ["128GB", "256GB", "512GB"], "6GB", ["Blue", "Pink", "Yellow", "Green", "Black"]),
            ("iPhone 14 Pro", "iPhone15,2", ["128GB", "256GB", "512GB", "1TB"], "6GB", ["Deep Purple", "Space Black", "Gold", "Silver"]),
            ("iPhone 13", "iPhone14,5", ["128GB", "256GB", "512GB"], "4GB", ["Midnight", "Starlight", "Blue", "Pink", "Red"]),
            ("iPhone 12", "iPhone13,2", ["64GB", "128GB", "256GB"], "4GB", ["Black", "White", "Blue", "Green", "Purple"]),
            ("iPhone 11", "iPhone12,1", ["64GB", "128GB", "256GB"], "4GB", ["Black", "White", "Purple", "Yellow", "Red"])
        ]
        chosen = random.choice(models)
        name, code, storages, ram, colors = chosen
        storage = random.choice(storages)
        color = random.choice(colors)
        os_ver = f"iOS {random.choice(['16.7', '17.5.1', '17.6', '18.0', '18.1'])}"
        region = random.choice(["LL/A", "J/A", "CH/A", "ZP/A", "B/A", "AE/A"])
        cycles = random.randint(12, 750)
        health = max(75, min(100, 102 - int(cycles * 0.038) + random.randint(-1, 1)))
        serial = "".join(random.choices("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", k=10))
        imei1 = generate_luhn_imei("358901")
        imei2 = generate_luhn_imei("358901")

        return DeviceSpecs(
            connection_type="ios",
            device_id=f"00008140-{serial}001E",
            brand="Apple",
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region=region,
            bootloader_locked=True,
            condition_grade=random.choice(["New", "A+", "A", "B"]),
            remarks=f"Simulated {name} - Grade Verified",
            raw_properties={"is_mock": True, "generated": True}
        )

    elif selected_brand == "Samsung":
        models = [
            ("Galaxy S24 Ultra", "SM-S928B", "512GB", "12GB", ["Titanium Gray", "Titanium Black", "Titanium Violet"]),
            ("Galaxy S24+", "SM-S926B", "256GB", "12GB", ["Onyx Black", "Marble Gray", "Cobalt Violet"]),
            ("Galaxy S24", "SM-S921B", "128GB", "8GB", ["Onyx Black", "Marble Gray"]),
            ("Galaxy S23 Ultra", "SM-S918B", "256GB", "12GB", ["Phantom Black", "Cream", "Green", "Lavender"]),
            ("Galaxy Z Fold 5", "SM-F946B", "512GB", "12GB", ["Icy Blue", "Phantom Black", "Cream"]),
            ("Galaxy Z Flip 5", "SM-F731B", "256GB", "8GB", ["Mint", "Graphite", "Cream", "Lavender"]),
            ("Galaxy A55 5G", "SM-A556B", "128GB", "8GB", ["Awesome Navy", "Awesome Iceblue", "Awesome Lemon"]),
            ("Galaxy A54 5G", "SM-A546U", "128GB", "6GB", ["Awesome Graphite", "Awesome Lime", "Awesome White"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        color = random.choice(colors)
        os_ver = f"Android {random.choice(['13', '14'])}"
        cycles = random.randint(20, 600)
        health = max(80, min(100, 100 - int(cycles * 0.035) + random.randint(-1, 1)))
        serial = "R" + "".join(random.choices("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=10))
        imei1 = generate_luhn_imei("351782")
        imei2 = generate_luhn_imei("351782")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand="Samsung",
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="EUX",
            bootloader_locked=True,
            condition_grade=random.choice(["A+", "A", "B"]),
            remarks=f"Simulated {name} - Clean ESN",
            raw_properties={"is_mock": True, "generated": True}
        )

    elif selected_brand == "Xiaomi":
        models = [
            ("Xiaomi 14 Pro", "23116PN5BC", "512GB", "16GB", ["Black", "Silver", "Titanium"]),
            ("Xiaomi 13 Pro", "2210132G", "256GB", "12GB", ["Ceramic Black", "Ceramic White", "Wild Green"]),
            ("Redmi Note 13 Pro 5G", "2312DRA50G", "256GB", "8GB", ["Midnight Black", "Ocean Teal", "Aurora Purple"]),
            ("POCO F5", "23049PCD8G", "256GB", "8GB", ["Carbon Black", "Sand White", "Electric Blue"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        color = random.choice(colors)
        os_ver = f"Android {random.choice(['13', '14'])}"
        brand = "Redmi" if "Redmi" in name else ("POCO" if "POCO" in name else "Xiaomi")
        cycles = random.randint(15, 500)
        health = max(82, min(100, 100 - int(cycles * 0.033)))
        serial = "".join(random.choices("0123456789abcdef", k=12))
        imei1 = generate_luhn_imei("862341")
        imei2 = generate_luhn_imei("862341")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=color,
            os_version=os_ver,
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="Global",
            bootloader_locked=random.choice([True, False]),
            condition_grade=random.choice(["A+", "A", "B"]),
            remarks=f"Simulated {name}",
            raw_properties={"is_mock": True, "generated": True}
        )

    else:  # OnePlus
        models = [
            ("OnePlus 12", "CPH2581", "512GB", "16GB", ["Flowy Emerald", "Silky Black"]),
            ("OnePlus 11", "CPH2451", "256GB", "16GB", ["Titan Black", "Eternal Green"]),
            ("Realme GT Neo 5", "RMX3820", "256GB", "12GB", ["Purple", "Black", "White"])
        ]
        name, code, storage, ram, colors = random.choice(models)
        brand = "Realme" if "Realme" in name else "OnePlus"
        cycles = random.randint(10, 400)
        health = max(85, min(100, 100 - int(cycles * 0.03)))
        serial = "".join(random.choices("0123456789ABCDEF", k=10))
        imei1 = generate_luhn_imei("861294")
        imei2 = generate_luhn_imei("861294")

        return DeviceSpecs(
            connection_type="adb",
            device_id=serial,
            brand=brand,
            marketing_name=name,
            model_code=code,
            storage=storage,
            ram=ram,
            color=random.choice(colors),
            os_version="Android 14",
            serial_number=serial,
            imei1=imei1,
            imei2=imei2,
            battery_health=health,
            battery_cycles=cycles,
            sales_region="Global",
            bootloader_locked=True,
            condition_grade=random.choice(["New", "A+", "A"]),
            remarks=f"Simulated {name}",
            raw_properties={"is_mock": True, "generated": True}
        )


# ============================================================================
# 4. Mock Polling Provider (Interface Parity with AdbReader & IosReader)
# ============================================================================

class MockDeviceProvider:
    """
    Simulates hardware polling and event notification.
    Mirrors the exact interface and signals of live AdbReader and IosReader.
    """

    def __init__(self, initial_profile: Optional[str] = None):
        self._active_specs: Optional[DeviceSpecs] = None
        self._stop_event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._poll_interval = 2.0

        # Unified callback interface
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[str], None]] = None

        if initial_profile:
            self.connect_profile(initial_profile)

    def is_connected(self) -> bool:
        """Returns True if a mock device is actively attached."""
        with self._lock:
            return self._active_specs is not None

    def get_active_specs(self) -> Optional[DeviceSpecs]:
        """Returns a copy of the current active DeviceSpecs, or None."""
        with self._lock:
            return replace(self._active_specs) if self._active_specs else None

    def get_available_profiles(self) -> List[str]:
        """Returns list of pre-configured profile keys."""
        return list(PRECONFIGURED_PROFILES.keys())

    def connect_profile(self, profile_key: str) -> DeviceSpecs:
        """Attaches a pre-configured profile and fires callbacks."""
        if profile_key not in PRECONFIGURED_PROFILES:
            raise KeyError(f"Unknown mock profile: '{profile_key}'. Available: {self.get_available_profiles()}")
        specs = replace(PRECONFIGURED_PROFILES[profile_key])
        return self.connect_device(specs)

    def connect_random(self, brand_hint: Optional[str] = None) -> DeviceSpecs:
        """Procedurally generates and connects a random device."""
        specs = generate_random_profile(brand_hint=brand_hint)
        return self.connect_device(specs)

    def connect_device(self, specs: DeviceSpecs) -> DeviceSpecs:
        """Sets active device specs and notifies listeners."""
        with self._lock:
            self._active_specs = specs

        if self.on_status_changed:
            self.on_status_changed(specs.connection_type)
        if self.on_device_connected:
            self.on_device_connected(specs)

        return specs

    def disconnect(self) -> None:
        """Detaches active mock device and notifies listeners."""
        with self._lock:
            had_device = self._active_specs is not None
            self._active_specs = None

        if had_device:
            if self.on_status_changed:
                self.on_status_changed("none")
            if self.on_device_disconnected:
                self.on_device_disconnected()

    def poll_tick(self) -> Tuple[str, Optional[DeviceSpecs]]:
        """
        Executes a single polling tick.
        Returns (connection_type, active_specs).
        """
        with self._lock:
            if self._active_specs is None:
                return "none", None
            return self._active_specs.connection_type, replace(self._active_specs)

    def start_polling(self, interval: float = 2.0) -> None:
        """Starts a background simulation polling loop."""
        if self._poll_thread and self._poll_thread.is_alive():
            return
        self._poll_interval = interval
        self._stop_event.clear()
        self._poll_thread = threading.Thread(target=self._run_poll_loop, daemon=True, name="MockPoller")
        self._poll_thread.start()

    def stop_polling(self) -> None:
        """Stops the background simulation polling loop."""
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1.0)
        self._poll_thread = None

    def _run_poll_loop(self) -> None:
        """Daemon worker loop emitting periodic heartbeats or state changes."""
        last_id = None
        while not self._stop_event.is_set():
            with self._lock:
                current = self._active_specs

            curr_id = current.device_id if current else None
            if curr_id != last_id:
                last_id = curr_id
                if current and self.on_device_connected:
                    self.on_device_connected(replace(current))
                elif not current and self.on_device_disconnected:
                    self.on_device_disconnected()

            self._stop_event.wait(self._poll_interval)


# ============================================================================
# 5. Raw Command Output Simulator (For Subprocess & Parser Integration)
# ============================================================================

class MockCommandSimulator:
    """
    Generates realistic raw CLI stdout strings corresponding to mock profiles.
    Allows testing live parsers against realistic ADB and libimobiledevice outputs.
    """

    @staticmethod
    def get_adb_getprop(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell getprop'."""
        manufacturer = "samsung" if specs.brand == "Samsung" else ("xiaomi" if specs.brand in ("Xiaomi", "Redmi", "POCO") else "android")
        lines = [
            f"[ro.product.brand]: [{specs.brand.lower()}]",
            f"[ro.product.manufacturer]: [{manufacturer}]",
            f"[ro.product.model]: [{specs.model_code}]",
            f"[ro.product.marketname]: [{specs.marketing_name}]",
            f"[ro.build.version.release]: [{specs.os_version.replace('Android ', '')}]",
            f"[ro.serialno]: [{specs.serial_number}]",
            f"[ro.boot.flash.locked]: [{'1' if specs.bootloader_locked else '0'}]",
            f"[ro.boot.verifiedbootstate]: [{'green' if specs.bootloader_locked else 'orange'}]",
            f"[gsm.baseband.imei]: [{specs.imei1}]"
        ]
        return "\n".join(lines)

    @staticmethod
    def get_adb_df(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell df -k /data'."""
        storage_map = {
            "16GB": 14000000,
            "32GB": 28000000,
            "64GB": 57000000,
            "128GB": 114688000,
            "256GB": 229376000,
            "512GB": 458752000,
            "1TB": 917504000
        }
        total_kb = storage_map.get(specs.storage, 229376000)
        used_kb = int(total_kb * 0.35)
        avail_kb = total_kb - used_kb
        pct = 35
        return (
            "Filesystem      1K-blocks      Used Available Use% Mounted on\n"
            f"/dev/block/dm-7 {total_kb}  {used_kb}  {avail_kb}  {pct}% /data\n"
        )

    @staticmethod
    def get_adb_meminfo(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell cat /proc/meminfo'."""
        ram_map = {
            "2GB": 1985400,
            "3GB": 2985400,
            "4GB": 3876124,
            "6GB": 5812300,
            "8GB": 7854320,
            "12GB": 11854320,
            "16GB": 15642100,
            "24GB": 23450000
        }
        mem_kb = ram_map.get(specs.ram, 7854320)
        return (
            f"MemTotal:        {mem_kb} kB\n"
            f"MemFree:          245120 kB\n"
            f"MemAvailable:    {int(mem_kb * 0.5)} kB\n"
            f"Buffers:          123400 kB\n"
            f"Cached:          1894200 kB\n"
        )

    @staticmethod
    def get_adb_dumpsys_battery(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'adb shell dumpsys battery'."""
        level = specs.battery_health if specs.battery_health is not None else 85
        return (
            "Current Battery Service state:\n"
            "  AC powered: false\n"
            "  USB powered: true\n"
            "  Wireless powered: false\n"
            "  status: 2\n"
            "  health: 2\n"
            "  present: true\n"
            f"  level: {level}\n"
            "  scale: 100\n"
            "  voltage: 4120\n"
            "  temperature: 285\n"
            "  technology: Li-ion\n"
            "  charge counter: 3450000\n"
            f"  cycle_count: {specs.battery_cycles or 45}\n"
        )

    @staticmethod
    def get_adb_service_call_imei(specs: DeviceSpecs) -> str:
        """Generates realistic hex parcel output for 'service call iphonesubinfo 1'."""
        imei = specs.imei1
        chars = list(imei)
        p1 = "".join([f".{c}" for c in chars[:4]])
        p2 = "".join([f".{c}" for c in chars[4:12]])
        p3 = "".join([f".{c}" for c in chars[12:]])
        return (
            "Result: Parcel(\n"
            f"  0x00000000: 00000000 0000000f 00380033 00310035 '........{p1}'\n"
            f"  0x00000010: 00380036 00330030 00390035 00340032 '{p2}'\n"
            f"  0x00000020: 00370030 00000031                   '{p3}..        ')\n"
        )

    @staticmethod
    def get_fastboot_getvar_all(specs: DeviceSpecs) -> str:
        """Generates realistic output for 'fastboot getvar all'."""
        is_unlocked = "yes" if not specs.bootloader_locked else "no"
        return (
            f"(bootloader) product: {specs.raw_properties.get('product', specs.model_code)}\n"
            f"(bootloader) unlocked: {is_unlocked}\n"
            f"(bootloader) serialno: {specs.serial_number}\n"
            "(bootloader) secure: yes\n"
            "all: done\n"
            "Finished. Total time: 0.005s\n"
        )

    @staticmethod
    def get_ios_ideviceinfo_xml(specs: DeviceSpecs) -> str:
        """Generates realistic XML plist output for 'ideviceinfo -x'."""
        storage_map = {
            "64GB": 64000000000,
            "128GB": 128035676160,
            "256GB": 256071352320,
            "512GB": 512142704640,
            "1TB": 1024285409280
        }
        total_bytes = storage_map.get(specs.storage, 256071352320)
        imei2_tag = f"<key>InternationalMobileEquipmentIdentity2</key><string>{specs.imei2}</string>" if specs.imei2 else ""

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DeviceName</key>
    <string>{specs.marketing_name}</string>
    <key>ProductType</key>
    <string>{specs.model_code}</string>
    <key>ProductVersion</key>
    <string>{specs.os_version.replace('iOS ', '')}</string>
    <key>BuildVersion</key>
    <string>22B83</string>
    <key>SerialNumber</key>
    <string>{specs.serial_number}</string>
    <key>UniqueDeviceID</key>
    <string>{specs.device_id}</string>
    <key>InternationalMobileEquipmentIdentity</key>
    <string>{specs.imei1}</string>
    {imei2_tag}
    <key>TotalDiskCapacity</key>
    <integer>{total_bytes}</integer>
    <key>DeviceColor</key>
    <string>{specs.color}</string>
    <key>DeviceEnclosureColor</key>
    <string>{specs.color}</string>
    <key>ModelNumber</key>
    <string>MYWV3</string>
    <key>RegionInfo</key>
    <string>{specs.sales_region or 'LL/A'}</string>
</dict>
</plist>"""

    @staticmethod
    def get_ios_battery_xml(specs: DeviceSpecs) -> str:
        """Generates realistic XML plist for 'idevicediagnostics ioregentry AppleSmartBattery'."""
        health = specs.battery_health if specs.battery_health is not None else 100
        cycles = specs.battery_cycles if specs.battery_cycles is not None else 15
        design_cap = 3274
        nominal_cap = int((design_cap * health) / 100)

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CycleCount</key>
    <integer>{cycles}</integer>
    <key>DesignCapacity</key>
    <integer>{design_cap}</integer>
    <key>NominalChargeCapacity</key>
    <integer>{nominal_cap}</integer>
    <key>MaximumCapacityPercent</key>
    <integer>{health}</integer>
    <key>IsCharging</key>
    <false/>
    <key>CurrentCapacity</key>
    <integer>88</integer>
</dict>
</plist>"""
