"""BlueSentinel — Production SQLAlchemy ORM models for ROV Simulator, Severity & Optimizer.

Portable across PostgreSQL (asyncpg) and SQLite (aiosqlite) via TypeDecorator
adapters for UUID and JSONB types.
"""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator, CHAR, TEXT

# Try to import PostgreSQL-native types; fall back gracefully
try:
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB as PG_JSONB
    _HAS_PG = True
except ImportError:
    _HAS_PG = False


# ---------------------------------------------------------------------------
# Portable UUID type — native UUID on PostgreSQL, CHAR(36) on SQLite
# ---------------------------------------------------------------------------
class UUID(TypeDecorator):
    """Platform-independent UUID type."""
    impl = CHAR(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql" and _HAS_PG:
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


# ---------------------------------------------------------------------------
# Portable JSONB type — native JSONB on PostgreSQL, TEXT (JSON) on SQLite
# ---------------------------------------------------------------------------
class JSONB(TypeDecorator):
    """Platform-independent JSONB type."""
    impl = TEXT
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql" and _HAS_PG:
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(TEXT())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # asyncpg handles dict→jsonb natively
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        return json.loads(value)


class Base(DeclarativeBase):
    """Shared declarative base for all models."""
    pass



# ── Feature 1: ROV Simulator / Mission Logs ───────────────────────────────────

class SurveyMission(Base):
    """A single ROV video survey / dive mission session."""

    __tablename__ = "survey_missions"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    video_source = Column(String, nullable=False)
    duration_sec = Column(Float, default=0.0)
    zones = Column(Integer, default=0)  # Number of 10-frame analysis windows
    total_unique_objects = Column(Integer, default=0)
    fps = Column(Float, nullable=True)
    avg_latency_ms = Column(Float, nullable=True)
    summary_by_class = Column(JSONB, default=dict)  # {"trash_bottle": 14, "trash_net": 2}
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    incidents = relationship("MissionIncident", back_populates="mission", cascade="all, delete-orphan")
    hotspots = relationship("DebrisHotspot", back_populates="mission", cascade="all, delete-orphan")

    def to_dict(self):
        inc_count = 0
        if "incidents" in self.__dict__ and self.incidents is not None:
            inc_count = len(self.incidents)

        return {
            "id": str(self.id),
            "name": self.name,
            "video_source": self.video_source,
            "duration_sec": self.duration_sec,
            "zones": self.zones,
            "total_unique_objects": self.total_unique_objects,
            "fps": self.fps,
            "avg_latency_ms": self.avg_latency_ms,
            "summary_by_class": self.summary_by_class or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "incident_count": inc_count,
        }


# ── Feature 2: Severity Assessment & Emergency Triage ──────────────────────────

class MissionIncident(Base):
    """High-priority ecological emergency event flagged during an ROV dive."""

    __tablename__ = "mission_incidents"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    mission_id = Column(UUID(), ForeignKey("survey_missions.id", ondelete="CASCADE"), nullable=False)
    incident_type = Column(String, nullable=False)  # ENTANGLEMENT, GHOST_GEAR, LARGE_PILE
    severity = Column(String, nullable=False, default="critical")  # critical, high, medium
    zone = Column(String, nullable=False)  # 10-frame analysis window ID (e.g. "zone_3")
    timestamp_sec = Column(Float, nullable=True)
    snapshot_url = Column(String, nullable=True)  # Saved JPEG thumbnail of the event
    description = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    mission = relationship("SurveyMission", back_populates="incidents")

    def to_dict(self):
        return {
            "id": str(self.id),
            "mission_id": str(self.mission_id),
            "incident_type": self.incident_type,
            "severity": self.severity,
            "zone": self.zone,
            "timestamp_sec": self.timestamp_sec,
            "snapshot_url": self.snapshot_url,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DebrisHotspot(Base):
    """Top-ranked debris pile cluster for targeted recovery operations."""

    __tablename__ = "debris_hotspots"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    mission_id = Column(UUID(), ForeignKey("survey_missions.id", ondelete="CASCADE"), nullable=False)
    zone = Column(String, nullable=False)  # 10-frame analysis window ID (e.g. "zone_3")
    debris_count = Column(Integer, nullable=False)
    weighted_score = Column(Float, nullable=False)
    dominant_class = Column(String, nullable=True)
    snapshot_url = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    mission = relationship("SurveyMission", back_populates="hotspots")

    def to_dict(self):
        return {
            "id": str(self.id),
            "mission_id": str(self.mission_id),
            "zone": self.zone,
            "debris_count": self.debris_count,
            "weighted_score": self.weighted_score,
            "dominant_class": self.dominant_class,
            "snapshot_url": self.snapshot_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ── Feature 3: Cleanup Optimizer & Logistics Dispatch ─────────────────────────

class CleanupZone(Base):
    """Geographic marine survey area and its accumulated debris inventory."""

    __tablename__ = "cleanup_zones"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)            # e.g. Coral Triangle Zone A
    location_coords = Column(String, nullable=False) # e.g. Lat 2.3N, Lon 108.5E
    travel_cost_usd = Column(Float, default=0.0)
    debris_inventory = Column(JSONB, default=list)   # Feed from ROV surveys
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    plans = relationship("CleanupPlan", back_populates="zone", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "location_coords": self.location_coords,
            "travel_cost_usd": self.travel_cost_usd,
            "debris_inventory": self.debris_inventory or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CleanupPlan(Base):
    """Generated cleanup work order with diver team size, tools, and cost range."""

    __tablename__ = "cleanup_plans"

    id = Column(UUID(), primary_key=True, default=uuid.uuid4)
    zone_id = Column(UUID(), ForeignKey("cleanup_zones.id", ondelete="CASCADE"), nullable=False)
    priority_rank = Column(Integer, default=1)
    estimated_min_hours = Column(Float, nullable=False)
    estimated_max_hours = Column(Float, nullable=False)
    max_crew_required = Column(Integer, default=1)
    required_equipment = Column(JSONB, default=list)  # ["cutters", "lift bags"]
    estimated_min_cost = Column(Float, nullable=False)
    estimated_max_cost = Column(Float, nullable=False)
    cost_min = Column(Float, nullable=True)
    cost_max = Column(Float, nullable=True)
    mode = Column(String, nullable=True, default="compact_rov")
    crew = Column(JSONB, default=dict)
    depth_source = Column(String, nullable=True, default="simulated")  # bathymetry | simulated
    assumptions_version = Column(String, nullable=True)
    breakdown = Column(JSONB, default=dict)
    warnings = Column(JSONB, default=list)
    dispatch_status = Column(String, default="draft")  # draft, approved, dispatched, completed
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    zone = relationship("CleanupZone", back_populates="plans")

    def to_dict(self):
        zone_name = None
        if "zone" in self.__dict__ and self.zone is not None:
            zone_name = self.zone.name

        c_min = self.cost_min if self.cost_min is not None else self.estimated_min_cost
        c_max = self.cost_max if self.cost_max is not None else self.estimated_max_cost

        return {
            "id": str(self.id),
            "zone_id": str(self.zone_id),
            "zone_name": zone_name,
            "priority_rank": self.priority_rank,
            "estimated_min_hours": self.estimated_min_hours,
            "estimated_max_hours": self.estimated_max_hours,
            "max_crew_required": self.max_crew_required,
            "required_equipment": self.required_equipment or [],
            "estimated_min_cost": c_min,
            "estimated_max_cost": c_max,
            "cost_min": c_min,
            "cost_max": c_max,
            "mode": self.mode,
            "crew": self.crew or {},
            "depth_source": self.depth_source,
            "assumptions_version": self.assumptions_version,
            "breakdown": self.breakdown or {},
            "warnings": self.warnings or [],
            "dispatch_status": self.dispatch_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
