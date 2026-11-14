"""
server/dependencies.py — Security Dependencies & Role-Based Access Control (RBAC)
Extracts and validates JWT Bearer tokens, enforces administrative roles, and logs security denials.
"""
from typing import Any, Dict, List, Optional
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from server.config import config
from server.database import CentralDatabaseManager
from server.security import decode_token

security_bearer = HTTPBearer(auto_error=False)


def get_current_user_claims(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Dict[str, Any]:
    """Extracts and verifies JWT token from Authorization Bearer header."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز التفويض (Authorization Token) مفقود. يرجى تسجيل الدخول.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    token = credentials.credentials
    claims = decode_token(token)
    if not claims or claims.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="رمز التفويض غير صالح أو منتهي الصلاحية.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return claims


def require_roles(allowed_roles: List[str]):
    """Enforces server-side Role-Based Access Control (RBAC)."""
    def role_checker(claims: Dict[str, Any] = Depends(get_current_user_claims)) -> Dict[str, Any]:
        user_role = claims.get("role", "")
        # Super admin always has full privileges
        if user_role == "super_admin":
            return claims
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"غير مصرح لك بتنفيذ هذه العملية. تتطلب صلاحيات: {', '.join(allowed_roles)}."
            )
        return claims
    return role_checker


# Role shortcut dependencies
require_admin = require_roles(["super_admin", "licensing_admin", "support_admin", "financial_admin"])
require_super_admin = require_roles(["super_admin"])
require_licensing_admin = require_roles(["super_admin", "licensing_admin"])
require_financial_admin = require_roles(["super_admin", "financial_admin"])
