"""
Tests for SnapCalorie ingestion logic.
Uses an in-memory SQLite DB — no model inference, no external services.
"""
import io
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.db.database import Base
from src.models.consumption import Profile, ConsumptionEntry, DailySummary
from src.ingestion.snapcalorie import ingest_csv


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def profile(db):
    p = Profile(name="Test User")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


SAMPLE_CSV = """\
date,meal,food_name,brand,calories,protein,carbs,fat,fiber,sugar,sodium,water,caffeine,serving_size,serving_qty
2025-01-15 08:30:00,breakfast,Oatmeal,,300,10,55,5,8,2,150,,0,1 cup,1
2025-01-15 08:30:00,breakfast,Coffee,Starbucks,5,0,0,0,0,0,0,,150,12 fl oz,1
2025-01-15 12:00:00,lunch,Grilled Chicken Salad,,450,40,20,18,5,4,600,,,1 bowl,1
"""


def test_ingest_creates_entries(db, profile):
    result = ingest_csv(io.StringIO(SAMPLE_CSV), profile.id, db)
    assert result["inserted"] == 3
    assert result["skipped"] == 0
    entries = db.query(ConsumptionEntry).filter_by(profile_id=profile.id).all()
    assert len(entries) == 3


def test_ingest_creates_daily_summary(db, profile):
    ingest_csv(io.StringIO(SAMPLE_CSV), profile.id, db)
    summary = db.query(DailySummary).filter_by(profile_id=profile.id).first()
    assert summary is not None
    assert summary.total_calories == 755  # 300 + 5 + 450
    assert summary.total_caffeine_mg == 150


def test_ingest_skips_bad_rows(db, profile):
    csv_with_bad_row = SAMPLE_CSV + "not-a-date,,,,,,,,,,,,,,\n"
    result = ingest_csv(io.StringIO(csv_with_bad_row), profile.id, db)
    assert result["skipped"] == 1
    assert result["inserted"] == 3
