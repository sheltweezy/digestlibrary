"""
Analytics API routes — wraps queries.py functions with HTTP endpoints.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.analytics.queries import (
    get_trend_data,
    get_rolling_averages,
    get_favorite_foods,
    get_meal_pattern_breakdown,
    get_recent_entries,
    get_overview_data,
)

router = APIRouter()

DEFAULT_METRICS = ["calories", "protein_g", "carbs_g", "fat_g"]


@router.get("/profiles/{profile_id}/overview")
def overview(
    profile_id: int,
    today: date = Query(default=None),
    db: Session = Depends(get_db),
):
    if today is None:
        today = date.today()
    return get_overview_data(db, profile_id, today)


@router.get("/profiles/{profile_id}/trends")
def trends(
    profile_id: int,
    start: date = Query(default=None),
    end: date = Query(default=None),
    metrics: str = Query(default="calories,protein_g,carbs_g,fat_g"),
    db: Session = Depends(get_db),
):
    if end is None:
        end = date.today()
    if start is None:
        start = end - timedelta(days=29)
    metric_list = [m.strip() for m in metrics.split(",") if m.strip()]
    return get_trend_data(db, profile_id, start, end, metric_list)


@router.get("/profiles/{profile_id}/averages")
def averages(
    profile_id: int,
    start: date = Query(default=None),
    end: date = Query(default=None),
    metrics: str = Query(default="calories,protein_g,carbs_g,fat_g,fiber_g,sodium_mg,water_ml,caffeine_mg"),
    db: Session = Depends(get_db),
):
    if end is None:
        end = date.today()
    if start is None:
        start = end - timedelta(days=29)
    metric_list = [m.strip() for m in metrics.split(",") if m.strip()]
    return get_rolling_averages(db, profile_id, start, end, metric_list)


@router.get("/profiles/{profile_id}/favorites")
def favorites(
    profile_id: int,
    start: date = Query(default=None),
    end: date = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if end is None:
        end = date.today()
    if start is None:
        start = end - timedelta(days=29)
    return get_favorite_foods(db, profile_id, start, end, limit)


@router.get("/profiles/{profile_id}/meal-patterns")
def meal_patterns(
    profile_id: int,
    start: date = Query(default=None),
    end: date = Query(default=None),
    db: Session = Depends(get_db),
):
    if end is None:
        end = date.today()
    if start is None:
        start = end - timedelta(days=29)
    return get_meal_pattern_breakdown(db, profile_id, start, end)


@router.get("/profiles/{profile_id}/recent")
def recent(
    profile_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return get_recent_entries(db, profile_id, limit)
