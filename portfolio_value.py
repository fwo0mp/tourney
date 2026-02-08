"""
Portfolio value calculations using Rust backend for high-performance.

This module provides the same API as the original Python implementation
but uses Rust for the core calculations (parallelized, much faster).

For the original Python reference implementation, see portfolio_value_reference.py.
"""

from collections import namedtuple
from decimal import Decimal
import pickle

from tourney_core import (
    PortfolioState as _RustPortfolioState,
    TeamDelta as _RustTeamDelta,
    get_portfolio_value as _rust_get_portfolio_value,
    game_delta as _rust_game_delta,
    get_team_delta as _rust_get_team_delta,
    get_team_portfolio_delta as _rust_get_team_portfolio_delta,
    get_team_pairwise_deltas as _rust_get_team_pairwise_deltas,
    get_all_team_deltas as _rust_get_all_team_deltas,
)

import tourney_utils as tourney
from team_names import try_resolve_name


# Re-export Rust TeamDelta
TeamDelta = _RustTeamDelta


class PortfolioState:
    """
    Portfolio state with precomputed deltas.

    Wrapper around Rust PortfolioState that adds pickle support
    and compatibility with the original Python API.
    """

    def __init__(self, tournament, positions, point_delta=1.0):
        # Convert Decimal to float if needed
        if isinstance(point_delta, Decimal):
            point_delta = float(point_delta)

        # Convert positions values to float if needed
        float_positions = {}
        for k, v in positions.items():
            if isinstance(v, Decimal):
                float_positions[k] = float(v)
            else:
                float_positions[k] = v

        self.tournament = tournament
        self.positions = float_positions
        self.point_delta = point_delta
        self.team_deltas = {}
        self.pairwise_deltas = {}

    def compute_deltas(self, teams=None):
        """Compute deltas for specified teams or all teams."""
        if teams:
            for team in teams:
                self.team_deltas[team] = get_team_portfolio_delta(
                    self.positions, self.tournament, team, point_delta=self.point_delta
                )
                self.pairwise_deltas[team] = get_team_pairwise_deltas(
                    self.tournament, team, point_delta=self.point_delta
                )
        else:
            self.team_deltas, self.pairwise_deltas = get_all_team_deltas(
                self.positions, self.tournament, point_delta=self.point_delta
            )

    def store_deltas(self, path):
        """Store computed deltas to file."""
        with open(path, "wb") as outfile:
            pickle.dump((self.team_deltas, self.pairwise_deltas), outfile)

    def load_deltas(self, path):
        """Load precomputed deltas from file."""
        with open(path, "rb") as infile:
            self.team_deltas, self.pairwise_deltas = pickle.load(infile)


def read_values(values_file):
    """Read team values from CSV file."""
    values = {}
    for line in values_file.readlines():
        team, value = tuple(line.strip().split(","))
        values[team] = Decimal(value)
    return values


def get_portfolio_value(positions, values):
    """
    Calculate total portfolio value.

    Handles CIX name conversions and special 'points' entry.
    """
    # Convert to float dict for Rust
    float_values = {}
    for k, v in values.items():
        if isinstance(v, Decimal):
            float_values[k] = float(v)
        else:
            float_values[k] = v

    # Handle 'points' separately (not a team)
    total_value = 0.0
    float_positions = {}

    for team, count in positions.items():
        if not count:
            continue
        if team == "points":
            total_value += float(count) if isinstance(count, Decimal) else count
        else:
            # Apply name conversion
            team_name = try_resolve_name(team, float_values)
            if isinstance(count, Decimal):
                float_positions[team_name] = float(count)
            else:
                float_positions[team_name] = count

    # Use Rust implementation for the main calculation
    total_value += _rust_get_portfolio_value(float_positions, float_values)

    return total_value


def game_delta(positions, tournament, team1, team2):
    """
    Calculate portfolio impact of a game outcome.

    Returns (win_value, loss_value, team_deltas).
    """
    # Convert positions to float
    float_positions = {}
    for k, v in positions.items():
        if isinstance(v, Decimal):
            float_positions[k] = float(v)
        else:
            float_positions[k] = v

    win_value, loss_value, rust_deltas = _rust_game_delta(
        float_positions, tournament, team1, team2
    )

    # Convert to named tuples with reverse name lookups for positions
    team_deltas = []
    for delta in rust_deltas:
        position = positions.get(try_resolve_name(delta.team, positions), 0)
        if isinstance(position, Decimal):
            position = float(position)
        team_deltas.append(
            _RustTeamDelta(delta.team, position, delta.delta_per_share)
        )

    return win_value, loss_value, team_deltas


