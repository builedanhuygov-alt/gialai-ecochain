"""GEE authentication — env/secret only, graceful fallback."""
import logging
from typing import Optional

from app.core.config import get_settings
from app.core.enums import GEEStatus

logger = logging.getLogger(__name__)

# Lazy import so app boots even without earthengine-api installed.
_ee = None
_ee_error: Optional[str] = None


def _import_ee():
    global _ee, _ee_error
    if _ee is not None:
        return _ee
    try:
        import ee  # type: ignore

        _ee = ee
        return ee
    except Exception as exc:  # pragma: no cover
        _ee_error = str(exc)
        logger.warning("earthengine-api not available: %s", exc)
        return None


class GEEAuthManager:
    """Handles credential loading and initialization with graceful fallback."""

    def __init__(self):
        self._status: GEEStatus = GEEStatus.NOT_CONFIGURED
        self._last_error: Optional[str] = None
        self._initialized: bool = False

    @property
    def status(self) -> GEEStatus:
        return self._status

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    @property
    def is_connected(self) -> bool:
        return self._status == GEEStatus.CONNECTED

    def check_configuration(self) -> dict:
        s = get_settings()
        configured = s.gee_configured
        return {
            "status": self._status.value,
            "configured": configured,
            "project_id_set": bool(s.gee_project_id),
            "service_account_set": bool(s.gee_service_account),
            "has_key": bool(s.gee_private_key or s.gee_key_file),
            "last_error": self._last_error,
            "ee_import_error": _ee_error,
        }

    def authenticate(self) -> GEEStatus:
        """Try to authenticate. Never crashes the app."""
        s = get_settings()
        if not s.gee_configured:
            self._status = GEEStatus.NOT_CONFIGURED
            self._last_error = "GEE credentials not configured"
            return self._status

        ee = _import_ee()
        if ee is None:
            self._status = GEEStatus.CONNECTION_ISSUE
            self._last_error = _ee_error or "earthengine-api not installed"
            return self._status

        try:
            # Prefer key file, fallback to in-memory credentials
            if s.gee_key_file:
                sa = (s.gee_service_account or "").strip()
                pid = (s.gee_project_id or "").strip()
                credentials = ee.ServiceAccountCredentials(
                    sa, s.gee_key_file.strip()  # type: ignore[arg-type]
                )
                ee.Initialize(credentials, project=pid)  # type: ignore
            else:
                # Private key from env (handle escaped newlines)
                import json
                import tempfile
                import os

                pk = (s.gee_private_key or "").replace("\\n", "\n").strip()
                # strip service_account và project_id khỏi \r\n ẩn
                sa = (s.gee_service_account or "").strip()
                pid = (s.gee_project_id or "").strip()
                key_dict = {
                    "type": "service_account",
                    "project_id": pid,
                    "private_key": pk,
                    "client_email": sa,
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
                # Write temp file for EE (EE expects file path)
                with tempfile.NamedTemporaryFile(
                    mode="w", suffix=".json", delete=False
                ) as tf:
                    json.dump(key_dict, tf)
                    tf_path = tf.name
                try:
                    credentials = ee.ServiceAccountCredentials(
                        s.gee_service_account, tf_path  # type: ignore[arg-type]
                    )
                    ee.Initialize(credentials, project=s.gee_project_id)  # type: ignore
                finally:
                    try:
                        os.unlink(tf_path)
                    except OSError:
                        pass

            self._initialized = True
            self._status = GEEStatus.CONNECTED
            self._last_error = None
            logger.info("GEE authenticated (project=%s)", s.gee_project_id)
            return self._status

        except Exception as exc:  # pragma: no cover
            self._status = GEEStatus.AUTH_FAILED
            self._last_error = str(exc)
            logger.error("GEE authentication failed: %s", exc)
            return self._status


# Singleton
gee_auth = GEEAuthManager()
