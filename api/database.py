"""SQLite database for persistent tournament data."""

import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional

# Store database alongside the api package (project root) by default.
# E2E tests can override this with TOURNEY_DB_PATH to isolate test state.
DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent.parent / "tourney.db"


def get_database_path() -> Path:
    """Get database path, with optional environment override."""
    override = os.getenv("TOURNEY_DB_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return DEFAULT_DATABASE_PATH


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

        # Scenarios table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scenarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Active scenario singleton table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS active_scenario (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                scenario_id INTEGER,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL
            )
        """)
        # Ensure singleton row exists
        conn.execute("""
            INSERT OR IGNORE INTO active_scenario (id, scenario_id) VALUES (1, NULL)
        """)

        # What-if game outcomes table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS whatif_game_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team1 TEXT NOT NULL,
                team2 TEXT NOT NULL,
                probability REAL NOT NULL,
                is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
                scenario_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
                UNIQUE(team1, team2, is_permanent, scenario_id)
            )
        """)

        # What-if rating adjustments table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS whatif_rating_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team TEXT NOT NULL,
                adjustment REAL NOT NULL,
                is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
                scenario_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
                UNIQUE(team, is_permanent, scenario_id)
            )
        """)

        # Migration: add is_permanent and scenario_id columns if missing
        try:
            conn.execute("SELECT is_permanent FROM whatif_game_outcomes LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE whatif_game_outcomes ADD COLUMN is_permanent BOOLEAN NOT NULL DEFAULT FALSE")
            conn.execute("ALTER TABLE whatif_game_outcomes ADD COLUMN scenario_id INTEGER")

        try:
            conn.execute("SELECT is_permanent FROM whatif_rating_adjustments LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE whatif_rating_adjustments ADD COLUMN is_permanent BOOLEAN NOT NULL DEFAULT FALSE")
            conn.execute("ALTER TABLE whatif_rating_adjustments ADD COLUMN scenario_id INTEGER")
        conn.commit()


@contextmanager
def get_connection():
    """Get database connection with context manager."""
    db_path = get_database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    except BaseException:
        conn.rollback()
        raise
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


# Scenarios
def get_scenarios() -> list[dict]:
    """Get all scenarios."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, description, created_at FROM scenarios ORDER BY name"
        ).fetchall()
        return [
            {"id": row["id"], "name": row["name"], "description": row["description"]}
            for row in rows
        ]


def create_scenario(name: str, description: Optional[str] = None) -> Optional[dict]:
    """Create a new scenario. Returns the created scenario or None if name exists."""
    with get_connection() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO scenarios (name, description) VALUES (?, ?)",
                (name, description)
            )
            conn.commit()
            return {"id": cursor.lastrowid, "name": name, "description": description}
        except sqlite3.IntegrityError:
            return None


def delete_scenario(scenario_id: int) -> bool:
    """Delete a scenario. Returns True if deleted. Cascades to overrides."""
    with get_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM scenarios WHERE id = ?",
            (scenario_id,)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_active_scenario() -> Optional[dict]:
    """Get the active scenario or None if default."""
    with get_connection() as conn:
        row = conn.execute("""
            SELECT s.id, s.name, s.description
            FROM active_scenario a
            LEFT JOIN scenarios s ON a.scenario_id = s.id
            WHERE a.id = 1
        """).fetchone()
        if row and row["id"]:
            return {"id": row["id"], "name": row["name"], "description": row["description"]}
        return None


