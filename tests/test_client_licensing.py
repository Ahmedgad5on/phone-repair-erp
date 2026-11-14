"""
tests/test_client_licensing.py — Unit & Security Tests for Client-Side Licensing Engine
Validates Machine ID generation, Ed25519 offline verification, HMAC cache persistence,
tamper detection, clock rollback defense, and grace period calculations.
"""
import os
import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest

from core.licensing.machine_id import get_installation_id, get_device_metadata
from core.licensing.license_verifier import LicenseVerifier, EMBEDDED_PUBLIC_KEY_PEM
from core.licensing.license_cache import LicenseCacheManager
from core.licensing.client import LicensingClient
from server.security import Ed25519LicensingEngine


def test_machine_id_generation():
    """Validates installation ID format and reproducibility."""
    dev_id1 = get_installation_id()
    dev_id2 = get_installation_id()

    assert dev_id1 == dev_id2, "Device ID must be deterministic and stable across calls"
    assert dev_id1.startswith("TLP-"), "Device ID must have standard TLP prefix"
    parts = dev_id1.split("-")
    assert len(parts) == 6, f"Expected 6 parts in {dev_id1}"
    for p in parts[1:]:
        assert len(p) == 4, f"Each chunk should be 4 hex chars: {p}"

    meta = get_device_metadata()
    assert meta["device_id"] == dev_id1
    assert "os_name" in meta
    assert "architecture" in meta


def test_ed25519_offline_verification():
    """Validates that client-side verifier can cryptographically verify server-signed tokens offline."""
    verifier = LicenseVerifier(EMBEDDED_PUBLIC_KEY_PEM)
    dev_id = get_installation_id()

    now = datetime.now(timezone.utc)
    valid_until = (now + timedelta(days=365)).isoformat()

    payload = {
        "customer_id": "CUST-TEST-001",
        "customer_name": "Al-Amir Mobile",
        "license_key": "PROLAB-ABCD-1234-EF56-7890",
        "device_id": dev_id,
        "plan_code": "ANNUAL",
        "plan_name": "باقة سنوية",
        "valid_until": valid_until,
        "grace_hours": 168,
        "features": ["all"],
        "created_at": now.isoformat()
    }

    token = Ed25519LicensingEngine.sign_payload(payload)
    assert token is not None
    assert len(token.split(".")) == 3

    # Offline evaluation
    status = verifier.evaluate_license(token, current_device_id=dev_id)
    assert status.is_valid is True
    assert status.status == "ACTIVE"
    assert status.days_remaining >= 364
    assert status.is_read_only is False
    assert status.customer_id == "CUST-TEST-001"
    assert status.license_key == "PROLAB-ABCD-1234-EF56-7890"


def test_device_binding_mismatch():
    """Validates that a token generated for another machine is strictly rejected."""
    verifier = LicenseVerifier(EMBEDDED_PUBLIC_KEY_PEM)
    my_dev = get_installation_id()
    foreign_dev = "TLP-9999-8888-7777-6666-5555"

    now = datetime.now(timezone.utc)
    payload = {
        "customer_id": "CUST-TEST-002",
        "license_key": "PROLAB-TEST-FOREIGN",
        "device_id": foreign_dev,
        "plan_code": "MONTHLY",
        "valid_until": (now + timedelta(days=30)).isoformat(),
        "grace_hours": 168
    }

    token = Ed25519LicensingEngine.sign_payload(payload)
    status = verifier.evaluate_license(token, current_device_id=my_dev)

    assert status.is_valid is False
    assert status.status == "DEVICE_MISMATCH"
    assert status.is_read_only is True


def test_grace_period_calculation():
    """Validates that an expired subscription correctly transitions into grace period."""
    verifier = LicenseVerifier(EMBEDDED_PUBLIC_KEY_PEM)
    dev_id = get_installation_id()

    now = datetime.now(timezone.utc)
    # Expired 24 hours ago, with 168h grace
    valid_until = (now - timedelta(hours=24)).isoformat()

    payload = {
        "customer_id": "CUST-GRACE-001",
        "license_key": "PROLAB-GRACE-KEY",
        "device_id": dev_id,
        "plan_code": "MONTHLY",
        "valid_until": valid_until,
        "grace_hours": 168
    }

    token = Ed25519LicensingEngine.sign_payload(payload)
    status = verifier.evaluate_license(token, current_device_id=dev_id, now_utc=now)

    assert status.is_valid is True
    assert status.status == "GRACE_PERIOD"
    assert status.is_in_grace is True
    assert status.is_read_only is False
    assert 140 <= status.grace_hours_remaining <= 145


def test_lockout_after_grace_period():
    """Validates that an expired license past grace period is locked into read-only mode."""
    verifier = LicenseVerifier(EMBEDDED_PUBLIC_KEY_PEM)
    dev_id = get_installation_id()

    now = datetime.now(timezone.utc)
    # Expired 200 hours ago (beyond 168h grace)
    valid_until = (now - timedelta(hours=200)).isoformat()

    payload = {
        "customer_id": "CUST-EXPIRED-001",
        "license_key": "PROLAB-EXP-KEY",
        "device_id": dev_id,
        "plan_code": "MONTHLY",
        "valid_until": valid_until,
        "grace_hours": 168
    }

    token = Ed25519LicensingEngine.sign_payload(payload)
    status = verifier.evaluate_license(token, current_device_id=dev_id, now_utc=now)

    assert status.is_valid is False
    assert status.status == "EXPIRED"
    assert status.is_read_only is True
    assert status.grace_hours_remaining == 0


def test_license_cache_integrity_and_clock_rollback(tmp_path):
    """Validates HMAC integrity validation and clock rollback defense in local cache."""
    cache_file = tmp_path / "test_license_cache.dat"
    cache_mgr = LicenseCacheManager(cache_file=cache_file)
    dev_id = get_installation_id()

    dummy_token = "dummy.header.signature"
    assert cache_mgr.save_cache(dummy_token, device_id=dev_id) is True

    # Read back
    token, rollback = cache_mgr.get_token()
    assert token == dummy_token
    assert rollback is False

    # Simulate clock rollback: Edit stored wall-clock to be 3 days in the future
    raw_data, _ = cache_mgr.load_raw_cache()
    future_time = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    raw_data["last_seen_wall_clock"] = future_time
    # Recompute HMAC with future time
    raw_data["integrity_hmac"] = cache_mgr._compute_hmac(dummy_token, dev_id, future_time)
    cache_file.write_text(json.dumps(raw_data), encoding="utf-8")

    # Now when client reads cache with normal current time, rollback must be caught!
    token, rollback = cache_mgr.get_token()
    assert rollback is True, "Clock rollback must be flagged when current time is earlier than stored time"
