"""
SnapCalorie export ingestion.
Parses CSV exports from SnapCalorie and writes to the consumption SQLite DB.
"""
import csv
import io
from datetime import datetime, date
from typing import IO

from sqlalchemy.orm import Session
from src.models.consumption import ConsumptionEntry, DailySummary, Profile


# Map SnapCalorie CSV column names to our schema.
# Update these keys once you have a real export to inspect.
COLUMN_MAP = {
    "date": "logged_at",
    "meal": "meal_context",
    "food_name": "item_name",
    "brand": "brand",
    "calories": "calories",
    "protein": "protein_g",
    "carbs": "carbs_g",
    "fat": "fat_g",
    "fiber": "fiber_g",
    "sugar": "sugar_g",
    "sodium": "sodium_mg",
    "water": "water_ml",
    "caffeine": "caffeine_mg",
    "serving_size": "serving_size",
    "serving_qty": "serving_qty",
}


def _parse_float(value: str) -> float | None:
    if not value or value.strip() == "":
        return None
    try:
        return float(value.strip())
    except ValueError:
        return None


def _parse_datetime(value: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {value!r}")


def ingest_csv(file: IO[str], profile_id: int, db: Session) -> dict:
    """
    Parse a SnapCalorie CSV export and write entries to the DB.

    Returns a summary dict: {"inserted": int, "skipped": int, "dates": list[str]}
    """
    reader = csv.DictReader(file)
    inserted = 0
    skipped = 0
    affected_dates: set[date] = set()

    for row in reader:
        try:
            raw_date = row.get("date") or row.get("Date") or row.get("logged_at", "")
            logged_at = _parse_datetime(raw_date)
            log_date = logged_at.date()

            item_name = row.get("food_name") or row.get("Food Name") or row.get("item_name", "")
            if not item_name:
                skipped += 1
                continue

            entry = ConsumptionEntry(
                profile_id=profile_id,
                logged_at=logged_at,
                log_date=log_date,
                meal_context=row.get("meal") or row.get("Meal"),
                item_name=item_name,
                brand=row.get("brand") or row.get("Brand"),
                category="food",
                calories=_parse_float(row.get("calories") or row.get("Calories", "")),
                protein_g=_parse_float(row.get("protein") or row.get("Protein", "")),
                carbs_g=_parse_float(row.get("carbs") or row.get("Carbs", "")),
                fat_g=_parse_float(row.get("fat") or row.get("Fat", "")),
                fiber_g=_parse_float(row.get("fiber") or row.get("Fiber", "")),
                sugar_g=_parse_float(row.get("sugar") or row.get("Sugar", "")),
                sodium_mg=_parse_float(row.get("sodium") or row.get("Sodium", "")),
                water_ml=_parse_float(row.get("water") or row.get("Water", "")),
                caffeine_mg=_parse_float(row.get("caffeine") or row.get("Caffeine", "")),
                serving_size=row.get("serving_size") or row.get("Serving Size"),
                serving_qty=_parse_float(row.get("serving_qty") or row.get("Serving Qty", "")),
                source="snapcalorie",
            )
            db.add(entry)
            affected_dates.add(log_date)
            inserted += 1

        except Exception:
            skipped += 1
            continue

    db.commit()

    # Rebuild daily summaries for all affected dates
    for d in affected_dates:
        _rebuild_daily_summary(profile_id, d, db)

    return {
        "inserted": inserted,
        "skipped": skipped,
        "dates": sorted(str(d) for d in affected_dates),
    }


def _rebuild_daily_summary(profile_id: int, log_date: date, db: Session) -> None:
    entries = (
        db.query(ConsumptionEntry)
        .filter(
            ConsumptionEntry.profile_id == profile_id,
            ConsumptionEntry.log_date == log_date,
        )
        .all()
    )

    def _sum(field):
        return sum(getattr(e, field) or 0 for e in entries)

    existing = (
        db.query(DailySummary)
        .filter(DailySummary.profile_id == profile_id, DailySummary.log_date == log_date)
        .first()
    )

    if not existing:
        existing = DailySummary(profile_id=profile_id, log_date=log_date)
        db.add(existing)

    existing.total_calories = _sum("calories")
    existing.total_protein_g = _sum("protein_g")
    existing.total_carbs_g = _sum("carbs_g")
    existing.total_fat_g = _sum("fat_g")
    existing.total_fiber_g = _sum("fiber_g")
    existing.total_sugar_g = _sum("sugar_g")
    existing.total_sodium_mg = _sum("sodium_mg")
    existing.total_water_ml = _sum("water_ml")
    existing.total_caffeine_mg = _sum("caffeine_mg")
    existing.entry_count = len(entries)
    existing.updated_at = datetime.utcnow()

    db.commit()
