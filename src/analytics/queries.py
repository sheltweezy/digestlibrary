"""
Analytics query layer — pure functions, Session in → dicts out.
No FastAPI dependency. All functions are independently testable.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.models.consumption import ConsumptionEntry, DailySummary, ProfileGoals

METRIC_FIELDS = [
    "calories", "protein_g", "carbs_g", "fat_g", "saturates_g",
    "fiber_g", "sugar_g", "cholesterol_mg", "sodium_mg", "potassium_mg",
    "water_ml", "caffeine_mg",
]

SUMMARY_METRIC_MAP = {
    "calories":       "total_calories",
    "protein_g":      "total_protein_g",
    "carbs_g":        "total_carbs_g",
    "fat_g":          "total_fat_g",
    "saturates_g":    "total_saturates_g",
    "fiber_g":        "total_fiber_g",
    "sugar_g":        "total_sugar_g",
    "cholesterol_mg": "total_cholesterol_mg",
    "sodium_mg":      "total_sodium_mg",
    "potassium_mg":   "total_potassium_mg",
    "water_ml":       "total_water_ml",
    "caffeine_mg":    "total_caffeine_mg",
}


def _date_range(start: date, end: date) -> list[date]:
    """Generate all dates from start to end inclusive."""
    days = []
    current = start
    while current <= end:
        days.append(current)
        current += timedelta(days=1)
    return days


def get_trend_data(
    db: Session,
    profile_id: int,
    start: date,
    end: date,
    metrics: list[str],
) -> dict:
    """
    Returns a dense date array with per-metric series aligned to it.
    Missing dates get None. Used by the chart on the Trends page.
    """
    valid_metrics = [m for m in metrics if m in SUMMARY_METRIC_MAP]
    summaries = (
        db.query(DailySummary)
        .filter(
            DailySummary.profile_id == profile_id,
            DailySummary.log_date >= start,
            DailySummary.log_date <= end,
        )
        .all()
    )
    by_date = {s.log_date: s for s in summaries}
    all_dates = _date_range(start, end)

    series = {m: [] for m in valid_metrics}
    for d in all_dates:
        s = by_date.get(d)
        for m in valid_metrics:
            db_field = SUMMARY_METRIC_MAP[m]
            series[m].append(getattr(s, db_field, None) if s else None)

    return {
        "dates": [str(d) for d in all_dates],
        "series": series,
    }


def get_rolling_averages(
    db: Session,
    profile_id: int,
    start: date,
    end: date,
    metrics: list[str],
) -> dict:
    """
    Average per logged day (not per calendar day) for each metric over the range.
    Also returns days_logged and total_days for the period.
    """
    valid_metrics = [m for m in metrics if m in SUMMARY_METRIC_MAP]
    summaries = (
        db.query(DailySummary)
        .filter(
            DailySummary.profile_id == profile_id,
            DailySummary.log_date >= start,
            DailySummary.log_date <= end,
            DailySummary.entry_count > 0,
        )
        .all()
    )

    days_logged = len(summaries)
    total_days = (end - start).days + 1
    averages = {}
    for m in valid_metrics:
        db_field = SUMMARY_METRIC_MAP[m]
        values = [getattr(s, db_field) for s in summaries if getattr(s, db_field) is not None]
        averages[m] = round(sum(values) / len(values), 1) if values else None

    return {
        "averages": averages,
        "days_logged": days_logged,
        "total_days": total_days,
    }


def get_favorite_foods(
    db: Session,
    profile_id: int,
    start: date,
    end: date,
    limit: int = 20,
) -> list[dict]:
    """Most frequently logged foods in the date range, with avg calories and protein."""
    rows = (
        db.query(
            func.lower(ConsumptionEntry.item_name).label("food"),
            func.count(ConsumptionEntry.id).label("count"),
            func.avg(ConsumptionEntry.calories).label("avg_calories"),
            func.avg(ConsumptionEntry.protein_g).label("avg_protein_g"),
        )
        .filter(
            ConsumptionEntry.profile_id == profile_id,
            ConsumptionEntry.log_date >= start,
            ConsumptionEntry.log_date <= end,
        )
        .group_by(func.lower(ConsumptionEntry.item_name))
        .order_by(func.count(ConsumptionEntry.id).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "food": r.food,
            "count": r.count,
            "avg_calories": round(r.avg_calories, 1) if r.avg_calories else None,
            "avg_protein_g": round(r.avg_protein_g, 1) if r.avg_protein_g else None,
        }
        for r in rows
    ]


def get_meal_pattern_breakdown(
    db: Session,
    profile_id: int,
    start: date,
    end: date,
) -> list[dict]:
    """Per meal_context: avg calories, entry count, top 3 foods."""
    meal_rows = (
        db.query(
            ConsumptionEntry.meal_context,
            func.count(ConsumptionEntry.id).label("entry_count"),
            func.avg(ConsumptionEntry.calories).label("avg_calories"),
        )
        .filter(
            ConsumptionEntry.profile_id == profile_id,
            ConsumptionEntry.log_date >= start,
            ConsumptionEntry.log_date <= end,
        )
        .group_by(ConsumptionEntry.meal_context)
        .order_by(func.avg(ConsumptionEntry.calories).desc())
        .all()
    )

    result = []
    for row in meal_rows:
        top_foods_rows = (
            db.query(
                func.lower(ConsumptionEntry.item_name).label("food"),
                func.count(ConsumptionEntry.id).label("cnt"),
            )
            .filter(
                ConsumptionEntry.profile_id == profile_id,
                ConsumptionEntry.log_date >= start,
                ConsumptionEntry.log_date <= end,
                ConsumptionEntry.meal_context == row.meal_context,
            )
            .group_by(func.lower(ConsumptionEntry.item_name))
            .order_by(func.count(ConsumptionEntry.id).desc())
            .limit(3)
            .all()
        )
        result.append({
            "meal": row.meal_context,
            "entry_count": row.entry_count,
            "avg_calories": round(row.avg_calories, 1) if row.avg_calories else None,
            "top_foods": [r.food for r in top_foods_rows],
        })
    return result


def get_recent_entries(db: Session, profile_id: int, limit: int = 20) -> list[dict]:
    """Most recent N entries, descending."""
    entries = (
        db.query(ConsumptionEntry)
        .filter(ConsumptionEntry.profile_id == profile_id)
        .order_by(ConsumptionEntry.logged_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "logged_at": e.logged_at.isoformat(),
            "log_date": str(e.log_date),
            "meal_context": e.meal_context,
            "item_name": e.item_name,
            "calories": e.calories,
            "protein_g": e.protein_g,
            "carbs_g": e.carbs_g,
            "fat_g": e.fat_g,
            "serving_qty": e.serving_qty,
            "serving_size": e.serving_size,
        }
        for e in entries
    ]


def get_overview_data(db: Session, profile_id: int, today: date) -> dict:
    """
    30-day 'state of you' summary. Compares last 30 days to the prior 30.
    Returns averages, goals, streak, logging consistency, and highlight stats.
    """
    end = today
    start = today - timedelta(days=29)
    prev_end = today - timedelta(days=30)
    prev_start = today - timedelta(days=59)

    core_metrics = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
                    "sodium_mg", "water_ml", "caffeine_mg"]

    current = get_rolling_averages(db, profile_id, start, end, core_metrics)
    previous = get_rolling_averages(db, profile_id, prev_start, prev_end, core_metrics)

    goals = db.query(ProfileGoals).filter_by(profile_id=profile_id).first()
    goals_dict = None
    if goals:
        goals_dict = {
            "calories": goals.calories,
            "protein_g": goals.protein_g,
            "carbs_g": goals.carbs_g,
            "fat_g": goals.fat_g,
            "fiber_g": goals.fiber_g,
            "water_ml": goals.water_ml,
            "caffeine_mg": goals.caffeine_mg,
        }

    # Trend direction per metric vs prior period
    trends = {}
    for m in core_metrics:
        cur = current["averages"].get(m)
        prv = previous["averages"].get(m)
        if cur is not None and prv is not None and prv > 0:
            pct = round(((cur - prv) / prv) * 100, 1)
            trends[m] = {"direction": "up" if pct > 0 else ("down" if pct < 0 else "flat"), "pct": abs(pct)}
        else:
            trends[m] = {"direction": "flat", "pct": 0}

    # Logging streak — consecutive days ending today with entry_count > 0
    streak = 0
    check = today
    while True:
        s = db.query(DailySummary).filter_by(profile_id=profile_id, log_date=check).first()
        if s and s.entry_count > 0:
            streak += 1
            check -= timedelta(days=1)
        else:
            break

    # Highlight: highest sodium day and lowest calorie day in range
    summaries_in_range = (
        db.query(DailySummary)
        .filter(
            DailySummary.profile_id == profile_id,
            DailySummary.log_date >= start,
            DailySummary.log_date <= end,
            DailySummary.entry_count > 0,
        )
        .all()
    )

    highest_sodium = max(summaries_in_range, key=lambda s: s.total_sodium_mg or 0, default=None)
    lowest_cal = min(summaries_in_range, key=lambda s: s.total_calories or float("inf"), default=None)

    # Most logged food in range
    top_food = get_favorite_foods(db, profile_id, start, end, limit=1)

    return {
        "period": {"start": str(start), "end": str(end)},
        "averages": current["averages"],
        "trends": trends,
        "goals": goals_dict,
        "days_logged": current["days_logged"],
        "total_days": current["total_days"],
        "streak": streak,
        "most_logged_food": top_food[0]["food"] if top_food else None,
        "highest_sodium_day": {
            "date": str(highest_sodium.log_date),
            "sodium_mg": highest_sodium.total_sodium_mg,
        } if highest_sodium else None,
        "lowest_calorie_day": {
            "date": str(lowest_cal.log_date),
            "calories": lowest_cal.total_calories,
        } if lowest_cal else None,
    }
