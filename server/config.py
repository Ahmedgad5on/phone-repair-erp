"""
server/config.py — Configuration System for ThermalLabPro Central Licensing Server
Supports environment variables, dotenv, secure key paths, and database targets.
"""
from pathlib import Path
import os
from typing import Optional


# Base directory for server persisted state (keys, SQLite db, uploaded releases)
SERVER_DATA_DIR = Path(os.environ.get("THERMALLAB_SERVER_DATA", "server_data")).resolve()
SERVER_DATA_DIR.mkdir(parents=True, exist_ok=True)

KEYS_DIR = SERVER_DATA_DIR / "keys"
KEYS_DIR.mkdir(parents=True, exist_ok=True)

RELEASES_DIR = SERVER_DATA_DIR / "releases"
RELEASES_DIR.mkdir(parents=True, exist_ok=True)


class ServerConfig:
    """Central server operational configuration."""
    
    # Server Binding
    HOST: str = os.environ.get("SERVER_HOST", "0.0.0.0")
    PORT: int = int(os.environ.get("SERVER_PORT", "8000"))
    DEBUG: bool = os.environ.get("SERVER_DEBUG", "false").lower() in ("1", "true", "yes")

    # Directories
    SERVER_DATA_DIR: Path = SERVER_DATA_DIR
    KEYS_DIR: Path = KEYS_DIR
    RELEASES_DIR: Path = RELEASES_DIR

    # Security & Tokens
    SECRET_KEY: str = os.environ.get("SERVER_SECRET_KEY", "prolab-enterprise-licensing-secret-key-2026-apex-precision")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

    # Database: Supports SQLite (WAL mode) or PostgreSQL
    DATABASE_URL: str = os.environ.get("DATABASE_URL", f"sqlite:///{SERVER_DATA_DIR / 'licensing.db'}")

    # Cryptography: Ed25519 Keypair Paths
    ED25519_PRIVATE_KEY_PATH: Path = KEYS_DIR / "ed25519_private.pem"
    ED25519_PUBLIC_KEY_PATH: Path = KEYS_DIR / "ed25519_public.pem"
    ED25519_KEY_ID: str = "ed25519_v1"

    # Default Registration & Approval Policy:
    # "PHONE_AND_ADMIN_APPROVAL" (Default), "AUTOMATIC", "INVITATION_ONLY"
    DEFAULT_REGISTRATION_POLICY: str = os.environ.get("REGISTRATION_POLICY", "PHONE_AND_ADMIN_APPROVAL")

    # OTP Provider: "mock", "twilio", "infobip", "custom"
    OTP_PROVIDER: str = os.environ.get("OTP_PROVIDER", "mock")
    OTP_EXPIRATION_SECONDS: int = int(os.environ.get("OTP_EXPIRATION_SECONDS", "300"))  # 5 minutes
    OTP_MAX_ATTEMPTS: int = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
    OTP_COOLDOWN_SECONDS: int = int(os.environ.get("OTP_COOLDOWN_SECONDS", "60"))

    # WhatsApp Support & Renewal Contact
    WHATSAPP_SUPPORT_PHONE: str = os.environ.get("WHATSAPP_SUPPORT_PHONE", "+201061943367")

    # Licensing Policies
    DEFAULT_OFFLINE_GRACE_HOURS: int = int(os.environ.get("OFFLINE_GRACE_HOURS", "168"))  # 7 days
    CLOCK_ROLLBACK_LEEWAY_SECONDS: int = 300  # 5 minutes leeway for NTP adjustments


config = ServerConfig()
