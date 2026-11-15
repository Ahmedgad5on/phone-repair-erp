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
    """Enforces server-side Role-Based Access Control (RBAC) with database-backed verification."""
    def role_checker(claims: Dict[str, Any] = Depends(get_current_user_claims)) -> Dict[str, Any]:
        user_id = claims.get("sub", "")
        token_role = claims.get("role", "")

        db = CentralDatabaseManager.get_instance()
        conn = db.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT role, is_active FROM server_users WHERE user_id = ?;", (user_id,))
        user_row = cur.fetchone()

        if not user_row or not user_row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="الحساب غير موجود أو تم تعطيله في الخادم المركزي.",
                headers={"WWW-Authenticate": "Bearer"}
            )

        db_role = user_row["role"]
        if db_role != token_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="صلاحيات الحساب في قاعدة البيانات لا تطابق رمز التفويض."
            )

        # Super admin always has full privileges
        if db_role == "super_admin":
            return claims
        if db_role not in allowed_roles:
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
