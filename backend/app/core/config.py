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

    # GEE — graceful fallback when missing
    gee_project_id: Optional[str] = Field(default=None, alias="GEE_PROJECT_ID")
    gee_service_account: Optional[str] = Field(
        default=None, alias="GEE_SERVICE_ACCOUNT"
    )
    gee_private_key: Optional[str] = Field(default=None, alias="GEE_PRIVATE_KEY")
    gee_key_file: Optional[str] = Field(default=None, alias="GEE_KEY_FILE")

    # Scheduler
    scheduler_enabled: bool = Field(default=True, alias="SCHEDULER_ENABLED")
    forest_monitoring_cron: str = Field(
        default="0 2 * * *", alias="FOREST_MONITORING_CRON"
    )
    forest_monitoring_interval_hours: int = Field(
        default=24, alias="FOREST_MONITORING_INTERVAL_HOURS"
    )

    # Firms Sec2 — NASA FIRMS MAP_KEY (Gia Lai LIVE)
    firms_map_key: Optional[str] = Field(default="3ceb6a3e532d5d3be77ff23d71da4f1e", alias="FIRMS_MAP_KEY")

    # Copernicus Sec5
    copernicus_client_id: Optional[str] = Field(default=None, alias="COPERNICUS_CLIENT_ID")
    copernicus_client_secret: Optional[str] = Field(default=None, alias="COPERNICUS_CLIENT_SECRET")
    copernicus_token_url: Optional[str] = Field(default=None, alias="COPERNICUS_TOKEN_URL")

    # Earth Engine dataset defaults
    default_satellite_source: SatelliteSource = Field(
        default=SatelliteSource.SENTINEL2, alias="DEFAULT_SATELLITE_SOURCE"
    )

    @property
    def gee_configured(self) -> bool:
        return bool(self.gee_project_id and (self.gee_private_key or self.gee_key_file) and self.gee_service_account)

    @property
    def is_demo(self) -> bool:
        return self.demo_mode


@lru_cache
def get_settings() -> Settings:
    return Settings()
