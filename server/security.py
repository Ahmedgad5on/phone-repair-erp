"""
server/security.py — Enterprise Cryptographic & Authentication Engine
- Argon2id Password Hashing (via cryptography primitives)
- Ed25519 Asymmetric Digital Signature Engine (RFC 8032)
- JWT Token Factory with Refresh Token Rotation
- Timing-safe verification & Base64URL token formatting
"""
import base64
from datetime import datetime, timezone, timedelta
import hmac
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id
from cryptography.hazmat.primitives import serialization
import jwt

from server.config import config

logger = logging.getLogger(__name__)


# ==============================================================================
# 1. Argon2id Password Hashing Engine
# ==============================================================================

ARGON2_MEMORY_COST_KB = 65536  # 64 MB
ARGON2_TIME_COST = 3          # 3 iterations
ARGON2_LANES = 4              # 4 parallel lanes
ARGON2_KEY_LENGTH = 32        # 32 bytes output


def hash_password(password: str) -> str:
    """
    Hashes a password using Argon2id with a cryptographically secure 16-byte random salt.
    Format: $argon2id$v=19$m=65536,t=3,p=4$<salt_b64>$<hash_b64>
    """
    if not password:
        raise ValueError("Password cannot be empty")
    salt = os.urandom(16)
    kdf = Argon2id(
        salt=salt,
        length=ARGON2_KEY_LENGTH,
        iterations=ARGON2_TIME_COST,
        lanes=ARGON2_LANES,
        memory_cost=ARGON2_MEMORY_COST_KB
    )
    derived = kdf.derive(password.encode("utf-8"))
    salt_b64 = base64.b64encode(salt).decode("ascii")
    hash_b64 = base64.b64encode(derived).decode("ascii")
    return f"$argon2id$v=19$m={ARGON2_MEMORY_COST_KB},t={ARGON2_TIME_COST},p={ARGON2_LANES}${salt_b64}${hash_b64}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against an Argon2id formatted hash using timing-safe comparison.
    """
    if not plain_password or not hashed_password:
        return False
    parts = hashed_password.split("$")
    if len(parts) != 6 or parts[1] != "argon2id":
        return False
    try:
        # Parse params: m=65536,t=3,p=4
        params_str = parts[3]
        params = dict(item.split("=") for item in params_str.split(","))
        m_cost = int(params.get("m", ARGON2_MEMORY_COST_KB))
        t_cost = int(params.get("t", ARGON2_TIME_COST))
        p_lanes = int(params.get("p", ARGON2_LANES))

        salt = base64.b64decode(parts[4])
        expected_hash = base64.b64decode(parts[5])

        kdf = Argon2id(
            salt=salt,
            length=len(expected_hash),
            iterations=t_cost,
            lanes=p_lanes,
            memory_cost=m_cost
        )
        derived = kdf.derive(plain_password.encode("utf-8"))
        return hmac.compare_digest(derived, expected_hash)
    except Exception as e:
        logger.warning(f"Error during password verification: {e}")
        return False


# ==============================================================================
# 2. Ed25519 Digital Signature & Licensing Engine
# ==============================================================================

class Ed25519LicensingEngine:
    """
    Manages the master Ed25519 asymmetric keypair and cryptographic signing of software licenses.
    The private key stays strictly on the server and is never packaged with client EXEs.
    """
    _private_key: Optional[ed25519.Ed25519PrivateKey] = None
    _public_key: Optional[ed25519.Ed25519PublicKey] = None

    @classmethod
    def get_or_create_keys(cls) -> Tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey]:
        """Loads existing keypair from disk or generates a new one on initial setup."""
        if cls._private_key is not None and cls._public_key is not None:
            return cls._private_key, cls._public_key

        priv_path = Path(config.ED25519_PRIVATE_KEY_PATH)
        pub_path = Path(config.ED25519_PUBLIC_KEY_PATH)

        if priv_path.exists() and pub_path.exists():
            with open(priv_path, "rb") as f:
                cls._private_key = serialization.load_pem_private_key(f.read(), password=None)
            with open(pub_path, "rb") as f:
                cls._public_key = serialization.load_pem_public_key(f.read())
            logger.info("Loaded existing Ed25519 licensing keys.")
        else:
            logger.info("Generating new master Ed25519 licensing keypair...")
            cls._private_key = ed25519.Ed25519PrivateKey.generate()
            cls._public_key = cls._private_key.public_key()

            # Save private key (PEM PKCS#8)
            priv_pem = cls._private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            )
            with open(priv_path, "wb") as f:
                f.write(priv_pem)

            # Save public key (PEM SubjectPublicKeyInfo)
            pub_pem = cls._public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            )
            with open(pub_path, "wb") as f:
                f.write(pub_pem)
            logger.info(f"Generated and persisted new Ed25519 keypair at {config.KEYS_DIR}")

        return cls._private_key, cls._public_key

    @classmethod
    def get_public_key_pem(cls) -> str:
        """Returns the public key in standard PEM string format."""
        _, pub = cls.get_or_create_keys()
        return pub.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode("utf-8")

    @classmethod
    def get_public_key_raw_b64(cls) -> str:
        """Returns the raw 32-byte Ed25519 public key as Base64 string."""
        _, pub = cls.get_or_create_keys()
        raw_bytes = pub.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        return base64.b64encode(raw_bytes).decode("ascii")

    @classmethod
    def sign_payload(cls, payload: Dict[str, Any], key_id: str = config.ED25519_KEY_ID) -> str:
        """
        Signs a structured JSON dictionary using Ed25519.
        Returns a compact token: BASE64URL(Header) . BASE64URL(Payload) . BASE64URL(Signature)
        """
        priv, _ = cls.get_or_create_keys()
        header = {
            "alg": "Ed25519",
            "typ": "PROLAB-LICENSE",
            "kid": key_id,
            "v": "1.0"
        }
        # Canonical canonical JSON serialization (deterministic sorting, no extra whitespace)
        hdr_bytes = json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
        pay_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")

        hdr_b64 = base64.urlsafe_b64encode(hdr_bytes).decode("ascii").rstrip("=")
        pay_b64 = base64.urlsafe_b64encode(pay_bytes).decode("ascii").rstrip("=")

        signing_input = f"{hdr_b64}.{pay_b64}".encode("ascii")
        signature = priv.sign(signing_input)
        sig_b64 = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")

        return f"{hdr_b64}.{pay_b64}.{sig_b64}"

    @classmethod
    def verify_token(cls, token: str, public_key_pem: Optional[str] = None) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Verifies an Ed25519 signed license token.
        Can use server's public key or a provided public key PEM string.
        Returns (is_valid, payload_dict, error_message).
        """
        try:
            parts = token.strip().split(".")
            if len(parts) != 3:
                return False, None, "Invalid token structure (expected 3 parts)"

            hdr_b64, pay_b64, sig_b64 = parts

            # Restore base64 padding
            def b64_decode(data: str) -> bytes:
                padding = 4 - (len(data) % 4)
                if padding != 4:
                    data += "=" * padding
                return base64.urlsafe_b64decode(data)

            hdr_bytes = b64_decode(hdr_b64)
            pay_bytes = b64_decode(pay_b64)
            sig_bytes = b64_decode(sig_b64)

            header = json.loads(hdr_bytes.decode("utf-8"))
            if header.get("alg") != "Ed25519":
                return False, None, f"Unsupported signature algorithm: {header.get('alg')}"

            # Public key resolution
            if public_key_pem:
                pub_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
            else:
                _, pub_key = cls.get_or_create_keys()

            signing_input = f"{hdr_b64}.{pay_b64}".encode("ascii")
            pub_key.verify(sig_bytes, signing_input)

            payload = json.loads(pay_bytes.decode("utf-8"))
            return True, payload, ""
        except InvalidSignature:
            return False, None, "Cryptographic signature verification failed (Tampered token)"
        except Exception as e:
            return False, None, f"Token verification error: {str(e)}"


# ==============================================================================
# 3. JWT Authentication Tokens
# ==============================================================================

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates a signed JWT access token."""
    to_encode = data.copy()
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        expire = now_utc + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"iat": now_utc, "exp": expire, "type": "access"})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def create_refresh_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generates a signed JWT refresh token."""
    to_encode = data.copy()
    now_utc = datetime.now(timezone.utc)
    if expires_delta:
        expire = now_utc + expires_delta
    else:
        expire = now_utc + timedelta(days=config.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"iat": now_utc, "exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT token signature and expiration."""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError as e:
        logger.debug(f"JWT decode failed: {e}")
        return None
