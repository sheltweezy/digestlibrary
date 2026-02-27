"""
SQLite models for the Consumption Library.
Tracks food, drinks, caffeine, supplements, and prescriptions per profile per day.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from src.db.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    entries = relationship("ConsumptionEntry", back_populates="profile")


class ConsumptionEntry(Base):
    """One logged item (food, drink, supplement, etc.) for a profile on a given day."""
    __tablename__ = "consumption_entries"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)

    # When
    logged_at = Column(DateTime, nullable=False)
    log_date = Column(Date, nullable=False)  # derived from logged_at for day-level queries
    meal_context = Column(String)  # breakfast, lunch, dinner, snack, etc.

    # What
    item_name = Column(String, nullable=False)
    brand = Column(String)
    category = Column(String)  # food, drink, caffeine, supplement, prescription

    # Macros (all nullable — not every item has all values)
    calories = Column(Float)
    protein_g = Column(Float)
    carbs_g = Column(Float)
    fat_g = Column(Float)
    fiber_g = Column(Float)
    sugar_g = Column(Float)
    sodium_mg = Column(Float)

    # Hydration / stimulants
    water_ml = Column(Float)
    caffeine_mg = Column(Float)

    # Quantity
    serving_size = Column(String)
    serving_qty = Column(Float)

    # Source
    source = Column(String)  # snapcalorie, manual, barcode, etc.
    source_id = Column(String)  # external ID from the source app

    # Context (for ChromaDB — stored here as reference)
    notes = Column(Text)

    profile = relationship("Profile", back_populates="entries")


class DailySummary(Base):
    """Precomputed daily rollup per profile. Rebuilt on ingestion."""
    __tablename__ = "daily_summaries"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    log_date = Column(Date, nullable=False)

    total_calories = Column(Float, default=0)
    total_protein_g = Column(Float, default=0)
    total_carbs_g = Column(Float, default=0)
    total_fat_g = Column(Float, default=0)
    total_fiber_g = Column(Float, default=0)
    total_sugar_g = Column(Float, default=0)
    total_sodium_mg = Column(Float, default=0)
    total_water_ml = Column(Float, default=0)
    total_caffeine_mg = Column(Float, default=0)
    entry_count = Column(Integer, default=0)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
