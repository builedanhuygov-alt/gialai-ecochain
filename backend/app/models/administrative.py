"""Administrative hierarchy — Province → Commune → Village → (Farm/Plot/Field/Lot)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AdministrativeLevel
from app.database import Base

# Geometry stored as GeoJSON dict (JSON string) for SQLite compatibility.
# On Postgres + PostGIS, swap to GeoAlchemy2 Geometry('GEOMETRY', srid=4326).
# The service layer abstracts geometry access so Phase 2 can swap without business-logic changes.


class AdministrativeUnit(Base):
    __tablename__ = "administrative_units"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # AdministrativeLevel value
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("administrative_units.id"), nullable=True)
    code: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)

    # GeoJSON geometry — {"type":"Polygon","coordinates":[...]}
    # Stored as JSON string via String for SQLite; validated in service layer with shapely.
    geometry_geojson: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON string
    centroid_lat: Mapped[float | None] = mapped_column(nullable=True)
    centroid_lng: Mapped[float | None] = mapped_column(nullable=True)
    area_ha: Mapped[float | None] = mapped_column(nullable=True)

    is_demo: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    parent: Mapped["AdministrativeUnit | None"] = relationship("AdministrativeUnit", remote_side=[id], back_populates="children")
    children: Mapped[list["AdministrativeUnit"]] = relationship("AdministrativeUnit", back_populates="parent", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<AdministrativeUnit {self.level}:{self.name} ({self.id})>"

    @property
    def level_enum(self) -> AdministrativeLevel:
        return AdministrativeLevel(self.level)

    def geometry_dict(self) -> dict | None:
        import json
        if not self.geometry_geojson:
            return None
        try:
            return json.loads(self.geometry_geojson)
        except Exception:
            return None

    def set_geometry(self, geojson: dict) -> None:
        import json
        import os

        if not isinstance(geojson, dict) or "type" not in geojson or "coordinates" not in geojson:
            raise ValueError("Invalid GeoJSON")

        # Shapely is optional — disabled by default on Windows due to numpy/shapely crash with Python 3.14
        # Enable with ECOGL_USE_SHAPELY=1. Fallback pure-python centroid works for Phase 1.
        use_shapely = os.getenv("ECOGL_USE_SHAPELY", "0") == "1"
        if use_shapely:
            try:
                from shapely.geometry import shape as _shape  # type: ignore

                geom = _shape(geojson)
                if not geom.is_valid:
                    raise ValueError("Invalid geometry")
                self.geometry_geojson = json.dumps(geojson)
                centroid = geom.centroid
                self.centroid_lng = float(centroid.x)
                self.centroid_lat = float(centroid.y)
                self.area_ha = float(geom.area * 1236400000)
                return
            except Exception as exc:
                if "Invalid geometry" in str(exc):
                    raise
                pass

        # Pure-python fallback: bbox centre
        try:
            coords = geojson["coordinates"][0] if geojson["type"] == "Polygon" else geojson["coordinates"][0][0]
            xs = [c[0] for c in coords]
            ys = [c[1] for c in coords]
            self.centroid_lng = sum(xs) / len(xs)
            self.centroid_lat = sum(ys) / len(ys)
            self.area_ha = abs((max(xs) - min(xs)) * (max(ys) - min(ys)) * 1236400000 * 0.01)
        except Exception:
            self.centroid_lng = None
            self.centroid_lat = None
            self.area_ha = None
        self.geometry_geojson = json.dumps(geojson)
