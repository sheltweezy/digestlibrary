"""
Ingestion tests — all use in-memory SQLite, no model calls, no external services.
"""
import io
import pathlib
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.db.database import Base
from src.models.consumption import Profile, ConsumptionEntry, DailySummary
from src.ingestion.snapcalorie import ingest_csv

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "sample_snapcalorie.csv"


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


def _load_fixture() -> io.StringIO:
    return io.StringIO(FIXTURE.read_text(encoding="utf-8"))


def test_ingest_basic(db, profile):
    result = ingest_csv(_load_fixture(), profile.id, db)
    assert result["inserted"] == 5
    assert result["skipped"] == 0
    assert len(db.query(ConsumptionEntry).filter_by(profile_id=profile.id).all()) == 5


def test_meal_context_inference(db, profile):
    ingest_csv(_load_fixture(), profile.id, db)
    entries = (
        db.query(ConsumptionEntry)
        .filter_by(profile_id=profile.id)
        .order_by(ConsumptionEntry.logged_at)
        .all()
    )
    # 07:30 → breakfast
    assert entries[0].item_name == "Scrambled Eggs"
    assert entries[0].meal_context == "breakfast"
    # 12:15 → lunch
    assert entries[1].item_name == "Grilled Chicken Breast"
    assert entries[1].meal_context == "lunch"
    # 18:45 → dinner
    assert entries[2].item_name == "Brown Rice"
    assert entries[2].meal_context == "dinner"
    # 08:00 → breakfast
    assert entries[3].item_name == "steak"
    assert entries[3].meal_context == "breakfast"
    # 12:04 → lunch
    assert entries[4].item_name == "ranch dressing"
    assert entries[4].meal_context == "lunch"


def test_blank_fields_are_none(db, profile):
    ingest_csv(_load_fixture(), profile.id, db)
    # Brown Rice row has blank Saturates (g)
    rice = (
        db.query(ConsumptionEntry)
        .filter_by(profile_id=profile.id, item_name="Brown Rice")
        .first()
    )
    assert rice is not None
    assert rice.saturates_g is None
    # ranch dressing row has blank Potassium (mg)
    ranch = (
        db.query(ConsumptionEntry)
        .filter_by(profile_id=profile.id, item_name="ranch dressing")
        .first()
    )
    assert ranch is not None
    assert ranch.potassium_mg is None


def test_daily_summary_totals(db, profile):
    ingest_csv(_load_fixture(), profile.id, db)
    from datetime import date
    summary = (
        db.query(DailySummary)
        .filter_by(profile_id=profile.id, log_date=date(2026, 2, 5))
        .first()
    )
    assert summary is not None
    assert summary.total_calories == pytest.approx(180 + 275 + 215)
    assert summary.entry_count == 3


def test_daily_summary_new_fields(db, profile):
    ingest_csv(_load_fixture(), profile.id, db)
    from datetime import date
    summary = (
        db.query(DailySummary)
        .filter_by(profile_id=profile.id, log_date=date(2026, 2, 5))
        .first()
    )
    # saturates: 3.5 + 1.5 + 0 (None treated as 0)
    assert summary.total_saturates_g == pytest.approx(5.0)
    # cholesterol: 420 + 166 + 0
    assert summary.total_cholesterol_mg == pytest.approx(586.0)
    # potassium: 140 + 440 + 84
    assert summary.total_potassium_mg == pytest.approx(664.0)


def test_skips_row_with_no_food_name(db, profile):
    csv_content = FIXTURE.read_text(encoding="utf-8")
    csv_with_blank = csv_content + "2026-02-07,09:00,,1,serving,100,5,10,3,,,,,\n"
    result = ingest_csv(io.StringIO(csv_with_blank), profile.id, db)
    assert result["skipped"] == 1
    assert result["inserted"] == 5
    assert any("blank food name" in e for e in result["errors"])


def test_skips_unparseable_date(db, profile):
    csv_content = FIXTURE.read_text(encoding="utf-8")
    csv_with_bad = csv_content + "not-a-date,25:99,Bad Entry,1,serving,100,,,,,,,,,\n"
    result = ingest_csv(io.StringIO(csv_with_bad), profile.id, db)
    assert result["skipped"] == 1
    assert result["inserted"] == 5
    assert len(result["errors"]) == 1


def test_ingest_doubles_on_second_import(db, profile):
    """
    Known limitation: no deduplication. Importing the same file twice doubles entry count.
    Intended workflow is to import non-overlapping 7-day exports weekly.
    """
    ingest_csv(_load_fixture(), profile.id, db)
    ingest_csv(_load_fixture(), profile.id, db)
    count = db.query(ConsumptionEntry).filter_by(profile_id=profile.id).count()
    assert count == 10


def test_water_and_caffeine_are_none(db, profile):
    """SnapCalorie exports have no caffeine/water columns — both should be None."""
    ingest_csv(_load_fixture(), profile.id, db)
    entries = db.query(ConsumptionEntry).filter_by(profile_id=profile.id).all()
    for e in entries:
        assert e.water_ml is None
        assert e.caffeine_mg is None
