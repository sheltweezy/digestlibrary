from datetime import datetime, date as date_type
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from src.db.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    date_of_birth  = Column(Date, nullable=True)
    weight_lbs     = Column(Float, nullable=True)
    height_inches  = Column(Float, nullable=True)
    biological_sex = Column(String, nullable=True)
    photo_path     = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    entries = relationship("ConsumptionEntry", back_populates="profile", cascade="all, delete-orphan")
    goals   = relationship("ProfileGoals", back_populates="profile", uselist=False, cascade="all, delete-orphan")


class ConsumptionEntry(Base):
    __tablename__ = "consumption_entries"

    id           = Column(Integer, primary_key=True, index=True)
    profile_id   = Column(Integer, ForeignKey("profiles.id"), nullable=False)

    logged_at    = Column(DateTime, nullable=False)
    log_date     = Column(Date, nullable=False)
    meal_context = Column(String)

    item_name    = Column(String, nullable=False)
    brand        = Column(String)
    category     = Column(String)

    calories       = Column(Float)
    protein_g      = Column(Float)
    carbs_g        = Column(Float)
    fat_g          = Column(Float)
    saturates_g    = Column(Float)
    fiber_g        = Column(Float)
    sugar_g        = Column(Float)
    cholesterol_mg = Column(Float)
    sodium_mg      = Column(Float)
    potassium_mg   = Column(Float)
    water_ml       = Column(Float)
    caffeine_mg    = Column(Float)

    serving_qty  = Column(Float)
    serving_size = Column(String)

    source    = Column(String)
    source_id = Column(String)
    notes     = Column(Text)

    profile = relationship("Profile", back_populates="entries")


class DailySummary(Base):
    __tablename__ = "daily_summaries"
    __table_args__ = (UniqueConstraint("profile_id", "log_date", name="uq_profile_date"),)

    id         = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    log_date   = Column(Date, nullable=False)

    total_calories       = Column(Float, default=0)
    total_protein_g      = Column(Float, default=0)
    total_carbs_g        = Column(Float, default=0)
    total_fat_g          = Column(Float, default=0)
    total_saturates_g    = Column(Float, default=0)
    total_fiber_g        = Column(Float, default=0)
    total_sugar_g        = Column(Float, default=0)
    total_cholesterol_mg = Column(Float, default=0)
    total_sodium_mg      = Column(Float, default=0)
    total_potassium_mg   = Column(Float, default=0)
    total_water_ml       = Column(Float, default=0)
    total_caffeine_mg    = Column(Float, default=0)
    entry_count          = Column(Integer, default=0)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProfileGoals(Base):
    __tablename__ = "profile_goals"

    id          = Column(Integer, primary_key=True, index=True)
    profile_id  = Column(Integer, ForeignKey("profiles.id"), nullable=False, unique=True)
    calories    = Column(Float, nullable=True)
    protein_g   = Column(Float, nullable=True)
    carbs_g     = Column(Float, nullable=True)
    fat_g       = Column(Float, nullable=True)
    fiber_g     = Column(Float, nullable=True)
    water_ml    = Column(Float, nullable=True)
    caffeine_mg = Column(Float, nullable=True)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="goals")