def get_team_delta(tournament, team, point_delta=1.0):
    """
    Calculate impact of team rating change on tournament scores.

    Returns (positive_scores, negative_scores).
    """
    if isinstance(point_delta, Decimal):
        point_delta = float(point_delta)
    return _rust_get_team_delta(tournament, team, point_delta)


def calculate_team_portfolio_delta(positions, positive_values, negative_values):
    """Calculate portfolio delta from positive/negative score scenarios."""
    positive_value = get_portfolio_value(positions, positive_values)
    negative_value = get_portfolio_value(positions, negative_values)
    return positive_value - negative_value


def get_team_portfolio_delta(positions, tournament, team, point_delta=1.0):
    """Get portfolio delta for a team's rating change."""
    # Convert to float dict
    float_positions = {}
    for k, v in positions.items():
        if isinstance(v, Decimal):
            float_positions[k] = float(v)
        else:
            float_positions[k] = v

    if isinstance(point_delta, Decimal):
        point_delta = float(point_delta)

    return _rust_get_team_portfolio_delta(float_positions, tournament, team, point_delta)


def calculate_team_pairwise_deltas(positive_values, negative_values):
    """Calculate pairwise deltas from positive/negative score scenarios."""
    team_deltas = {}
    for team, positive_value in positive_values.items():
        negative_value = negative_values[team]
        share_delta = positive_value - negative_value
        team_deltas[team] = share_delta
    return team_deltas


def get_team_pairwise_deltas(tournament, team, point_delta=1.0):
    """Get pairwise deltas for a team's rating change."""
    if isinstance(point_delta, Decimal):
        point_delta = float(point_delta)
    return _rust_get_team_pairwise_deltas(tournament, team, point_delta)


def get_all_team_deltas(positions, tournament, point_delta=1.0):
    """
    Calculate deltas for all teams in the bracket.

    Uses Rust parallelization for performance.
    Returns (team_deltas, pairwise_deltas).
    """
    # Convert to float dict
    float_positions = {}
    for k, v in positions.items():
        if isinstance(v, Decimal):
            float_positions[k] = float(v)
        else:
            float_positions[k] = v

    if isinstance(point_delta, Decimal):
        point_delta = float(point_delta)

    return _rust_get_all_team_deltas(float_positions, tournament, point_delta)


# Verification support
def verify_get_all_team_deltas(positions, tournament, point_delta=1.0, tolerance=1e-6):
    """
    Calculate all team deltas and verify against reference implementation.

    Returns (result, is_equivalent, max_difference).
    """
    import portfolio_value_reference as ref

    # Run Rust implementation
    rust_team_deltas, rust_pairwise_deltas = get_all_team_deltas(
        positions, tournament, point_delta
    )

    # Convert tournament for reference implementation
    ref_ratings = {}
    for name, team in tournament.ratings.items():
        ref_ratings[name] = ref.tourney.Team(
            name,
            Decimal(str(team.offense)),
            Decimal(str(team.defense)),
            Decimal(str(team.tempo)),
        )

    ref_bracket = []
    for game in tournament.bracket:
        ref_game = {name: Decimal(str(prob)) for name, prob in game.items()}
        ref_bracket.append(ref_game)

    ref_scoring = [Decimal(str(s)) for s in tournament.scoring]

    ref_tournament = ref.tourney.TournamentState(
        ref_bracket, ref_ratings, ref_scoring, forfeit_prob=tournament.forfeit_prob
    )

    # Convert positions
    ref_positions = {}
    for k, v in positions.items():
        ref_positions[k] = Decimal(str(v)) if not isinstance(v, Decimal) else v

    # Run reference implementation
    ref_team_deltas, ref_pairwise_deltas = ref.get_all_team_deltas(
        ref_positions, ref_tournament, Decimal(str(point_delta))
    )

    # Compare
    max_diff = 0.0
    for team in rust_team_deltas:
        rust_val = rust_team_deltas[team]
        ref_val = float(ref_team_deltas.get(team, Decimal(0)))
        diff = abs(rust_val - ref_val)
        max_diff = max(max_diff, diff)

    is_equivalent = max_diff < tolerance

    return (rust_team_deltas, rust_pairwise_deltas), is_equivalent, max_diff


__all__ = [
    "PortfolioState",
    "TeamDelta",
    "read_values",
    "get_portfolio_value",
    "game_delta",
    "get_team_delta",
    "calculate_team_portfolio_delta",
    "get_team_portfolio_delta",
    "calculate_team_pairwise_deltas",
    "get_team_pairwise_deltas",
    "get_all_team_deltas",
    "verify_get_all_team_deltas",
]
