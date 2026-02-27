from datetime import date
from pydantic import BaseModel


class ProfileIn(BaseModel):
    name: str
    date_of_birth: date | None = None
    weight_lbs: float | None = None
    height_inches: float | None = None
    biological_sex: str | None = None


class GoalsIn(BaseModel):
    calories: float | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    water_ml: float | None = None
    caffeine_mg: float | None = None
