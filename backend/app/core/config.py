"""Application settings, loaded from environment variables / backend/.env."""

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Values that must never be used as a signing key outside development.
_WEAK_SECRETS = {
    "",
    "secret",
    "changeme",
    "change-me",
    "replace-with-a-long-random-secret",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Resolved from this file, so it works no matter which directory you start from.
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Server -----------------------------------------------------------
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # --- Database ---------------------------------------------------------
    database_url: str
    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_echo: bool = False

    # --- Auth -------------------------------------------------------------
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    bcrypt_rounds: int = 12

    # --- CORS (REST + Socket.IO) -----------------------------------------
    cors_origins: str = "http://localhost:5173"

    # --- Login rate limiting ---------------------------------------------
    login_rate_limit_attempts: int = 5
    login_rate_limit_window_seconds: int = 900

    # --- Seeding ----------------------------------------------------------
    seed_admin_on_startup: bool = True
    seed_admin_username: str = "admin"
    seed_admin_display_name: str = "Administrator"
    seed_admin_password: str = "Admin@123"

    # --- Socket.IO scaling ------------------------------------------------
    socketio_redis_url: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _check_secrets(self) -> "Settings":
        weak = self.jwt_secret.lower() in _WEAK_SECRETS or len(self.jwt_secret) < 32
        if weak and self.is_production:
            raise ValueError(
                "JWT_SECRET is missing, a placeholder, or shorter than 32 characters. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
            )
        if weak:
            logger.warning(
                "JWT_SECRET is weak or a placeholder. Fine for local development, "
                "never for production."
            )
        if self.is_production and self.seed_admin_password == "Admin@123":
            logger.warning(
                "SEED_ADMIN_PASSWORD is the public demo password. Change it before "
                "the first start in production."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
