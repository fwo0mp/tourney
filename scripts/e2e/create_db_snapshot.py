#!/usr/bin/env python3
"""Create the canonical SQLite snapshot used by Playwright E2E tests."""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DB = ROOT / "tourney.db"
DEFAULT_OUTPUT_DB = ROOT / "web" / "e2e" / "snapshots" / "base.sqlite3"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def reset_mutable_state(db_path: Path) -> None:
    """Reset tables that tests mutate so all tests start from the same state."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("DELETE FROM completed_games")
        conn.execute("DELETE FROM scenarios")
        conn.execute("DELETE FROM whatif_game_outcomes")
        conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.execute("DELETE FROM active_scenario")
        conn.execute("INSERT INTO active_scenario (id, scenario_id) VALUES (1, NULL)")
        conn.execute(
            "DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?, ?)",
            (
                "completed_games",
                "scenarios",
                "whatif_game_outcomes",
                "whatif_rating_adjustments",
            ),
        )
        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        conn.execute("VACUUM")
    finally:
        conn.close()


def create_empty_database(db_path: Path) -> None:
    """Create a brand-new DB using the production schema."""
    os.environ["TOURNEY_DB_PATH"] = str(db_path)
    from api import database as db  # Imported after env var override on purpose.

    db.init_db()


def build_snapshot(source_db: Path, output_db: Path) -> None:
    output_db.parent.mkdir(parents=True, exist_ok=True)

    if source_db.exists():
        if source_db.resolve() == output_db.resolve():
            raise ValueError("source and output database paths must be different")
        shutil.copy2(source_db, output_db)
    else:
        if output_db.exists():
            output_db.unlink()
        create_empty_database(output_db)

    reset_mutable_state(output_db)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create E2E SQLite base snapshot.")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_DB,
        help=f"Source DB path (default: {DEFAULT_SOURCE_DB})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DB,
        help=f"Output snapshot path (default: {DEFAULT_OUTPUT_DB})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_db = args.source.expanduser().resolve()
    output_db = args.output.expanduser().resolve()

    build_snapshot(source_db, output_db)
    if source_db.exists():
        print(f"Created E2E snapshot from source DB: {output_db}")
    else:
        print(f"Created E2E snapshot from schema-only DB: {output_db}")


if __name__ == "__main__":
    main()
