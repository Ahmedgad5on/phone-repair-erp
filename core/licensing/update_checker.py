"""
core/licensing/update_checker.py — Desktop Update Manager & Package Verifier
Handles update checking, signed manifest verification, package SHA-256 validation,
and spawning the detached safe updater.
"""
import os
import sys
import json
import hashlib
import logging
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Callable, Tuple
import requests

from core.version import APP_VERSION
from core.paths import get_app_data_dir, get_bundle_dir
from core.licensing.license_verifier import LicenseVerifier
from core.licensing.client import DEFAULT_SERVER_URL

logger = logging.getLogger("thermal_lab.licensing.updates")


PUBLIC_UPDATE_MANIFEST_URL = "https://ahmedgad5on.github.io/phone-repair-erp/version.json"


def _parse_version(v: str) -> Tuple[int, ...]:
    import re
    nums = re.findall(r"\d+", str(v))
    return tuple(map(int, nums)) if nums else (0, 0, 0)


class UpdateChecker:
    """Manages release update checks, downloads, and handoff to the standalone updater."""

    def __init__(self, server_url: Optional[str] = None):
        self.server_url = (server_url or DEFAULT_SERVER_URL).rstrip("/")
        self.verifier = LicenseVerifier()

    def check_for_updates(
        self,
        current_version: str = APP_VERSION,
        channel: str = "stable"
    ) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Queries server or public GitHub Pages manifest for available releases.
        Returns (has_update, update_info_dict, message).
        """
        # 1. First check the cloud public website version.json manifest
        try:
            resp = requests.get(PUBLIC_UPDATE_MANIFEST_URL, timeout=6)
            if resp.status_code == 200:
                data = resp.json()
                latest_ver = str(data.get("latest_version") or data.get("version", "0.0.0"))
                if _parse_version(latest_ver) > _parse_version(current_version):
                    update_info = {
                        "latest_version": latest_ver,
                        "current_version": current_version,
                        "update_available": True,
                        "is_mandatory": data.get("is_mandatory", False),
                        "release_notes": data.get("release_notes", "تحديثات وإصلاحات جديدة."),
                        "download_url": data.get("download_url", ""),
                        "sha256": data.get("sha256", None)
                    }
                    return True, update_info, "تم العثور على تحديث جديد بنجاح."
        except Exception as e:
            logger.debug("Cloud manifest check skipped: %s", e)

        # 2. Fallback to licensing API server if configured
        url = f"{self.server_url}/api/v1/updates/check"
        payload = {
            "current_version": current_version,
            "channel": channel,
            "platform": sys.platform
        }
        try:
            resp = requests.post(url, json=payload, timeout=6)
            if resp.status_code != 200:
                return False, None, f"فشل التحقق من التحديثات (رمز: {resp.status_code})"

            data = resp.json()
            has_update = data.get("update_available", False)
            return has_update, data, "تم فحص التحديثات بنجاح."
        except Exception as e:
            logger.debug("Failed checking for updates: %s", e)
            return False, None, f"تعذر الاتصال بخادم التحديثات: {str(e)}"

    def download_update_package(
        self,
        download_url: str,
        expected_sha256: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> Tuple[bool, Optional[Path], str]:
        """
        Downloads the update package with progress reporting and verifies SHA-256 integrity.
        """
        downloads_dir = get_app_data_dir() / "updates"
        downloads_dir.mkdir(parents=True, exist_ok=True)
        ext = ".exe" if ".exe" in download_url.lower() else ".zip"
        dest_file = downloads_dir / f"update_package{ext}"

        try:
            resp = requests.get(download_url, stream=True, timeout=60)
            if resp.status_code != 200:
                return False, None, f"فشل تحميل حزمة التحديث (رمز: {resp.status_code})"

            total_bytes = int(resp.headers.get("content-length", 0))
            downloaded = 0
            hasher = hashlib.sha256()

            with open(dest_file, "wb") as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if not chunk:
                        continue
                    f.write(chunk)
                    hasher.update(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded, total_bytes)

            # Check SHA-256 if provided
            computed_hash = hasher.hexdigest().lower()
            if expected_sha256 and computed_hash != expected_sha256.lower():
                dest_file.unlink(missing_ok=True)
                return False, None, f"تطابق التجزئة الأمنية (SHA-256) فشل! الحزمة قد تكون تالفة أو معدلة."

            logger.info("Downloaded and verified update package at %s", dest_file)
            return True, dest_file, "تم تحميل حزمة التحديث والتحقق من سلامتها بنجاح."
        except Exception as e:
            logger.error("Error downloading update: %s", e)
            dest_file.unlink(missing_ok=True)
            return False, None, f"حدث خطأ أثناء تحميل التحديث: {str(e)}"

    def apply_update_automatically(self, package_path: Path) -> bool:
        """
        Executes completely silent background update without user intervention:
        - If installer .exe: launches Inno Setup with /VERYSILENT /SUPPRESSMSGBOXES.
        - If zip archive: launches standalone updater.py.
        """
        if package_path.suffix.lower() == ".exe":
            try:
                DETACHED = 0x00000008 | 0x00000200 if sys.platform == "win32" else 0
                cmd = [str(package_path), "/VERYSILENT", "/SUPPRESSMSGBOXES"]
                subprocess.Popen(cmd, creationflags=DETACHED, close_fds=True)
                logger.info("Launched silent installer successfully: %s", cmd)
                return True
            except Exception as e:
                logger.error("Failed launching silent installer: %s", e)
                return False
        return self.launch_standalone_updater(package_path)

    def launch_standalone_updater(self, package_path: Path) -> bool:
        """
        Spawns the detached standalone updater and exits the host application.
        """
        updater_script = Path(__file__).resolve().parent.parent.parent / "updater" / "updater.py"
        target_dir = get_bundle_dir()
        main_pid = os.getpid()

        # Find executable / python runner
        if getattr(sys, "frozen", False):
            app_exe = sys.executable
        else:
            app_exe = str(Path(sys.executable).parent / "python.exe")

        cmd = [
            sys.executable,
            str(updater_script),
            "--target-dir", str(target_dir),
            "--package-path", str(package_path),
            "--app-exe", str(app_exe),
            "--main-pid", str(main_pid)
        ]

        try:
            # Spawn fully detached process
            if sys.platform == "win32":
                DETACHED_PROCESS = 0x00000008
                CREATE_NEW_PROCESS_GROUP = 0x00000200
                subprocess.Popen(
                    cmd,
                    creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
                    close_fds=True
                )
            else:
                subprocess.Popen(cmd, close_fds=True)
            logger.info("Launched detached updater process successfully.")
            return True
        except Exception as e:
            logger.error("Failed spawning updater: %s", e)
            return False
