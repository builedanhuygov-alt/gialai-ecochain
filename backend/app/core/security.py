"""JWT auth helpers — bcrypt passwords (via `bcrypt` pkg), HS256 tokens (via `python-jose`).

Access tokens (short-lived) gate official/admin routes via
`Depends(get_current_user)` / `Depends(require_role("admin"))`.
Refresh tokens (long-lived) rotate server-side: each use revokes the old
token and issues a new pair; reusing a revoked token revokes the whole
chain (reuse detection).
"""
import uuid
from datetime import datetime, timedelta
from app.core.time import utcnow
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    s = get_settings()
    expire = utcnow() + timedelta(
        minutes=expires_minutes if expires_minutes is not None else s.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": subject, "type": "access", "exp": expire},
        s.secret_key,
        algorithm=s.auth_algorithm,
    )


def create_refresh_token(username: str, db: Session) -> str:
    """Issue a refresh token and persist its jti for rotation tracking."""
    from app.models.refresh_token import RefreshToken

    s = get_settings()
    jti = uuid.uuid4().hex
    expires_at = utcnow() + timedelta(days=s.refresh_token_expire_days)
    db.add(RefreshToken(username=username, jti=jti, expires_at=expires_at))
    db.commit()
    return jwt.encode(
        {"sub": username, "type": "refresh", "jti": jti, "exp": expires_at},
        s.secret_key,
        algorithm=s.auth_algorithm,
    )


def revoke_user_tokens(username: str, db: Session) -> None:
    from app.models.refresh_token import RefreshToken

    db.query(RefreshToken).filter(RefreshToken.username == username).update({"revoked": True})
    db.commit()


def rotate_refresh_token(token: str, db: Session) -> tuple[str, str]:
    """Consume a refresh token → new (access, refresh) pair.

    Reuse of an already-revoked token revokes the whole chain (theft signal).
    """
    from app.models.refresh_token import RefreshToken

    s = get_settings()
    try:
        payload = jwt.decode(token, s.secret_key, algorithms=[s.auth_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh" or not payload.get("jti") or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    username, jti = payload["sub"], payload["jti"]
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if row is None or row.revoked:
        # possible theft: kill the whole chain
        revoke_user_tokens(username, db)
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    row.revoked = True
    db.commit()
    new_refresh = create_refresh_token(username, db)
    row.replaced_by = jwt.decode(
        new_refresh, s.secret_key, algorithms=[s.auth_algorithm]
    )["jti"]
    db.commit()
    return create_access_token(username), new_refresh


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
):
    from app.models.user import User

    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, get_settings().secret_key, algorithms=[get_settings().auth_algorithm]
        )
        username: Optional[str] = payload.get("sub")
        if payload.get("type", "access") != "access":
            raise cred_exc
    except JWTError:
        raise cred_exc
    if not username:
        raise cred_exc
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise cred_exc
    return user


def require_role(role: str):
    def checker(user=Depends(get_current_user)):
        if user.role != role and user.role != "admin":
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return user

    return checker
