"""Tournament service for managing tournament state and calculations."""

import os
from pathlib import Path
from typing import Optional

import tourney_utils as tourney

from api import database as db


class TournamentService:
    """Service for tournament calculations with caching."""

    _instance: Optional["TournamentService"] = None

    def __init__(self):
        self.state: Optional[tourney.TournamentState] = None
        self.ratings: dict = {}
        self.scores: dict = {}
        self.completed_games: list[tuple[str, str]] = []
        self._bracket_file = "bracket.txt"
        self._ratings_file = "ratings.txt"
        self._adjustments_file = "adjustments.txt"
        self._overrides_file = "overrides.txt"

    @classmethod
    def get_instance(cls) -> "TournamentService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = TournamentService()
        return cls._instance

    def load(self, bracket_file: str = None, ratings_file: str = None):
        """Load tournament state from files."""
        bracket_path = bracket_file or self._bracket_file
        ratings_path = ratings_file or self._ratings_file

        # Check files exist
        if not Path(bracket_path).exists():
            raise FileNotFoundError(f"Bracket file not found: {bracket_path}")
        if not Path(ratings_path).exists():
            raise FileNotFoundError(f"Ratings file not found: {ratings_path}")

        # Load adjustments if available
        adjustments = None
        if Path(self._adjustments_file).exists():
            adjustments = tourney.read_adjustments_file(self._adjustments_file)

        # Load ratings
        self.ratings = tourney.read_ratings_file(ratings_path, adjustments)

        # Load overrides
        overrides = tourney.OverridesMap()
        if Path(self._overrides_file).exists():
            overrides.read_from_file(self._overrides_file)

        # Load bracket
        games = tourney.read_games_from_file(bracket_path, self.ratings, overrides)

        # Create tournament state
        self.state = tourney.TournamentState(
            bracket=games,
            ratings=self.ratings,
            scoring=list(tourney.ROUND_POINTS),
            overrides=overrides,
            forfeit_prob=0.0,
        )

        # Load and apply completed games
        self.completed_games = self.load_completed_games()
        for winner, loser in self.completed_games:
            self.state = self.state.with_override(winner, loser, 1.0)

        # Calculate expected scores
        self.scores = self.state.calculate_scores_prob()

    def load_completed_games(self) -> list[tuple[str, str]]:
        """Load completed games from database."""
        return db.get_completed_games()

    def get_eliminated_teams(self) -> set[str]:
        """Get set of teams that have been eliminated."""
        return {loser for _, loser in self.completed_games}

    def ensure_loaded(self):
        """Ensure tournament state is loaded."""
        if self.state is None:
            self.load()

    def get_state(self) -> tourney.TournamentState:
        """Get tournament state, loading if necessary."""
        self.ensure_loaded()
        return self.state

    def get_scores(self) -> dict:
        """Get expected scores for all teams."""
        self.ensure_loaded()
        return self.scores

    def get_team_info(self, team_name: str) -> dict:
        """Get detailed info for a single team."""
        self.ensure_loaded()
        if team_name not in self.ratings:
            raise KeyError(f"Team not found: {team_name}")

        team = self.ratings[team_name]
        return {
            "name": team.name,
            "offense": team.offense,
            "defense": team.defense,
            "tempo": team.tempo,
            "expected_score": self.scores.get(team_name, 0.0),
        }

    def get_all_teams(self) -> list[dict]:
        """Get info for all teams in the tournament."""
        self.ensure_loaded()
        teams = []
        for team_name in self.state.get_bracket_teams():
            team = self.ratings.get(team_name)
            if team:
                teams.append({
                    "name": team.name,
                    "offense": team.offense,
                    "defense": team.defense,
                    "tempo": team.tempo,
                    "expected_score": self.scores.get(team_name, 0.0),
                })
        return teams

    def get_bracket_structure(self) -> dict:
        """Get bracket structure for visualization."""
        self.ensure_loaded()
        bracket = self.state.bracket
        num_teams = len(bracket)

        # Determine number of rounds
        import math
        num_rounds = int(math.log2(num_teams))

        games = []
        for i, game in enumerate(bracket):
            # Determine region based on position (for 64 teams)
            if num_teams == 64:
                if i < 16:
                    region = "South"
                elif i < 32:
                    region = "East"
                elif i < 48:
                    region = "Midwest"
                else:
                    region = "West"
            else:
                region = None

            games.append({
                "id": f"game_{i}",
                "round": 0,  # Initial round
                "region": region,
                "teams": game,
            })

        return {
            "games": games,
            "num_teams": num_teams,
            "num_rounds": num_rounds,
        }

    def calculate_win_prob(self, team1_name: str, team2_name: str) -> float:
        """Calculate win probability for a matchup."""
        self.ensure_loaded()
        team1 = self.ratings.get(team1_name)
        team2 = self.ratings.get(team2_name)

        if not team1:
            raise KeyError(f"Team not found: {team1_name}")
        if not team2:
            raise KeyError(f"Team not found: {team2_name}")

        return tourney.calculate_win_prob(
            team1, team2, self.state.overrides, self.state.forfeit_prob
        )

    def run_simulations(self, n_simulations: int = 10000, seed: int = None) -> list[dict]:
        """Run Monte Carlo simulations."""
        self.ensure_loaded()
        return self.state.run_simulations(n_simulations, seed)

    def with_override(self, team1: str, team2: str, prob: float) -> tourney.TournamentState:
        """Create modified state with game outcome override."""
        self.ensure_loaded()
        return self.state.with_override(team1, team2, prob)

    def with_team_adjustment(self, team: str, delta: float) -> tourney.TournamentState:
        """Create modified state with rating adjustment."""
        self.ensure_loaded()
        return self.state.with_team_adjustment(team, delta)


