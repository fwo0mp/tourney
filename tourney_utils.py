"""
Tournament utilities using Rust backend for high-performance calculations.

This module provides the same API as the original Python implementation
but uses Rust for the core calculations (85-318x faster).

For the original Python reference implementation, see tourney_utils_reference.py.
"""

import csv
from decimal import Decimal

from tourney_core import (
    Team as _RustTeam,
    OverridesMap as _RustOverridesMap,
    TournamentState as _RustTournamentState,
    py_calculate_win_prob as _rust_calculate_win_prob,
    py_game_transform_prob as _rust_game_transform_prob,
    AVG_SCORING,
    AVG_TEMPO,
    SCORING_STDDEV,
    ROUND_POINTS,
    CALCUTTA_POINTS,
)

from team_names import EQUIVALENCE_CLASSES, resolve_name

# Compatibility: track overrides used (approximation - Rust doesn't track this)
overrides_used = 0
total_overrides = 0

# Re-export Rust classes directly
Team = _RustTeam
OverridesMap = _RustOverridesMap

# Pre-compute equivalence class lists for passing to Rust
_EQUIV_LISTS = [list(ec) for ec in EQUIVALENCE_CLASSES]


def TournamentState(bracket, ratings, scoring, overrides=None, forfeit_prob=0.0):
    """Create a TournamentState with equivalence classes auto-injected."""
    return _RustTournamentState(
        bracket, ratings, scoring, overrides, forfeit_prob,
        equivalence_classes=_EQUIV_LISTS,
    )


def calculate_win_prob(team1, team2, overrides=None, forfeit_prob=0.0):
    """Calculate win probability for team1 vs team2."""
    return _rust_calculate_win_prob(team1, team2, overrides, forfeit_prob)


def game_transform_prob(child1, child2, teams, overrides=None, forfeit_prob=0.0):
    """Probabilistic game transformation."""
    return _rust_game_transform_prob(child1, child2, teams, overrides, forfeit_prob)


def read_adjustments_file(in_file):
    """
    Read adjustments from file object or path.

    Supports both file objects (for compatibility) and file paths.
    Returns dict mapping team names to adjustment values.
    """
    if isinstance(in_file, str):
        with open(in_file) as f:
            lines = f.readlines()
    else:
        lines = in_file.readlines()

    adjustments = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 2:
            continue
        name = parts[0]
        adj_str = parts[1].lstrip("+")
        adjustments[name] = float(adj_str)
    return adjustments


def read_ratings_file(in_file, adjustments=None):
    """
    Read ratings from file object or path.

    Supports both file objects (for compatibility) and file paths.
    Returns dict mapping team names to Team objects.
    """
    if isinstance(in_file, str):
        with open(in_file) as f:
            lines = f.readlines()
    else:
        lines = in_file.readlines()

    ratings = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) < 4:
            continue
        name = parts[0]
        offense = float(parts[1])
        defense = float(parts[2])
        tempo = float(parts[3])

        if adjustments and name in adjustments:
            offense += adjustments[name]
            defense -= adjustments[name]

        ratings[name] = Team(name, offense, defense, tempo, adjust=True)
    return ratings


def read_overrides_file(overrides_map, filepath):
    """Read overrides from a CSV file into an OverridesMap.

    Format: team1,team2,probability
    """
    with open(filepath, "rt") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or len(row) != 3:
                continue
            name1, name2 = row[0].strip(), row[1].strip()
            prob = float(row[2].strip())
            overrides_map.add_override(name1, name2, prob)


