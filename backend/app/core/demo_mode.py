"""Demo mode helper — every response must be tagged REAL/DEMO."""
from app.core.config import get_settings
from app.core.enums import DataStage


def is_demo_mode() -> bool:
    return get_settings().is_demo


def tag_data_origin(is_demo: bool | None = None) -> str:
    """Return 'DEMO' or 'VERIFIED' tag for UI."""
    demo = is_demo if is_demo is not None else is_demo_mode()
    return "DEMO / SIMULATED" if demo else "REAL / VERIFIED"


def demo_warning() -> dict:
    return {
        "origin": "DEMO / SIMULATED",
        "warning": "This is simulated data for demonstration purposes only.",
        "is_demo": True,
    }
