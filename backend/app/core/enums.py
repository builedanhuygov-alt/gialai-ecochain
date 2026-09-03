"""Core enums — pipeline states, granularities, sources."""
from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:
        return self.value


class AdministrativeLevel(StrEnum):
    PROVINCE = "PROVINCE"
    COMMUNE = "COMMUNE"
    VILLAGE = "VILLAGE"
    # Future EUDR extensibility — do NOT remove
    FARM = "FARM"
    PLOT = "PLOT"
    FIELD = "FIELD"
    LOT = "LOT"


class ProposalStatus(StrEnum):
    PROPOSED = "PROPOSED"
    PENDING = "PENDING"
    # Phase 2 community / official split
    COMMUNITY_VERIFIED = "COMMUNITY_VERIFIED"
    OFFICIAL_VERIFIED = "OFFICIAL_VERIFIED"
    VERIFIED = "VERIFIED"  # legacy alias = OFFICIAL_VERIFIED
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class DataStage(StrEnum):
    RAW = "RAW"
    PROCESSED = "PROCESSED"
    AI_RESULT = "AI_RESULT"
    DATA_PROPOSAL = "DATA_PROPOSAL"
    VERIFIED = "VERIFIED"


class DataSourceType(StrEnum):
    EARTH_ENGINE = "EARTH_ENGINE"
    WEATHER = "WEATHER"
    GIS = "GIS"
    NEWS = "NEWS"
    ADMIN_INPUT = "ADMIN_INPUT"


class SatelliteSource(StrEnum):
    SENTINEL2 = "SENTINEL2"
    SENTINEL1 = "SENTINEL1"
    LANDSAT8 = "LANDSAT8"
    LANDSAT9 = "LANDSAT9"
    SRTM = "SRTM"
    NASADEM = "NASADEM"
    DYNAMIC_WORLD = "DYNAMIC_WORLD"
    ESA_WORLDCOVER = "ESA_WORLDCOVER"


class GEEStatus(StrEnum):
    CONNECTED = "CONNECTED"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    CONNECTION_ISSUE = "CONNECTION_ISSUE"
    AUTH_FAILED = "AUTH_FAILED"


class JobStatus(StrEnum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    NO_DATA = "NO_DATA"
    CANCELLED = "CANCELLED"
    SKIPPED = "SKIPPED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    ELEVATED = "ELEVATED"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class FireWarningLevel(StrEnum):
    I = "I"
    II = "II"
    III = "III"
    IV = "IV"
    V = "V"

FIRE_WARNING_LABELS = {
    FireWarningLevel.I: "ÍT NGUY CƠ",
    FireWarningLevel.II: "NGUY CƠ TRUNG BÌNH",
    FireWarningLevel.III: "NGUY CƠ CAO",
    FireWarningLevel.IV: "NGUY HIỂM",
    FireWarningLevel.V: "CỰC KỲ NGUY HIỂM",
}


class AgentName(StrEnum):
    FOREST_GUARD = "ForestGuard"
    CARBON = "CarbonAgent"
    DISASTER = "DisasterAgent"
