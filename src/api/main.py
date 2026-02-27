from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.db.database import init_db
from src.api.routes import consumption, analytics

app = FastAPI(title="Digest Library", version="0.2.0")


@app.on_event("startup")
def startup():
    init_db()


app.include_router(consumption.router, prefix="/consumption", tags=["consumption"])
app.include_router(analytics.router, prefix="/consumption", tags=["analytics"])

app.mount("/static", StaticFiles(directory="src/static"), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/{full_path:path}")
def serve_ui(full_path: str):
    return FileResponse("src/static/index.html")