def set_active_scenario(scenario_id: Optional[int]) -> bool:
    """Set the active scenario. Pass None for default (no scenario)."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE active_scenario SET scenario_id = ? WHERE id = 1",
            (scenario_id,)
        )
        conn.commit()
        return True


# What-if game outcomes
def get_whatif_game_outcomes(
    is_permanent: Optional[bool] = None,
    scenario_id: Optional[int] = None,
    scenario_id_is_null: bool = False
) -> list[tuple[str, str, float]]:
    """Get what-if game outcomes as (team1, team2, probability) tuples.

    Args:
        is_permanent: If True, get permanent overrides. If False, get scenario overrides.
                     If None, get all.
        scenario_id: Filter by scenario_id (for scenario overrides).
        scenario_id_is_null: If True, get overrides where scenario_id IS NULL (ad-hoc).
    """
    with get_connection() as conn:
        query = "SELECT team1, team2, probability FROM whatif_game_outcomes WHERE 1=1"
        params = []

        if is_permanent is not None:
            query += " AND is_permanent = ?"
            params.append(is_permanent)

        if scenario_id_is_null:
            query += " AND scenario_id IS NULL"
        elif scenario_id is not None:
            query += " AND scenario_id = ?"
            params.append(scenario_id)

        query += " ORDER BY id"
        rows = conn.execute(query, params).fetchall()
        return [(row["team1"], row["team2"], row["probability"]) for row in rows]


def set_whatif_game_outcome(
    team1: str,
    team2: str,
    probability: float,
    is_permanent: bool = False,
    scenario_id: Optional[int] = None
) -> bool:
    """Set a what-if game outcome with probability.

    Teams are stored in lexicographic order. Probability is for team1 winning.
    If teams are provided in reverse order, probability is flipped automatically.

    Args:
        is_permanent: If True, this is a permanent override (scenario_id ignored).
        scenario_id: For non-permanent, the scenario to add to (None = ad-hoc).
    """
    # Normalize to lexicographic order
    if team1 > team2:
        team1, team2 = team2, team1
        probability = 1.0 - probability

    # Permanent overrides have no scenario_id
    if is_permanent:
        scenario_id = None

    with get_connection() as conn:
        # Remove any existing outcome for this team pair in this context
        if is_permanent:
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = TRUE",
                (team1, team2)
            )
        elif scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team1, team2, scenario_id)
            )
        else:
            # Ad-hoc: scenario_id IS NULL
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team1, team2)
            )

        # Add the new outcome
        conn.execute(
            "INSERT INTO whatif_game_outcomes (team1, team2, probability, is_permanent, scenario_id) VALUES (?, ?, ?, ?, ?)",
            (team1, team2, probability, is_permanent, scenario_id)
        )
        conn.commit()
        return True


def remove_whatif_game_outcome(
    team1: str,
    team2: str,
    is_permanent: bool = False,
    scenario_id: Optional[int] = None
) -> bool:
    """Remove a what-if game outcome. Returns True if removed."""
    # Normalize to lexicographic order
    if team1 > team2:
        team1, team2 = team2, team1

    with get_connection() as conn:
        if is_permanent:
            cursor = conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = TRUE",
                (team1, team2)
            )
        elif scenario_id is not None:
            cursor = conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team1, team2, scenario_id)
            )
        else:
            # Ad-hoc: scenario_id IS NULL
            cursor = conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team1, team2)
            )
        conn.commit()
        return cursor.rowcount > 0


def clear_whatif_game_outcomes(scenario_id: Optional[int] = None, permanent_only: bool = False):
    """Clear what-if game outcomes.

    Args:
        scenario_id: If provided, clear only this scenario's outcomes.
        permanent_only: If True, clear only permanent outcomes.
    """
    with get_connection() as conn:
        if permanent_only:
            conn.execute("DELETE FROM whatif_game_outcomes WHERE is_permanent = TRUE")
        elif scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE is_permanent = FALSE AND scenario_id = ?",
                (scenario_id,)
            )
        else:
            conn.execute("DELETE FROM whatif_game_outcomes")
        conn.commit()


# What-if rating adjustments
def get_whatif_rating_adjustments(
    is_permanent: Optional[bool] = None,
    scenario_id: Optional[int] = None,
    scenario_id_is_null: bool = False
) -> dict[str, float]:
    """Get what-if rating adjustments as team -> adjustment dict.

    Args:
        is_permanent: If True, get permanent overrides. If False, get scenario overrides.
                     If None, get all.
        scenario_id: Filter by scenario_id (for scenario overrides).
        scenario_id_is_null: If True, get overrides where scenario_id IS NULL (ad-hoc).
    """
    with get_connection() as conn:
        query = "SELECT team, adjustment FROM whatif_rating_adjustments WHERE 1=1"
        params = []

        if is_permanent is not None:
            query += " AND is_permanent = ?"
            params.append(is_permanent)

        if scenario_id_is_null:
            query += " AND scenario_id IS NULL"
        elif scenario_id is not None:
            query += " AND scenario_id = ?"
            params.append(scenario_id)

        rows = conn.execute(query, params).fetchall()
        return {row["team"]: row["adjustment"] for row in rows}


def set_whatif_rating_adjustment(
    team: str,
    adjustment: float,
    is_permanent: bool = False,
    scenario_id: Optional[int] = None
) -> bool:
    """Set a what-if rating adjustment. Returns True if added/updated."""
    if is_permanent:
        scenario_id = None

    with get_connection() as conn:
        # Remove existing
        if is_permanent:
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = TRUE",
                (team,)
            )
        elif scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team, scenario_id)
            )
        else:
            # Ad-hoc: scenario_id IS NULL
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team,)
            )

        # Insert new
        conn.execute(
            "INSERT INTO whatif_rating_adjustments (team, adjustment, is_permanent, scenario_id) VALUES (?, ?, ?, ?)",
            (team, adjustment, is_permanent, scenario_id)
        )
        conn.commit()
        return True


def remove_whatif_rating_adjustment(
    team: str,
    is_permanent: bool = False,
    scenario_id: Optional[int] = None
) -> bool:
    """Remove a what-if rating adjustment. Returns True if removed."""
    with get_connection() as conn:
        if is_permanent:
            cursor = conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = TRUE",
                (team,)
            )
        elif scenario_id is not None:
            cursor = conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team, scenario_id)
            )
        else:
            # Ad-hoc: scenario_id IS NULL
            cursor = conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team,)
            )
        conn.commit()
        return cursor.rowcount > 0


def clear_whatif_rating_adjustments(scenario_id: Optional[int] = None, permanent_only: bool = False):
    """Clear what-if rating adjustments."""
    with get_connection() as conn:
        if permanent_only:
            conn.execute("DELETE FROM whatif_rating_adjustments WHERE is_permanent = TRUE")
        elif scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE is_permanent = FALSE AND scenario_id = ?",
                (scenario_id,)
            )
        else:
            conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.commit()


def clear_all_whatif():
    """Clear all what-if state (game outcomes and rating adjustments)."""
    with get_connection() as conn:
        conn.execute("DELETE FROM whatif_game_outcomes")
        conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.commit()


def clear_scenario_whatif(scenario_id: int):
    """Clear all what-if state for a specific scenario."""
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM whatif_game_outcomes WHERE scenario_id = ?",
            (scenario_id,)
        )
        conn.execute(
            "DELETE FROM whatif_rating_adjustments WHERE scenario_id = ?",
            (scenario_id,)
        )
        conn.commit()


def clear_adhoc_whatif():
    """Clear all ad-hoc what-if state (non-permanent with NULL scenario_id)."""
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM whatif_game_outcomes WHERE is_permanent = FALSE AND scenario_id IS NULL"
        )
        conn.execute(
            "DELETE FROM whatif_rating_adjustments WHERE is_permanent = FALSE AND scenario_id IS NULL"
        )
        conn.commit()


def promote_game_outcome_to_permanent(team1: str, team2: str, scenario_id: Optional[int]) -> bool:
    """Move a game outcome from a scenario (or ad-hoc) to permanent. Returns True if promoted."""
    if team1 > team2:
        team1, team2 = team2, team1

    with get_connection() as conn:
        # Get the current value
        if scenario_id is not None:
            row = conn.execute(
                "SELECT probability FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team1, team2, scenario_id)
            ).fetchone()
        else:
            # Ad-hoc: scenario_id IS NULL
            row = conn.execute(
                "SELECT probability FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team1, team2)
            ).fetchone()

        if not row:
            return False

        probability = row["probability"]

        # Remove from scenario/ad-hoc
        if scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team1, team2, scenario_id)
            )
        else:
            conn.execute(
                "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team1, team2)
            )

        # Add as permanent (replace if exists)
        conn.execute(
            "DELETE FROM whatif_game_outcomes WHERE team1 = ? AND team2 = ? AND is_permanent = TRUE",
            (team1, team2)
        )
        conn.execute(
            "INSERT INTO whatif_game_outcomes (team1, team2, probability, is_permanent, scenario_id) VALUES (?, ?, ?, TRUE, NULL)",
            (team1, team2, probability)
        )
        conn.commit()
        return True


def promote_rating_adjustment_to_permanent(team: str, scenario_id: Optional[int]) -> bool:
    """Move a rating adjustment from a scenario (or ad-hoc) to permanent. Returns True if promoted."""
    with get_connection() as conn:
        # Get the current value
        if scenario_id is not None:
            row = conn.execute(
                "SELECT adjustment FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team, scenario_id)
            ).fetchone()
        else:
            # Ad-hoc: scenario_id IS NULL
            row = conn.execute(
                "SELECT adjustment FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team,)
            ).fetchone()

        if not row:
            return False

        adjustment = row["adjustment"]

        # Remove from scenario/ad-hoc
        if scenario_id is not None:
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id = ?",
                (team, scenario_id)
            )
        else:
            conn.execute(
                "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = FALSE AND scenario_id IS NULL",
                (team,)
            )

        # Add as permanent (replace if exists)
        conn.execute(
            "DELETE FROM whatif_rating_adjustments WHERE team = ? AND is_permanent = TRUE",
            (team,)
        )
        conn.execute(
            "INSERT INTO whatif_rating_adjustments (team, adjustment, is_permanent, scenario_id) VALUES (?, ?, TRUE, NULL)",
            (team, adjustment)
        )
        conn.commit()
        return True


# Initialize on import
init_db()
