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


# Initialize on import
init_db()
