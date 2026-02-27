"""
Consumption Library API routes.
Profiles, photo upload, ingestion, daily summaries, entries, goals.
"""
import io
import os
import shutil
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from sqlalchemy.orm import Session

from src.db.database import get_db
from src.models.consumption import Profile, ConsumptionEntry, DailySummary, ProfileGoals
from src.ingestion.snapcalorie import ingest_csv
from src.api.schemas import ProfileIn, GoalsIn

router = APIRouter()

UPLOAD_DIR = Path("src/static/uploads/profiles")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _profile_dict(p: Profile) -> dict:
    age = None
    if p.date_of_birth:
        today = datetime.utcnow().date()
        age = today.year - p.date_of_birth.year - (
            (today.month, today.day) < (p.date_of_birth.month, p.date_of_birth.day)
        )
    bmi = None
    if p.weight_lbs and p.height_inches and p.height_inches > 0:
        bmi = round((p.weight_lbs / (p.height_inches ** 2)) * 703, 1)
    return {
        "id": p.id,
        "name": p.name,
        "date_of_birth": str(p.date_of_birth) if p.date_of_birth else None,
        "age": age,
        "weight_lbs": p.weight_lbs,
        "height_inches": p.height_inches,
        "biological_sex": p.biological_sex,
        "photo_path": p.photo_path,
        "bmi": bmi,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _get_profile_or_404(profile_id: int, db: Session) -> Profile:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


# ── Profiles ─────────────────────────────────────────────────────────────────

@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db)):
    return [_profile_dict(p) for p in db.query(Profile).order_by(Profile.name).all()]


@router.post("/profiles", status_code=201)
def create_profile(data: ProfileIn, db: Session = Depends(get_db)):
    p = Profile(
        name=data.name,
        date_of_birth=data.date_of_birth,
        weight_lbs=data.weight_lbs,
        height_inches=data.height_inches,
        biological_sex=data.biological_sex,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _profile_dict(p)


@router.get("/profiles/{profile_id}")
def get_profile(profile_id: int, db: Session = Depends(get_db)):
    return _profile_dict(_get_profile_or_404(profile_id, db))


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: int, data: ProfileIn, db: Session = Depends(get_db)):
    p = _get_profile_or_404(profile_id, db)
    p.name           = data.name
    p.date_of_birth  = data.date_of_birth
    p.weight_lbs     = data.weight_lbs
    p.height_inches  = data.height_inches
    p.biological_sex = data.biological_sex
    db.commit()
    db.refresh(p)
    return _profile_dict(p)


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    p = _get_profile_or_404(profile_id, db)
    # Remove photo file if exists
    if p.photo_path:
        try:
            photo_file = Path("src/static") / p.photo_path.lstrip("/static/")
            if photo_file.exists():
                photo_file.unlink()
        except Exception:
            pass
    db.delete(p)
    db.commit()


