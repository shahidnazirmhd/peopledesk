"""Password hashing (bcrypt via pwdlib) and JWT helpers."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher

from app.core.config import settings


@lru_cache
def _hasher() -> PasswordHash:
    return PasswordHash((BcryptHasher(rounds=settings.bcrypt_rounds),))


def hash_password(password: str) -> str:
    return _hasher().hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _hasher().verify(plain, hashed)
    except Exception:  # malformed hash, password too long for bcrypt, ...
        return False


@lru_cache
def dummy_hash() -> str:
    """Hash verified when a username does not exist, so response time does not
    reveal which usernames are registered."""
    return hash_password("not-a-real-password")


class TokenError(Exception):
    def __init__(self, message: str, *, expired: bool = False) -> None:
        super().__init__(message)
        self.expired = expired


@dataclass(frozen=True)
class TokenPayload:
    user_id: int
    expires_at: int  # unix timestamp
    jti: str


def create_access_token(user_id: int, *, expires_delta: timedelta | None = None) -> tuple[str, int]:
    """Return (token, expires_in_seconds). Only the user id is in the token;
    role and active status are always re-read from the database."""
    delta = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + delta,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int(delta.total_seconds())


def decode_access_token(token: str) -> TokenPayload:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
        return TokenPayload(
            user_id=int(payload["sub"]),
            expires_at=int(payload["exp"]),
            jti=str(payload.get("jti", "")),
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Your session has expired. Please sign in again.", expired=True) from exc
    except (jwt.PyJWTError, ValueError) as exc:
        raise TokenError("Invalid authentication token.") from exc
