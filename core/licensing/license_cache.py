"""
core/licensing/license_cache.py — Secure Local License & Clock Rollback Cache
Protects against offline tampering, manual clock rollbacks, and file cloning.
Uses machine-specific HMAC validation to bind cache to the local workstation.
"""
import hmac
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

from core.paths import get_app_data_dir
from core.licensing.machine_id import get_installation_id

logger = logging.getLogger("thermal_lab.licensing.cache")

APP_CACHE_SALT = "ThermalLabPro-AntiRollback-HMAC-2026-v1"
CLOCK_LEEWAY_SECONDS = 300  # 5 minutes allowed for minor NTP sync changes


class LicenseCacheManager:
    """Manages secure persistence and tamper-checking of license tokens."""

    def __init__(self, cache_file: Optional[Path] = None):
        if cache_file is None:
            self.cache_file = get_app_data_dir() / "license_cache.dat"
            if not self.cache_file.exists():
                alt = Path(__file__).resolve().parent.parent.parent / "data" / "license_cache.dat"
                if alt.exists():
                    try:
                        import shutil
                        shutil.copy2(alt, self.cache_file)
                    except Exception:
                        pass
        else:
            self.cache_file = cache_file

    def _derive_machine_key(self, device_id: str) -> bytes:
        """Derives a machine-specific secret key for HMAC validation."""
        raw = f"{device_id}:{APP_CACHE_SALT}".encode("utf-8")
        return hashlib.sha256(raw).digest()

    def _compute_hmac(self, token: str, device_id: str, wall_clock_str: str) -> str:
        """Computes HMAC-SHA256 over critical state variables."""
        key = self._derive_machine_key(device_id)
        msg = f"{token}:{device_id}:{wall_clock_str}".encode("utf-8")
        return hmac.new(key, msg, hashlib.sha256).hexdigest()

    def save_cache(
        self,
        token: str,
        device_id: Optional[str] = None,
        last_validated_utc: Optional[str] = None
    ) -> bool:
        """Saves active license and advances monotonic wall-clock tracker."""
        dev_id = device_id or get_installation_id()
        now_utc = datetime.now(timezone.utc)
        now_str = now_utc.isoformat()

        # If previous cache exists with a future timestamp, don't regress
        prev_data, _ = self.load_raw_cache()
        if prev_data and "last_seen_wall_clock" in prev_data:
            try:
                prev_time = datetime.fromisoformat(prev_data["last_seen_wall_clock"])
                if prev_time > now_utc:
                    now_str = prev_time.isoformat()
            except Exception:
                pass

        val_utc = last_validated_utc or now_str
        tag = self._compute_hmac(token, dev_id, now_str)

        payload = {
            "token": token.strip(),
            "device_id": dev_id,
            "last_validated_utc": val_utc,
            "last_seen_wall_clock": now_str,
            "integrity_hmac": tag
        }

        try:
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            self.cache_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            logger.info("Saved encrypted license cache successfully.")
            return True
        except Exception as e:
            logger.error("Failed saving license cache: %s", e)
            return False

    def load_raw_cache(self) -> Tuple[Optional[Dict[str, Any]], bool]:
        """
        Loads and verifies cache integrity and checks for clock rollback.
        Returns (data_dict, clock_rollback_detected).
        """
        if not self.cache_file.exists():
            return None, False

        try:
            raw_text = self.cache_file.read_text(encoding="utf-8")
            data = json.loads(raw_text)
            token = data.get("token")
            dev_id = data.get("device_id")
            wall_str = data.get("last_seen_wall_clock")
            hmac_val = data.get("integrity_hmac")

            if not token or not dev_id or not wall_str or not hmac_val:
                logger.warning("Corrupted license cache format.")
                return None, False

            # Verify HMAC integrity
            expected_hmac = self._compute_hmac(token, dev_id, wall_str)
            if not hmac.compare_digest(hmac_val, expected_hmac):
                logger.warning("License cache HMAC integrity mismatch (file tampered or copied from another PC).")
                return None, False

            # Check Clock Rollback
            now_utc = datetime.now(timezone.utc)
            stored_time = datetime.fromisoformat(wall_str)
            if stored_time.tzinfo is None:
                stored_time = stored_time.replace(tzinfo=timezone.utc)

            # If current time is earlier than stored time minus leeway, rollback occurred
            if now_utc < stored_time - timedelta(seconds=CLOCK_LEEWAY_SECONDS):
                logger.error(
                    "CLOCK ROLLBACK DETECTED! Current UTC: %s, Stored UTC: %s (difference: %s)",
                    now_utc.isoformat(),
                    stored_time.isoformat(),
                    stored_time - now_utc
                )
                return data, True

            # Monotonically advance wall clock
            if now_utc > stored_time:
                self.touch_wall_clock(data)

            return data, False
        except Exception as e:
            logger.error("Error reading license cache: %s", e)
            return None, False

    def touch_wall_clock(self, existing_data: Dict[str, Any]) -> bool:
        """Advances the stored wall clock to the current time."""
        now_utc = datetime.now(timezone.utc)
        now_str = now_utc.isoformat()
        token = existing_data["token"]
        dev_id = existing_data["device_id"]
        tag = self._compute_hmac(token, dev_id, now_str)

        existing_data["last_seen_wall_clock"] = now_str
        existing_data["integrity_hmac"] = tag

        try:
            self.cache_file.write_text(json.dumps(existing_data, indent=2), encoding="utf-8")
            return True
        except Exception as e:
            logger.debug("Failed updating touch wall clock: %s", e)
            return False

    def get_token(self) -> Tuple[Optional[str], bool]:
        """Convenience method returning (token, clock_rollback_detected)."""
        data, rollback = self.load_raw_cache()
        if not data:
            return None, rollback
        return data.get("token"), rollback

    def clear(self) -> bool:
        """Deletes local license cache."""
        try:
            if self.cache_file.exists():
                self.cache_file.unlink()
            return True
        except Exception as e:
            logger.error("Failed clearing license cache: %s", e)
            return False
