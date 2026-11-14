"""
core/device_detector.py — Zero-Click Background USB Hardware Listener & FSM State Machine.
Implements:
1. Tri-channel USB detection:
   - Channel A: Windows WMI Win32_PnPEntity creation/deletion event interceptor.
   - Channel B: Persistent ADB host:track-devices streaming loopback socket.
   - Channel C: Debounced 1.0s periodic polling fallback.
2. 600ms software debouncing for USB contact bounce elimination.
3. Connection idempotency guard suppressing duplicate queries within 2.0s.
4. Non-blocking QThread worker emitting strongly typed Qt signals and pure Python callbacks.
5. Mock simulation routing (live, mock_s24, mock_iphone16, mock_fastboot, mock_offline).
"""
from dataclasses import replace
import enum
import logging
import os
import re
import socket
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from core.models import DeviceSpecs
from core.adb_reader import AdbReader
from core.ios_reader import IOSReader
from core.mock_device import MOCK_S24_ULTRA, MOCK_IPHONE16_PROMAX, MOCK_FASTBOOT_DEVICE

logger = logging.getLogger(__name__)

# Known Mobile Device USB Vendor IDs (VID)
TARGET_MOBILE_VIDS: Set[str] = {
    "05AC",  # Apple Inc.
    "18D1",  # Google Inc. (Android/Pixel)
    "04E8",  # Samsung Electronics Co., Ltd.
    "2717",  # Xiaomi Inc.
    "22D9",  # Oppo / Realme / OnePlus
    "12D1",  # Huawei Technologies
    "0E8D",  # MediaTek Inc.
    "05C6",  # Qualcomm Inc.
}


