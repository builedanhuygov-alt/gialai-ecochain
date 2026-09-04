"""Centralised configuration — env-based, no hard-coded secrets."""
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.enums import SatelliteSource


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = Field(default="ECOGL", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    demo_mode: bool = Field(default=False, alias="DEMO_MODE")

    # Database
    database_url: str = Field(
        default="sqlite:///./ecogl.db", alias="DATABASE_URL"
    )

    # Security
    secret_key: str = Field(default="change-me", alias="SECRET_KEY")

    # GEE — env-based, no hard-coded secrets
    gee_project_id: Optional[str] = Field(default=None, alias="GEE_PROJECT_ID")
    gee_service_account: Optional[str] = Field(default=None, alias="GEE_SERVICE_ACCOUNT")
    gee_private_key: Optional[str] = Field(default=None, alias="GEE_PRIVATE_KEY")
    gee_key_file: Optional[str] = Field(default=None, alias="GEE_KEY_FILE")

    # LLM AI Agent — Gemini / Groq (PCCC scenario generation)
    gemini_api_key: Optional[str] = Field(default=None, alias="GEMINI_API_KEY")
    groq_api_key: Optional[str] = Field(default=None, alias="GROQ_API_KEY")
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    cdse_client_id: Optional[str] = Field(default=None, alias="CDSE_CLIENT_ID")
    cdse_client_secret: Optional[str] = Field(default=None, alias="CDSE_CLIENT_SECRET")

    # Scheduler
    scheduler_enabled: bool = Field(default=True, alias="SCHEDULER_ENABLED")
    forest_monitoring_cron: str = Field(
        default="0 2 * * *", alias="FOREST_MONITORING_CRON"
    )
    forest_monitoring_interval_hours: int = Field(
        default=24, alias="FOREST_MONITORING_INTERVAL_HOURS"
    )

    # Firms — NASA FIRMS MAP_KEY
    firms_map_key: Optional[str] = Field(default=None, alias="FIRMS_MAP_KEY")
    nasa_firms_map_key: Optional[str] = Field(default=None, alias="NASA_FIRMS_MAP_KEY")

    # Copernicus / Sentinel Hub / CDSE — env-based
    copernicus_client_id: Optional[str] = Field(default=None, alias="COPERNICUS_CLIENT_ID")
    copernicus_client_secret: Optional[str] = Field(default=None, alias="COPERNICUS_CLIENT_SECRET")
    copernicus_token_url: Optional[str] = Field(default=None, alias="COPERNICUS_TOKEN_URL")
    sentinelhub_client_id: Optional[str] = Field(default=None, alias="SENTINELHUB_CLIENT_ID")
    sentinelhub_client_secret: Optional[str] = Field(default=None, alias="SENTINELHUB_CLIENT_SECRET")
    sentinelhub_token_url: str = Field(default="https://services.sentinel-hub.com/oauth/token", alias="SENTINELHUB_TOKEN_URL")

    # Earth Engine dataset defaults
    default_satellite_source: SatelliteSource = Field(
        default=SatelliteSource.SENTINEL2, alias="DEFAULT_SATELLITE_SOURCE"
    )

    @property
    def gee_configured(self) -> bool:
        import os
        # strip \r\n ẩn do Pipe PowerShell
        pid = (self.gee_project_id or os.getenv("GEE_PROJECT_ID") or "").strip()
        sa = (self.gee_service_account or os.getenv("GEE_SERVICE_ACCOUNT") or "").strip()
        pk = (self.gee_private_key or os.getenv("GEE_PRIVATE_KEY") or "").strip()
        kf = (self.gee_key_file or os.getenv("GEE_KEY_FILE") or "").strip()
        has_key = bool(pk or kf)
        return bool(pid and sa and has_key)

    @property
    def llm_configured(self) -> bool:
        import os
        return bool(
            self.gemini_api_key
            or self.groq_api_key
            or self.openai_api_key
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GROQ_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )

    @property
    def is_demo(self) -> bool:
        return self.demo_mode

    @property
    def effective_firms_key(self) -> Optional[str]:
        import os
        return self.firms_map_key or self.nasa_firms_map_key or os.getenv("FIRMS_MAP_KEY") or os.getenv("NASA_FIRMS_MAP_KEY")

    @property
    def sentinelhub_configured(self) -> bool:
        import os
        cid = self.sentinelhub_client_id or self.copernicus_client_id or os.getenv("SENTINELHUB_CLIENT_ID") or os.getenv("COPERNICUS_CLIENT_ID")
        sec = self.sentinelhub_client_secret or self.copernicus_client_secret or os.getenv("SENTINELHUB_CLIENT_SECRET") or os.getenv("COPERNICUS_CLIENT_SECRET")
        return bool(cid and sec)

    @property
    def effective_sentinelhub_id(self) -> Optional[str]:
        import os
        return self.sentinelhub_client_id or self.copernicus_client_id or os.getenv("SENTINELHUB_CLIENT_ID") or os.getenv("COPERNICUS_CLIENT_ID")

    @property
    def effective_sentinelhub_secret(self) -> Optional[str]:
        import os
        return self.sentinelhub_client_secret or self.copernicus_client_secret or os.getenv("SENTINELHUB_CLIENT_SECRET") or os.getenv("COPERNICUS_CLIENT_SECRET")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # triệt để strip \r\n ẩn do Pipe PowerShell
    if s.gee_project_id:
        s.gee_project_id = s.gee_project_id.strip()
    if s.gee_service_account:
        s.gee_service_account = s.gee_service_account.strip()
    if s.gee_private_key:
        s.gee_private_key = s.gee_private_key.replace("\\n", "\n").strip()
    if s.gee_key_file:
        s.gee_key_file = s.gee_key_file.strip()
    return s
