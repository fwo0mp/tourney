"""Tournament Trading Dashboard API.

Run with: uv run uvicorn api.main:app --reload
For mock mode: USE_MOCK_DATA=true uv run uvicorn api.main:app --reload
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import tournament, portfolio, analysis, market
from api.services.tournament_service import TournamentService

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup: Pre-load tournament state
    try:
        service = TournamentService.get_instance()
        service.load()
        print("Tournament state loaded successfully")
    except FileNotFoundError as e:
        print(f"Warning: Could not load tournament state: {e}")
        print("API will attempt to load on first request")

    yield

    # Shutdown: cleanup if needed
    pass


app = FastAPI(
    title="Tournament Trading Dashboard API",
    description="API for NCAA tournament prediction market risk management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tournament.router, prefix="/api/v1")
app.include_router(portfolio.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(market.router, prefix="/api/v1")


@app.get("/")
def root():
    """Root endpoint with API info."""
    return {
        "name": "Tournament Trading Dashboard API",
        "version": "1.0.0",
        "docs": "/docs",
        "mock_mode": os.getenv("USE_MOCK_DATA", "").lower() in ("true", "1", "yes"),
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy"}
