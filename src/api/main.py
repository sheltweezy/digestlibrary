from fastapi import FastAPI
from src.db.database import init_db
from src.api.routes import consumption

app = FastAPI(title="Digest Library", version="0.1.0")

@app.on_event("startup")
def startup():
    init_db()

app.include_router(consumption.router, prefix="/consumption", tags=["consumption"])

@app.get("/health")
def health():
    return {"status": "ok"}