@router.post("/profiles/{profile_id}/photo")
async def upload_photo(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    p = _get_profile_or_404(profile_id, db)
    suffix = Path(file.filename).suffix.lower() or ".jpg"
    dest = UPLOAD_DIR / f"{profile_id}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    p.photo_path = f"/static/uploads/profiles/{profile_id}{suffix}"
    db.commit()
    return {"photo_path": p.photo_path}


# ── Goals ─────────────────────────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/goals")
def get_goals(profile_id: int, db: Session = Depends(get_db)):
    _get_profile_or_404(profile_id, db)
    goals = db.query(ProfileGoals).filter_by(profile_id=profile_id).first()
    if not goals:
        return {"set": False}
    return {
        "set": True,
        "calories": goals.calories,
        "protein_g": goals.protein_g,
        "carbs_g": goals.carbs_g,
        "fat_g": goals.fat_g,
        "fiber_g": goals.fiber_g,
        "water_ml": goals.water_ml,
        "caffeine_mg": goals.caffeine_mg,
    }


@router.post("/profiles/{profile_id}/goals")
def upsert_goals(profile_id: int, data: GoalsIn, db: Session = Depends(get_db)):
    _get_profile_or_404(profile_id, db)
    goals = db.query(ProfileGoals).filter_by(profile_id=profile_id).first()
    if not goals:
        goals = ProfileGoals(profile_id=profile_id)
        db.add(goals)
    goals.calories    = data.calories
    goals.protein_g   = data.protein_g
    goals.carbs_g     = data.carbs_g
    goals.fat_g       = data.fat_g
    goals.fiber_g     = data.fiber_g
    goals.water_ml    = data.water_ml
    goals.caffeine_mg = data.caffeine_mg
    db.commit()
    db.refresh(goals)
    return {
        "set": True,
        "calories": goals.calories,
        "protein_g": goals.protein_g,
        "carbs_g": goals.carbs_g,
        "fat_g": goals.fat_g,
        "fiber_g": goals.fiber_g,
        "water_ml": goals.water_ml,
        "caffeine_mg": goals.caffeine_mg,
    }


# ── Ingestion ─────────────────────────────────────────────────────────────────

@router.post("/profiles/{profile_id}/ingest/snapcalorie")
async def ingest_snapcalorie(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _get_profile_or_404(profile_id, db)
    content = await file.read()
    text = io.StringIO(content.decode("utf-8"))
    return ingest_csv(text, profile_id, db)


# ── Summaries ─────────────────────────────────────────────────────────────────

def _summary_dict(s: DailySummary) -> dict:
    return {
        "date": str(s.log_date),
        "calories": s.total_calories,
        "protein_g": s.total_protein_g,
        "carbs_g": s.total_carbs_g,
        "fat_g": s.total_fat_g,
        "saturates_g": s.total_saturates_g,
        "fiber_g": s.total_fiber_g,
        "sugar_g": s.total_sugar_g,
        "cholesterol_mg": s.total_cholesterol_mg,
        "sodium_mg": s.total_sodium_mg,
        "potassium_mg": s.total_potassium_mg,
        "water_ml": s.total_water_ml,
        "caffeine_mg": s.total_caffeine_mg,
        "entry_count": s.entry_count,
    }


@router.get("/profiles/{profile_id}/summary/{log_date}")
def get_daily_summary(profile_id: int, log_date: date, db: Session = Depends(get_db)):
    _get_profile_or_404(profile_id, db)
    s = (
        db.query(DailySummary)
        .filter_by(profile_id=profile_id, log_date=log_date)
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="No data for this date")
    return _summary_dict(s)


@router.get("/profiles/{profile_id}/summaries")
def get_summaries(
    profile_id: int,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
):
    _get_profile_or_404(profile_id, db)
    q = db.query(DailySummary).filter(DailySummary.profile_id == profile_id)
    if start:
        q = q.filter(DailySummary.log_date >= start)
    if end:
        q = q.filter(DailySummary.log_date <= end)
    return [_summary_dict(s) for s in q.order_by(DailySummary.log_date).all()]


# ── Entries ───────────────────────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/entries")
def get_entries(
    profile_id: int,
    log_date: date | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    _get_profile_or_404(profile_id, db)
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
            "log_date": str(e.log_date),
            "meal_context": e.meal_context,
            "item_name": e.item_name,
            "brand": e.brand,
            "category": e.category,
            "calories": e.calories,
            "protein_g": e.protein_g,
            "carbs_g": e.carbs_g,
            "fat_g": e.fat_g,
            "saturates_g": e.saturates_g,
            "fiber_g": e.fiber_g,
            "sugar_g": e.sugar_g,
            "cholesterol_mg": e.cholesterol_mg,
            "sodium_mg": e.sodium_mg,
            "potassium_mg": e.potassium_mg,
            "water_ml": e.water_ml,
            "caffeine_mg": e.caffeine_mg,
            "serving_qty": e.serving_qty,
            "serving_size": e.serving_size,
        }
        for e in entries
    ]