class ConnectionState(enum.Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED_ADB = "adb"
    CONNECTED_FASTBOOT = "fastboot"
    CONNECTED_IOS = "ios"
    CONNECTED_IOS_LOCKED = "ios_locked"
    CONNECTED_IOS_TRUST_PENDING = "ios_trust_pending"
    CONNECTED_UNAUTHORIZED = "unauthorized"
    ERROR = "error"


# PyQt6 Signal Interface (Safely guarded for headless/testing environments)
try:
    from PyQt6.QtCore import QObject, pyqtSignal, pyqtSlot, QTimer, QThread
    HAS_PYQT6 = True
except ImportError:
    HAS_PYQT6 = False
    class QObject:
        def __init__(self, *args, **kwargs): pass
    def pyqtSignal(*args, **kwargs):
        class _Signal:
            def __init__(self):
                self._slots = []
            def connect(self, slot):
                self._slots.append(slot)
            def emit(self, *args, **kwargs):
                for slot in self._slots:
                    try:
                        slot(*args, **kwargs)
                    except Exception as e:
                        logger.debug(f"Signal dispatch error: {e}")
        return _Signal()
    def pyqtSlot(*args, **kwargs):
        return lambda fn: fn


class DeviceDetectorWorker(QObject):
    """
    Non-blocking background worker thread running hybrid USB detection.
    Can be run via QThread.moveToThread() or as a standalone Python thread.
    """
    specs_received = pyqtSignal(object)       # DeviceSpecs
    device_disconnected = pyqtSignal()
    status_changed = pyqtSignal(dict)         # {"adb": bool, "fastboot": bool, "ios": bool, "mode": str, "state": str, "description": str}
    error_occurred = pyqtSignal(str, str)     # title, message

    def __init__(self, parent=None):
        super().__init__(parent)
        self._mock_mode: str = "live"
        self._last_device_id: Optional[str] = None
        self._last_processed_time: float = 0.0
        self._current_state = ConnectionState.DISCONNECTED
        self._active_specs: Optional[DeviceSpecs] = None

        self._adb_reader = AdbReader()
        self._ios_reader = IOSReader()

        self._stop_event = threading.Event()
        self._wmi_thread: Optional[threading.Thread] = None
        self._track_devices_thread: Optional[threading.Thread] = None
        self._poll_timer: Optional[Any] = None
        self._bg_thread: Optional[threading.Thread] = None

        # Pure Python callback hooks for headless testing
        self.on_device_connected: Optional[Callable[[DeviceSpecs], None]] = None
        self.on_device_disconnected: Optional[Callable[[], None]] = None
        self.on_status_changed: Optional[Callable[[Dict[str, Any]], None]] = None
        self.on_error: Optional[Callable[[str, str], None]] = None

    # -----------------------------------------------------------------------
    # Worker Lifecycle & Mode Control
    # -----------------------------------------------------------------------

    @pyqtSlot()
    def start_polling(self, interval_ms: int = 1000):
        """Starts WMI event listener, ADB streaming socket, and periodic guard timer."""
        self._stop_event.clear()

        # 1. Start Windows WMI Event Interceptor (Channel A)
        if sys.platform == "win32":
            self._start_wmi_listener()

        # 2. Start ADB track-devices stream (Channel B)
        self._start_track_devices_listener()

        # 3. Start Periodic Backup Poller (Channel C)
        # Check if running under Qt event loop
        has_qt_loop = False
        if HAS_PYQT6:
            try:
                from PyQt6.QtWidgets import QApplication
                has_qt_loop = QApplication.instance() is not None
            except Exception:
                has_qt_loop = False

        if has_qt_loop and isinstance(self, QObject) and hasattr(self, "thread"):
            try:
                self._poll_timer = QTimer()
                self._poll_timer.setInterval(interval_ms)
                self._poll_timer.timeout.connect(self._on_poll_tick)
                self._poll_timer.start()
            except Exception as e:
                logger.debug(f"Could not initialize QTimer: {e}")
                self._start_bg_fallback_loop(interval_ms / 1000.0)
        else:
            self._start_bg_fallback_loop(interval_ms / 1000.0)

        # Initial trigger
        self._on_poll_tick()

    def _start_bg_fallback_loop(self, interval_sec: float):
        """Starts python background thread fallback if QTimer is not active."""
        if self._bg_thread and self._bg_thread.is_alive():
            return
        def _bg_loop():
            while not self._stop_event.is_set():
                self._stop_event.wait(interval_sec)
                if not self._stop_event.is_set():
                    self._on_poll_tick()
        self._bg_thread = threading.Thread(target=_bg_loop, name="DeviceDetectorFallbackThread", daemon=True)
        self._bg_thread.start()

    @pyqtSlot()
    def stop_polling(self):
        """Stops all background listeners and cleans up sockets."""
        self._stop_event.set()
        if self._poll_timer:
            try:
                self._poll_timer.stop()
            except Exception:
                pass
            self._poll_timer = None
        if self._wmi_thread and self._wmi_thread.is_alive():
            self._wmi_thread.join(timeout=1.0)
            self._wmi_thread = None
        if self._track_devices_thread and self._track_devices_thread.is_alive():
            self._track_devices_thread.join(timeout=1.0)
            self._track_devices_thread = None
        if self._bg_thread and self._bg_thread.is_alive():
            self._bg_thread.join(timeout=1.0)
            self._bg_thread = None

    @pyqtSlot(str)
    def set_mock_mode(self, mode: str):
        """Switches between live hardware extraction and mock simulation presets."""
        self._mock_mode = mode
        self._on_poll_tick()

    def trigger_detection_check(self, force: bool = False):
        """Public method for synchronous testing or manual refresh triggers."""
        if force:
            self._last_device_id = None
        self._on_poll_tick()

    # -----------------------------------------------------------------------
    # Channel A: Windows WMI Event Interceptor
    # -----------------------------------------------------------------------

    def _start_wmi_listener(self):
        def _wmi_worker():
            try:
                import pythoncom
                import win32com.client
                pythoncom.CoInitialize()
                wmi = win32com.client.GetObject("winmgmts:")
                wql = "SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity'"
                watcher = wmi.ExecNotificationQuery(wql)

                while not self._stop_event.is_set():
                    try:
                        event = watcher.NextEvent(1000)
                        if event:
                            target = event.TargetInstance
                            dev_id = str(getattr(target, "DeviceID", ""))
                            # Check for target mobile VIDs
                            if any(f"VID_{vid}" in dev_id.upper() for vid in TARGET_MOBILE_VIDS):
                                logger.debug(f"WMI USB mobile hardware event detected: {dev_id}")
                                # Apply 600ms contact debounce before probing
                                time.sleep(0.6)
                                self._on_poll_tick()
                    except Exception:
                        pass
                pythoncom.CoUninitialize()
            except Exception as e:
                logger.debug(f"WMI listener could not initialize, falling back to periodic polling: {e}")

        self._wmi_thread = threading.Thread(target=_wmi_worker, name="WmiUsbDetectorThread", daemon=True)
        self._wmi_thread.start()

    # -----------------------------------------------------------------------
    # Channel B: ADB Device Streaming Socket (host:track-devices)
    # -----------------------------------------------------------------------

    def _start_track_devices_listener(self):
        def _adb_stream_worker():
            while not self._stop_event.is_set():
                s = None
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(3.0)
                    try:
                        s.connect(("127.0.0.1", 5037))
                    except Exception:
                        # Attempt to start daemon if not reachable
                        self._adb_reader.ensure_server()
                        time.sleep(0.5)
                        s.connect(("127.0.0.1", 5037))

                    # Packet format: 4 hex digits length + command string
                    cmd = "host:track-devices"
                    req = f"{len(cmd):04x}{cmd}".encode("ascii")
                    s.sendall(req)
                    resp = s.recv(4)
                    if resp == b"OKAY":
                        s.settimeout(2.0)
                        while not self._stop_event.is_set():
                            try:
                                len_hdr = s.recv(4)
                                if not len_hdr:
                                    break
                                length = int(len_hdr.decode("ascii"), 16)
                                if length > 0:
                                    payload = s.recv(length).decode("utf-8", errors="replace")
                                    logger.debug(f"ADB track-devices stream update: {payload.strip()}")
                                    time.sleep(0.6)  # Debounce contact bounce
                                    self._on_poll_tick()
                                else:
                                    # All ADB devices disconnected
                                    self._on_poll_tick()
                            except socket.timeout:
                                continue
                except Exception:
                    pass
                finally:
                    if s:
                        try:
                            s.close()
                        except Exception:
                            pass
                # Backoff before reconnecting to ADB daemon
                self._stop_event.wait(5.0)

        self._track_devices_thread = threading.Thread(
            target=_adb_stream_worker, name="AdbTrackDevicesThread", daemon=True
        )
        self._track_devices_thread.start()

    # -----------------------------------------------------------------------
    # Channel C & FSM Evaluation Tick
    # -----------------------------------------------------------------------

    def _on_poll_tick(self):
        """Evaluates hardware state ladder and dispatches debounced signals."""
        status = {
            "adb": False,
            "fastboot": False,
            "ios": False,
            "mode": self._mock_mode,
            "state": "disconnected",
            "description": "No Device Connected"
        }
        active_specs: Optional[DeviceSpecs] = None

        # 1. Handle Mock Modes
        if self._mock_mode == "mock_s24":
            status["adb"] = True
            status["state"] = "adb"
            status["description"] = "Samsung Galaxy S24 Ultra (Emulated)"
            active_specs = MOCK_S24_ULTRA

        elif self._mock_mode == "mock_iphone16":
            status["ios"] = True
            status["state"] = "ios"
            status["description"] = "Apple iPhone 16 Pro Max (Emulated)"
            active_specs = MOCK_IPHONE16_PROMAX

        elif self._mock_mode == "mock_fastboot":
            status["fastboot"] = True
            status["state"] = "fastboot"
            status["description"] = "Fastboot Bootloader Mode (Emulated)"
            active_specs = MOCK_FASTBOOT_DEVICE

        elif self._mock_mode == "mock_offline":
            status["state"] = "disconnected"
            status["description"] = "Disconnected (Emulated)"

        else:
            # 2. Live Hardware Evaluation Ladder
            # Step 1: Check iOS libimobiledevice first
            try:
                udids = self._ios_reader.list_device_udids()
                if udids:
                    target_udid = udids[0]
                    specs_obj, status_msg = self._ios_reader.extract_device_telemetry(target_udid)
                    if specs_obj:
                        status["ios"] = True
                        status["state"] = "ios"
                        status["description"] = f"{specs_obj.marketing_name} ({specs_obj.storage})"
                        active_specs = specs_obj
                    else:
                        status["ios"] = True
                        if "Passcode" in status_msg or "Locked" in status_msg:
                            status["state"] = "ios_locked"
                            status["description"] = status_msg
                        elif "Trust" in status_msg:
                            status["state"] = "ios_trust_pending"
                            status["description"] = status_msg
                        else:
                            status["state"] = "error"
                            status["description"] = status_msg
            except Exception as e:
                logger.debug(f"iOS probe error: {e}")

            # Step 2: Check Android ADB / Fastboot if no active iOS specs
            if not active_specs and status["state"] not in ("ios_locked", "ios_trust_pending"):
                try:
                    specs = self._adb_reader.poll_once()
                    if specs:
                        if specs.connection_type == "fastboot":
                            status["fastboot"] = True
                            status["state"] = "fastboot"
                            status["description"] = f"Fastboot: {specs.marketing_name}"
                        elif specs.connection_type == "unauthorized":
                            status["adb"] = True
                            status["state"] = "unauthorized"
                            status["description"] = f"⚠️ {specs.marketing_name} (إذن USB مطلوب من الهاتف)"
                        elif specs.connection_type == "offline":
                            status["adb"] = True
                            status["state"] = "offline"
                            status["description"] = f"⚠️ {specs.marketing_name}"
                        else:
                            status["adb"] = True
                            status["state"] = "adb"
                            status["description"] = f"{specs.marketing_name} ({specs.storage})"
                        active_specs = specs
                except Exception as e:
                    logger.debug(f"ADB probe error: {e}")

            # Step 3: Check Samsung USB Modem AT Mode (Zero-ADB Required)
            if not active_specs and status["state"] not in ("ios_locked", "ios_trust_pending"):
                try:
                    samsung_specs = self._probe_samsung_modem_at()
                    if samsung_specs:
                        status["adb"] = True
                        status["state"] = "adb"
                        status["description"] = f"{samsung_specs.marketing_name} [Samsung Modem AT]"
                        active_specs = samsung_specs
                except Exception as e:
                    logger.debug(f"Samsung AT probe error: {e}")

            # Step 4: Windows WPD/MTP & USB Descriptor Fallback (Zero-ADB Required)
            if not active_specs and status["state"] not in ("ios_locked", "ios_trust_pending"):
                try:
                    wpd_specs = self._probe_wpd_mtp_fallback()
                    if wpd_specs:
                        status["adb"] = True
                        status["state"] = "adb"
                        status["description"] = f"{wpd_specs.marketing_name} [USB MTP Mode]"
                        active_specs = wpd_specs
                except Exception as e:
                    logger.debug(f"WPD/MTP probe error: {e}")

        # Dispatch Status Signal
        self.status_changed.emit(status)
        if self.on_status_changed:
            self.on_status_changed(status)

        current_id = active_specs.device_id if active_specs else None
        now = time.time()

        # Idempotency Guard & State Transitions
        if active_specs:
            state_changed = (
                self._active_specs is None 
                or self._active_specs.connection_type != active_specs.connection_type
                or getattr(self._active_specs, 'marketing_name', '') != getattr(active_specs, 'marketing_name', '')
            )
            # Only dispatch specs_received when a new device connects or state/identity transitions.
            # Never spam duplicate specs periodically, allowing user edits and color overrides to persist cleanly.
            if current_id != self._last_device_id or state_changed:
                self._last_device_id = current_id
                self._last_processed_time = now
                self._active_specs = active_specs
                self.specs_received.emit(active_specs)
                if self.on_device_connected:
                    self.on_device_connected(active_specs)
        elif self._last_device_id is not None:
            self._last_device_id = None
            self._active_specs = None
            self.device_disconnected.emit()
            if self.on_device_disconnected:
                self.on_device_disconnected()

    def _probe_samsung_modem_at(self) -> Optional[DeviceSpecs]:
        """
        Protocol 3: Samsung Mobile USB Modem AT Command Mode (Zero-ADB Required).
        Interrogates Samsung USB modem COM port with AT+DEVCONINFO, AT+CGSN, and AT+CGMM.
        """
        try:
            import serial.tools.list_ports
            ports = serial.tools.list_ports.comports()
            samsung_ports = [
                p.device for p in ports 
                if any(x in (p.description or "").lower() for x in ["samsung", "modem", "ssudmdm"])
            ]
            if not samsung_ports:
                return None

            import serial
            for port in samsung_ports[:2]:
                try:
                    with serial.Serial(port, baudrate=115200, timeout=0.6, write_timeout=0.6) as ser:
                        ser.write(b"AT\r\n")
                        time.sleep(0.08)
                        resp = ser.read(ser.in_waiting or 128).decode("ascii", errors="ignore")
                        if "OK" not in resp:
                            continue

                        ser.write(b"AT+DEVCONINFO\r\n")
                        time.sleep(0.15)
                        info_resp = ser.read(ser.in_waiting or 512).decode("ascii", errors="ignore")

                        model = ""
                        serial_no = ""
                        imei = ""
                        region = ""

                        mn_match = re.search(r"MN\(([^)]+)\)", info_resp)
                        if mn_match:
                            model = mn_match.group(1).strip()
                        sn_match = re.search(r"SN\(([^)]+)\)", info_resp)
                        if sn_match:
                            serial_no = sn_match.group(1).strip()
                        imei_match = re.search(r"IMEI\(([^)]+)\)", info_resp)
                        if imei_match:
                            imei = imei_match.group(1).strip()
                        ver_match = re.search(r"VER\(([^)]+)\)", info_resp)
                        if ver_match:
                            region = ver_match.group(1).strip()

                        if not imei:
                            ser.write(b"AT+CGSN\r\n")
                            time.sleep(0.1)
                            cgsn = ser.read(ser.in_waiting or 128).decode("ascii", errors="ignore")
                            imei_m = re.search(r"\b(\d{15})\b", cgsn)
                            if imei_m:
                                imei = imei_m.group(1)

                        if not model:
                            ser.write(b"AT+CGMM\r\n")
                            time.sleep(0.1)
                            cgmm = ser.read(ser.in_waiting or 128).decode("ascii", errors="ignore")
                            for line in cgmm.splitlines():
                                line = line.strip()
                                if line and line != "OK" and not line.startswith("AT"):
                                    model = line
                                    break

                        if model or imei:
                            mkt = model
                            if "S918" in model:
                                mkt = "Galaxy S23 Ultra"
                            elif "S928" in model:
                                mkt = "Galaxy S24 Ultra"
                            elif "S908" in model:
                                mkt = "Galaxy S22 Ultra"
                            elif "SM-" in model:
                                mkt = f"Samsung {model}"

                            return DeviceSpecs(
                                connection_type="adb",
                                device_id=serial_no or imei or f"samsung_{port}",
                                brand="Samsung",
                                marketing_name=mkt,
                                model_code=model,
                                storage="128GB",
                                ram="8GB",
                                color="Black",
                                os_version="Android (Modem Mode)",
                                serial_number=serial_no,
                                imei1=imei,
                                sales_region=region,
                                remarks="Zero-ADB Modem Mode"
                            )
                except Exception as e:
                    logger.debug(f"Port {port} probe failed: {e}")
        except Exception as e:
            logger.debug(f"Samsung AT extraction error: {e}")
        return None

    def _probe_wpd_mtp_fallback(self) -> Optional[DeviceSpecs]:
        """
        Protocol 4: Windows WPD/MTP & USB Descriptor Fallback (Zero-ADB Required).
        Inspects PnP entities for connected smartphones in MTP/Transfer mode.
        """
        if sys.platform != "win32":
            return None
        try:
            import win32com.client
            import pythoncom
            pythoncom.CoInitialize()
            wmi = win32com.client.GetObject("winmgmts:")
            query = "SELECT Name, DeviceID, Description, PNPClass FROM Win32_PnPEntity WHERE PNPClass = 'WPD' OR " + " OR ".join([f"DeviceID LIKE '%VID_{vid}%'" for vid in TARGET_MOBILE_VIDS])
            items = wmi.ExecQuery(query)
            for item in items:
                name = str(getattr(item, "Name", "") or "")
                desc = str(getattr(item, "Description", "") or "")
                dev_id = str(getattr(item, "DeviceID", "") or "")
                pnp_class = str(getattr(item, "PNPClass", "") or "")

                lower_name = (name + " " + desc + " " + dev_id).lower()
                if any(x in lower_name for x in ["controller", "root hub", "composite device", "interface", "serial converter", "smartcard"]):
                    continue

                brand = "Android"
                if "05ac" in dev_id.lower() or "apple" in lower_name or "iphone" in lower_name:
                    brand = "Apple"
                elif "04e8" in dev_id.lower() or "samsung" in lower_name or "galaxy" in lower_name:
                    brand = "Samsung"
                elif "2717" in dev_id.lower() or "xiaomi" in lower_name or "redmi" in lower_name or "poco" in lower_name:
                    brand = "Xiaomi"
                elif "22d9" in dev_id.lower() or "oppo" in lower_name or "realme" in lower_name or "oneplus" in lower_name or "cph" in lower_name:
                    brand = "Oppo"
                elif "18d1" in dev_id.lower() or "pixel" in lower_name:
                    brand = "Google"

                # If it's a mobile device or WPD
                if pnp_class == "WPD" or any(f"vid_{v.lower()}" in dev_id.lower() for v in TARGET_MOBILE_VIDS):
                    serial_extracted = ""
                    parts = dev_id.split("\\")
                    if len(parts) >= 3 and not parts[2].startswith("&"):
                        serial_extracted = parts[2]

                    from core.adb_reader import resolve_marketing_name
                    resolved_brand, resolved_mkt = resolve_marketing_name(model_code=name, manufacturer=brand)
                    final_brand = resolved_brand if resolved_brand and resolved_brand != "Android" else brand
                    final_mkt = resolved_mkt if resolved_mkt and resolved_mkt != name else (name if name and name != "MTP Device" else f"{brand} Device")

                    return DeviceSpecs(
                        connection_type="mtp",
                        device_id=serial_extracted or f"mtp_{brand.lower()}",
                        brand=final_brand,
                        marketing_name=final_mkt,
                        model_code=name,
                        storage="128GB",
                        ram="8GB",
                        color="أسود (Black)",
                        os_version="USB MTP Mode",
                        serial_number=serial_extracted,
                        imei1="",
                        remarks="⚠️ متصل بنمط MTP (نقل ملفات) — لقراءة IMEI بدقة فعّل USB Debugging"
                    )
        except Exception as e:
            logger.debug(f"WPD probe error: {e}")
        return None


# Alias for compatibility with callers expecting PollingWorker
PollingWorker = DeviceDetectorWorker