def get_tournament_service() -> TournamentService:
    """Dependency injection for tournament service."""
    return TournamentService.get_instance()


def apply_what_if(
    state: tourney.TournamentState,
    game_outcomes: list = None,
    rating_adjustments: dict = None,
    completed_games: list[tuple[str, str]] = None,
) -> tourney.TournamentState:
    """Apply what-if modifications to a tournament state.

    Respects completed games: if a team has already been eliminated,
    what-if outcomes that have them winning are silently ignored.
    """
    modified_state = state

    # Build set of eliminated teams (losers of completed games)
    eliminated = set()
    if completed_games:
        eliminated = {loser for _, loser in completed_games}

    if game_outcomes:
        for outcome in game_outcomes:
            winner = outcome.get("winner") or outcome.winner
            loser = outcome.get("loser") or outcome.loser

            # Skip if winner is already eliminated
            if winner in eliminated:
                continue

            modified_state = modified_state.with_override(winner, loser, 1.0)

    if rating_adjustments:
        for team_name, delta in rating_adjustments.items():
            modified_state = modified_state.with_team_adjustment(team_name, delta)

    return modified_state


def compute_bracket_rounds(state: tourney.TournamentState) -> list[list[dict]]:
    """Compute all rounds of the bracket with team probabilities.

    Returns a list of rounds, where each round is a list of slots.
    Each slot is a dict of team -> probability.
    """
    bracket = state.bracket  # Round 0 games
    rounds = [list(bracket)]  # Start with round 0

    current_round = list(bracket)
    while len(current_round) > 1:
        next_round = []
        # Pair up games and compute winners
        for i in range(0, len(current_round), 2):
            game1 = current_round[i]
            game2 = current_round[i + 1]

            # Compute probability each team reaches this slot
            winner_probs = {}
            for team1, prob1 in game1.items():
                for team2, prob2 in game2.items():
                    # Get win probability
                    t1 = state.ratings.get(team1)
                    t2 = state.ratings.get(team2)
                    if t1 and t2:
                        win_prob = tourney.calculate_win_prob(
                            t1, t2, state.overrides, state.forfeit_prob
                        )
                        # Probability team1 reaches and wins
                        p1_wins = prob1 * prob2 * win_prob
                        # Probability team2 reaches and wins
                        p2_wins = prob1 * prob2 * (1 - win_prob)

                        winner_probs[team1] = winner_probs.get(team1, 0) + p1_wins
                        winner_probs[team2] = winner_probs.get(team2, 0) + p2_wins

            next_round.append(winner_probs)

        rounds.append(next_round)
        current_round = next_round

    return rounds


def get_slot_teams(state: tourney.TournamentState, target_round: int, position: int) -> dict:
    """Get teams that can reach a specific slot with their probabilities."""
    rounds = compute_bracket_rounds(state)

    if target_round >= len(rounds):
        return {}

    round_slots = rounds[target_round]
    if position >= len(round_slots):
        return {}

    return round_slots[position]


def compute_path_to_slot_with_rounds(
    state: tourney.TournamentState,
    rounds: list[list[dict]],
    team: str,
    target_round: int,
    target_position: int,
) -> list[tuple[str, str]]:
    """Compute the game outcomes (winner, loser) needed for team to reach slot.

    This version accepts precomputed rounds to avoid redundant computation.

    Returns a list of (winner, loser) tuples for all games the team must win.
    The team must beat ALL possible opponents they could face, not just the most likely.
    """
    # Find team's starting position in round 0
    bracket = state.bracket
    start_pos = None
    for i, game in enumerate(bracket):
        if team in game:
            start_pos = i
            break

    if start_pos is None:
        return []  # Team not in bracket

    outcomes = []
    current_pos = start_pos

    for round_num in range(target_round):
        if round_num >= len(rounds):
            break

        round_slots = rounds[round_num]

        # Find the slot in this round where our team could be
        if current_pos >= len(round_slots):
            break

        slot = round_slots[current_pos]
        if team not in slot:
            break  # Team can't reach this point

        # Find the opposing slot
        if current_pos % 2 == 0:
            opponent_pos = current_pos + 1
        else:
            opponent_pos = current_pos - 1

        if opponent_pos >= len(round_slots):
            break

        opponent_slot = round_slots[opponent_pos]

        # The team must beat ALL possible opponents from the opposing slot
        if opponent_slot:
            for opponent in opponent_slot.keys():
                if opponent != team:  # Don't add self as opponent
                    outcomes.append((team, opponent))

        # Update position for next round (positions halve each round)
        current_pos = current_pos // 2

    return outcomes


def compute_path_to_slot(
    state: tourney.TournamentState,
    team: str,
    target_round: int,
    target_position: int,
) -> list[tuple[str, str]]:
    """Compute the game outcomes (winner, loser) needed for team to reach slot.

    Returns a list of (winner, loser) tuples for all games the team must win.
    The team must beat ALL possible opponents they could face, not just the most likely.
    """
    rounds = compute_bracket_rounds(state)
    return compute_path_to_slot_with_rounds(state, rounds, team, target_round, target_position)


