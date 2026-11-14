"""
server/routers/updates.py — Production Software Updates & Signed Manifest Gateway
Serves release manifests signed with Ed25519 and verified with SHA-256 package hashes.
"""
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse

from server.config import config
from server.database import CentralDatabaseManager
from server.schemas import CheckUpdateRequest, CheckUpdateResponse
from server.security import Ed25519LicensingEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/updates", tags=["Automatic Software Updates"])


def _version_tuple(v: str):
    """Converts a semantic version string (e.g. '4.6.0') into an integer tuple."""
    try:
        parts = [int(p) for p in v.strip().lstrip("v").split(".") if p.isdigit()]
        return tuple(parts)
    except Exception:
        return (0, 0, 0)


@router.post("/check", response_model=CheckUpdateResponse)
def check_for_updates(payload: CheckUpdateRequest, req: Request):
    """
    Checks if a newer eligible release is available for the given channel.
    Returns signed manifest and SHA-256 package hash.
    """
    db = CentralDatabaseManager.get_instance()
    conn = db.get_connection()
    cur = conn.cursor()

    channel = payload.channel.lower().strip()
    if channel not in ("stable", "beta", "internal"):
        channel = "stable"

    cur.execute("""
        SELECT version, channel, min_supported_version, is_mandatory,
               package_filename, package_size_bytes, package_sha256,
               manifest_signature, release_notes
        FROM server_software_releases
        WHERE channel = ? AND is_active = 1
        ORDER BY id DESC LIMIT 1;
    """, (channel,))
    latest = cur.fetchone()

    current_tup = _version_tuple(payload.current_version)

    if not latest:
        # Fallback to system setting if no release binary uploaded yet
        cur.execute("SELECT value FROM server_system_settings WHERE key = 'latest_stable_version';")
        set_row = cur.fetchone()
        setting_ver = set_row["value"] if set_row else "4.6.0"
        latest_tup = _version_tuple(setting_ver)

        has_update = latest_tup > current_tup
        return CheckUpdateResponse(
            update_available=has_update,
            latest_version=setting_ver,
            channel=channel,
            min_supported_version="4.0.0",
            is_mandatory=False,
            release_notes="إصدار مستقر رسمي يتضمن تحسينات الاستقرار وسرعة الأداء."
        )

    latest_ver = latest["version"]
    latest_tup = _version_tuple(latest_ver)
    min_tup = _version_tuple(latest["min_supported_version"])

    has_update = latest_tup > current_tup
    is_mandatory = bool(latest["is_mandatory"]) or (current_tup < min_tup)

    base_url = str(req.base_url).rstrip("/")
    download_url = f"{base_url}/api/v1/updates/download/{latest['package_filename']}" if has_update else None

    return CheckUpdateResponse(
        update_available=has_update,
        latest_version=latest_ver,
        channel=channel,
        min_supported_version=latest["min_supported_version"],
        is_mandatory=is_mandatory,
        download_url=download_url,
        package_filename=latest["package_filename"] if has_update else None,
        package_size_bytes=latest["package_size_bytes"] if has_update else 0,
        package_sha256=latest["package_sha256"] if has_update else None,
        manifest_signature=latest["manifest_signature"] if has_update else None,
        release_notes=latest["release_notes"]
    )


@router.get("/download/{filename}")
def download_release_package(filename: str):
    """Streams the software release package file with Content-Length and caching headers."""
    # Sanitize filename
    clean_name = os.path.basename(filename)
    pkg_path = config.RELEASES_DIR / clean_name

    if not pkg_path.exists():
        raise HTTPException(status_code=404, detail="ملف حزمة التحديث غير موجود على الخادم.")

    return FileResponse(
        path=pkg_path,
        filename=clean_name,
        media_type="application/octet-stream"
    )
