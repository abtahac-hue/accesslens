from pathlib import Path
from fastapi.staticfiles import StaticFiles
from backend.main import app

frontend_directory = (
    Path(__file__).resolve().parent.parent / "frontend" / "dist"
)

if not (frontend_directory / "index.html").is_file():
    raise RuntimeError("Build the frontend before starting production.")

app.mount(
    "/",
    StaticFiles(directory=frontend_directory, html=True),
    name="frontend",
)
