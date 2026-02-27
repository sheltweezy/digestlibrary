"""
Consumption Library API routes.
Covers: profiles, CSV ingestion, daily summaries, entry queries.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import io

from src.db.database import get_db
from src.models.consumption import Profile, ConsumptionEntry, DailySummary
from src.ingestion.snapcalorie import ingest_csv

router = APIRouter()


# --- Profiles ---

@router.post("/profiles")
def create_profile(name: str, db: Session = Depends(get_db)):
    profile = Profile(name=name)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return {"id": profile.id, "name": profile.name}


@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db)):
    profiles = db.query(Profile).all()
    return [{"id": p.id, "name": p.name} for p in profiles]


# --- Ingestion ---

@router.post("/profiles/{profile_id}/ingest/snapcalorie")
async def ingest_snapcalorie(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    content = await file.read()
    text = io.StringIO(content.decode("utf-8"))
    result = ingest_csv(text, profile_id, db)
    return result


# --- Daily summaries ---

@router.get("/profiles/{profile_id}/summary/{log_date}")
def get_daily_summary(profile_id: int, log_date: date, db: Session = Depends(get_db)):
    summary = (
        db.query(DailySummary)
        .filter(DailySummary.profile_id == profile_id, DailySummary.log_date == log_date)
        .first()
    )
    if not summary:
        raise HTTPException(status_code=404, detail="No data for this date")
    return {
        "date": str(summary.log_date),
        "calories": summary.total_calories,
        "protein_g": summary.total_protein_g,
        "carbs_g": summary.total_carbs_g,
        "fat_g": summary.total_fat_g,
        "fiber_g": summary.total_fiber_g,
        "sugar_g": summary.total_sugar_g,
        "sodium_mg": summary.total_sodium_mg,
        "water_ml": summary.total_water_ml,
        "caffeine_mg": summary.total_caffeine_mg,
        "entry_count": summary.entry_count,
    }


@router.get("/profiles/{profile_id}/summaries")
def get_summaries(
    profile_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(DailySummary).filter(DailySummary.profile_id == profile_id)
    if start:
        q = q.filter(DailySummary.log_date >= start)
    if end:
        q = q.filter(DailySummary.log_date <= end)
    summaries = q.order_by(DailySummary.log_date).all()
    return [
        {
            "date": str(s.log_date),
            "calories": s.total_calories,
            "protein_g": s.total_protein_g,
            "carbs_g": s.total_carbs_g,
            "fat_g": s.total_fat_g,
            "fiber_g": s.total_fiber_g,
            "water_ml": s.total_water_ml,
            "caffeine_mg": s.total_caffeine_mg,
            "entry_count": s.entry_count,
        }
        for s in summaries
    ]


# --- Entries ---

@router.get("/profiles/{profile_id}/entries")
def get_entries(
    profile_id: int,
    log_date: date | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(ConsumptionEntry).filter(ConsumptionEntry.profile_id == profile_id)
    if log_date:
        q = q.filter(ConsumptionEntry.log_date == log_date)
    if category:
        q = q.filter(ConsumptionEntry.category == category)
    entries = q.order_by(ConsumptionEntry.logged_at).all()
    return [
        {
            "id": e.id,
            "logged_at": e.logged_at.isoformat(),
            "meal_context": e.meal_context,
            "item_name": e.item_name,
            "brand": e.brand,
            "calories": e.calories,
            "protein_g": e.protein_g,
            "carbs_g": e.carbs_g,
            "fat_g": e.fat_g,
            "fiber_g": e.fiber_g,
            "water_ml": e.water_ml,
            "caffeine_mg": e.caffeine_mg,
        }
        for e in entries
    ]