def read_games_from_file(filepath, ratings, overrides=None):
    """Read bracket games from file.

    Uses team name equivalence classes to resolve bracket names
    against the ratings dictionary.
    """
    games = []
    with open(filepath, "rt") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            if len(row) == 1:
                name = row[0].strip()
                games.append({name: 1.0})
            elif len(row) == 2:
                name1, name2 = row[0].strip(), row[1].strip()
                key1 = resolve_name(name1, ratings)
                key2 = resolve_name(name2, ratings)
                team1 = ratings[key1]
                team2 = ratings[key2]
                win_prob = calculate_win_prob(team1, team2, overrides, 0.0)
                games.append({name1: win_prob, name2: 1.0 - win_prob})

    if not games or (len(games) & (len(games) - 1)):
        raise ValueError("Bracket must have a power-of-2 number of teams")
    return games


def get_bracket_teams(bracket):
    """Generator yielding all teams in the bracket."""
    for game in bracket:
        for team in game:
            yield team


# Verification support
def verify_calculate_win_prob(team1, team2, overrides=None, forfeit_prob=0.0, tolerance=1e-9):
    """
    Calculate win probability and verify against reference implementation.

    Returns (result, is_equivalent, reference_result, difference)
    """
    import tourney_utils_reference as ref

    # Create reference Team objects
    ref_team1 = ref.Team(team1.name, Decimal(str(team1.offense)),
                         Decimal(str(team1.defense)), Decimal(str(team1.tempo)))
    ref_team2 = ref.Team(team2.name, Decimal(str(team2.offense)),
                         Decimal(str(team2.defense)), Decimal(str(team2.tempo)))

    # Create reference OverridesMap if needed
    ref_overrides = None
    if overrides is not None:
        ref_overrides = ref.OverridesMap()
        # Note: We can't easily copy overrides, so verification with overrides is limited

    rust_result = calculate_win_prob(team1, team2, overrides, forfeit_prob)
    ref_result = float(ref.calculate_win_prob(ref_team1, ref_team2, ref_overrides, forfeit_prob))

    diff = abs(rust_result - ref_result)
    is_equivalent = diff < tolerance

    return rust_result, is_equivalent, ref_result, diff


def verify_tournament_scores(state, tolerance=1e-6):
    """
    Calculate tournament scores and verify against reference implementation.

    Returns (result, is_equivalent, max_difference, differences_by_team)
    """
    import tourney_utils_reference as ref

    # Create reference ratings
    ref_ratings = {}
    for name, team in state.ratings.items():
        ref_ratings[name] = ref.Team(name, Decimal(str(team.offense)),
                                     Decimal(str(team.defense)), Decimal(str(team.tempo)))

    # Create reference bracket
    ref_bracket = []
    for game in state.bracket:
        ref_game = {name: Decimal(str(prob)) for name, prob in game.items()}
        ref_bracket.append(ref_game)

    # Create reference scoring
    ref_scoring = [Decimal(str(s)) for s in state.scoring]

    # Create reference state
    ref_state = ref.TournamentState(ref_bracket, ref_ratings, ref_scoring,
                                     forfeit_prob=state.forfeit_prob)

    # Calculate scores
    rust_scores = state.calculate_scores_prob()
    ref_scores = ref_state.calculate_scores_prob()

    # Compare
    differences = {}
    max_diff = 0.0
    for team in rust_scores:
        rust_val = rust_scores[team]
        ref_val = float(ref_scores.get(team, Decimal(0)))
        diff = abs(rust_val - ref_val)
        differences[team] = diff
        max_diff = max(max_diff, diff)

    is_equivalent = max_diff < tolerance

    return rust_scores, is_equivalent, max_diff, differences


__all__ = [
    'Team',
    'OverridesMap',
    'TournamentState',
    'calculate_win_prob',
    'game_transform_prob',
    'read_ratings_file',
    'read_adjustments_file',
    'read_overrides_file',
    'read_games_from_file',
    'get_bracket_teams',
    'AVG_SCORING',
    'AVG_TEMPO',
    'SCORING_STDDEV',
    'ROUND_POINTS',
    'CALCUTTA_POINTS',
    'overrides_used',
    'total_overrides',
    'verify_calculate_win_prob',
    'verify_tournament_scores',
]
