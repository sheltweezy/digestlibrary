"""
SnapCalorie CSV ingestion.

Real export format (confirmed):
  Date,Time,Food,Quantity,Unit,Calories (kcal),Protein (g),Carbs (g),Fat (g),
  Saturates (g),Fiber (g),Sugar (g),Cholesterol (mg),Sodium (mg),Potassium (mg)

- Date and Time are separate columns
- Column headers include units in parentheses
- Blank cells (not zero) for missing optional fields
- No meal label — inferred from timestamp
- No caffeine or water columns
"""
import csv
import io
from datetime import datetime, date
from typing import IO

from sqlalchemy.orm import Session
from src.models.consumption import ConsumptionEntry, DailySummary

COL_DATE        = "Date"
COL_TIME        = "Time"
COL_FOOD        = "Food"
COL_QTY         = "Quantity"
COL_UNIT        = "Unit"
COL_CALORIES    = "Calories (kcal)"
COL_PROTEIN     = "Protein (g)"
COL_CARBS       = "Carbs (g)"
COL_FAT         = "Fat (g)"
COL_SATURATES   = "Saturates (g)"
COL_FIBER       = "Fiber (g)"
COL_SUGAR       = "Sugar (g)"
COL_CHOLESTEROL = "Cholesterol (mg)"
COL_SODIUM      = "Sodium (mg)"
COL_POTASSIUM   = "Potassium (mg)"


def _parse_float(value: str | None) -> float | None:
    if not value or str(value).strip() == "":
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def _parse_datetime(date_str: str, time_str: str) -> datetime:
    combined = f"{date_str.strip()} {time_str.strip()}"
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(combined, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date/time: {combined!r}")


def _infer_meal_context(logged_at: datetime) -> str:
    hour = logged_at.hour
    if 5 <= hour < 10:
        return "breakfast"
    elif 10 <= hour < 15:
        return "lunch"
    elif 15 <= hour < 21:
        return "dinner"
    elif 21 <= hour <= 23:
        return "late_night"
    else:
        return "other"


def ingest_csv(file: IO[str], profile_id: int, db: Session) -> dict:
    """
    Parse a SnapCalorie CSV export and write entries to the DB.

    Returns: {"inserted": int, "skipped": int, "dates": list[str], "errors": list[str]}
    """
    reader = csv.DictReader(file)
    inserted = 0
    skipped = 0
    errors: list[str] = []
    affected_dates: set[date] = set()

    for row_num, row in enumerate(reader, start=2):
        item_name = row.get(COL_FOOD, "").strip()
        if not item_name:
            skipped += 1
            errors.append(f"Row {row_num}: blank food name — skipped")
            continue

        date_str = row.get(COL_DATE, "").strip()
        time_str = row.get(COL_TIME, "").strip()
        try:
            logged_at = _parse_datetime(date_str, time_str)
        except ValueError as e:
            skipped += 1
            errors.append(f"Row {row_num} ({item_name!r}): {e}")
            continue

        log_date = logged_at.date()

        try:
            entry = ConsumptionEntry(
                profile_id   = profile_id,
                logged_at    = logged_at,
                log_date     = log_date,
                meal_context = _infer_meal_context(logged_at),
                item_name    = item_name,
                category     = "food",
                calories     = _parse_float(row.get(COL_CALORIES)),
                protein_g    = _parse_float(row.get(COL_PROTEIN)),
                carbs_g      = _parse_float(row.get(COL_CARBS)),
                fat_g        = _parse_float(row.get(COL_FAT)),
                saturates_g  = _parse_float(row.get(COL_SATURATES)),
                fiber_g      = _parse_float(row.get(COL_FIBER)),
                sugar_g      = _parse_float(row.get(COL_SUGAR)),
                cholesterol_mg = _parse_float(row.get(COL_CHOLESTEROL)),
                sodium_mg    = _parse_float(row.get(COL_SODIUM)),
                potassium_mg = _parse_float(row.get(COL_POTASSIUM)),
                serving_qty  = _parse_float(row.get(COL_QTY)),
                serving_size = row.get(COL_UNIT, "").strip() or None,
                water_ml     = None,
                caffeine_mg  = None,
                source       = "snapcalorie",
            )
            db.add(entry)
            affected_dates.add(log_date)
            inserted += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {row_num} ({item_name!r}): unexpected error — {e}")
            continue

    db.commit()

    for d in affected_dates:
        _rebuild_daily_summary(profile_id, d, db)

    return {
        "inserted": inserted,
        "skipped": skipped,
        "dates": sorted(str(d) for d in affected_dates),
        "errors": errors,
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

    def _sum(field: str) -> float:
        return sum(getattr(e, field) or 0 for e in entries)

    existing = (
        db.query(DailySummary)
        .filter(DailySummary.profile_id == profile_id, DailySummary.log_date == log_date)
        .first()
    )

    if not existing:
        existing = DailySummary(profile_id=profile_id, log_date=log_date)
        db.add(existing)

    existing.total_calories       = _sum("calories")
    existing.total_protein_g      = _sum("protein_g")
    existing.total_carbs_g        = _sum("carbs_g")
    existing.total_fat_g          = _sum("fat_g")
    existing.total_saturates_g    = _sum("saturates_g")
    existing.total_fiber_g        = _sum("fiber_g")
    existing.total_sugar_g        = _sum("sugar_g")
    existing.total_cholesterol_mg = _sum("cholesterol_mg")
    existing.total_sodium_mg      = _sum("sodium_mg")
    existing.total_potassium_mg   = _sum("potassium_mg")
    existing.total_water_ml       = _sum("water_ml")
    existing.total_caffeine_mg    = _sum("caffeine_mg")
    existing.entry_count          = len(entries)
    existing.updated_at           = datetime.utcnow()

    db.commit()
