"""SQLite database for persistent tournament data."""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

DATABASE_PATH = Path("tourney.db")


def init_db():
    """Initialize database with schema."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS completed_games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                winner TEXT NOT NULL,
                loser TEXT NOT NULL,
                round INTEGER,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(winner, loser)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS whatif_game_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                winner TEXT NOT NULL,
                loser TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(winner, loser)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS whatif_rating_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team TEXT NOT NULL UNIQUE,
                adjustment REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


@contextmanager
def get_connection():
    """Get database connection with context manager."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def get_completed_games() -> list[tuple[str, str]]:
    """Get all completed games as (winner, loser) tuples."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT winner, loser FROM completed_games ORDER BY id"
        ).fetchall()
        return [(row["winner"], row["loser"]) for row in rows]


def add_completed_game(winner: str, loser: str, round: int = None) -> bool:
    """Add a completed game. Returns True if added, False if already exists."""
    with get_connection() as conn:
        try:
            conn.execute(
                "INSERT INTO completed_games (winner, loser, round) VALUES (?, ?, ?)",
                (winner, loser, round)
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False


def remove_completed_game(winner: str, loser: str) -> bool:
    """Remove a completed game. Returns True if removed."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM completed_games WHERE winner = ? AND loser = ?",
            (winner, loser)
        )
        conn.commit()
        return cursor.rowcount > 0


def clear_completed_games():
    """Clear all completed games (for testing/reset)."""
    with get_connection() as conn:
        conn.execute("DELETE FROM completed_games")
        conn.commit()


# What-if game outcomes
def get_whatif_game_outcomes() -> list[tuple[str, str]]:
    """Get all what-if game outcomes as (winner, loser) tuples."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT winner, loser FROM whatif_game_outcomes ORDER BY id"
        ).fetchall()
        return [(row["winner"], row["loser"]) for row in rows]


def set_whatif_game_outcome(winner: str, loser: str) -> bool:
    """Set a what-if game outcome. Returns True if added/updated."""
    with get_connection() as conn:
        # Remove any existing outcomes involving these teams
        conn.execute(
            "DELETE FROM whatif_game_outcomes WHERE winner = ? OR winner = ? OR loser = ? OR loser = ?",
            (winner, loser, winner, loser)
        )
        # Add the new outcome
        conn.execute(
            "INSERT INTO whatif_game_outcomes (winner, loser) VALUES (?, ?)",
            (winner, loser)
        )
        conn.commit()
        return True


def remove_whatif_game_outcome(winner: str, loser: str) -> bool:
    """Remove a what-if game outcome. Returns True if removed."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM whatif_game_outcomes WHERE winner = ? AND loser = ?",
            (winner, loser)
        )
        conn.commit()
        return cursor.rowcount > 0


def clear_whatif_game_outcomes():
    """Clear all what-if game outcomes."""
    with get_connection() as conn:
        conn.execute("DELETE FROM whatif_game_outcomes")
        conn.commit()


# What-if rating adjustments
def get_whatif_rating_adjustments() -> dict[str, float]:
    """Get all what-if rating adjustments as team -> adjustment dict."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT team, adjustment FROM whatif_rating_adjustments"
        ).fetchall()
        return {row["team"]: row["adjustment"] for row in rows}


def set_whatif_rating_adjustment(team: str, adjustment: float) -> bool:
    """Set a what-if rating adjustment. Returns True if added/updated."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO whatif_rating_adjustments (team, adjustment) VALUES (?, ?)
               ON CONFLICT(team) DO UPDATE SET adjustment = ?, created_at = CURRENT_TIMESTAMP""",
            (team, adjustment, adjustment)
        )
        conn.commit()
        return True


def remove_whatif_rating_adjustment(team: str) -> bool:
    """Remove a what-if rating adjustment. Returns True if removed."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM whatif_rating_adjustments WHERE team = ?",
            (team,)
        )
        conn.commit()
        return cursor.rowcount > 0


def clear_whatif_rating_adjustments():
    """Clear all what-if rating adjustments."""
    with get_connection() as conn:
        conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.commit()


def clear_all_whatif():
    """Clear all what-if state (game outcomes and rating adjustments)."""
    with get_connection() as conn:
        conn.execute("DELETE FROM whatif_game_outcomes")
        conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.commit()


# Initialize on import
init_db()
