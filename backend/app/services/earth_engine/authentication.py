"""Authentication alias — re-export auth manager for Sec 3 structure."""
from app.services.earth_engine.auth import gee_auth, GEEAuthManager  # noqa: F401

__all__ = ["gee_auth", "GEEAuthManager"]
