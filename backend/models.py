"""BlueSentinel — SQLAlchemy ORM models for scan_batches and detections."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Shared declarative base for all models."""
    pass


class ScanBatch(Base):
    """A single scan/upload event — one image, many detections."""

    __tablename__ = "scan_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    image_path = Column(String, nullable=False)
    total_detections = Column(Integer, nullable=False, default=0)

    # Future geofencing — nullable for now
    gps_lat = Column(Float, nullable=True)
    gps_lon = Column(Float, nullable=True)
    geofence_zone = Column(String, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    detections = relationship("Detection", back_populates="batch", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "filename": self.filename,
            "image_path": self.image_path,
            "total_detections": self.total_detections,
            "gps_lat": self.gps_lat,
            "gps_lon": self.gps_lon,
            "geofence_zone": self.geofence_zone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Detection(Base):
    """A single detected object within a scan batch."""

    __tablename__ = "detections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("scan_batches.id", ondelete="CASCADE"), nullable=False)

    class_name = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    bbox_x1 = Column(Float, nullable=False)
    bbox_y1 = Column(Float, nullable=False)
    bbox_x2 = Column(Float, nullable=False)
    bbox_y2 = Column(Float, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    batch = relationship("ScanBatch", back_populates="detections")

    def to_dict(self):
        return {
            "id": str(self.id),
            "batch_id": str(self.batch_id),
            "class": self.class_name,
            "confidence": self.confidence,
            "box": [self.bbox_x1, self.bbox_y1, self.bbox_x2, self.bbox_y2],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
