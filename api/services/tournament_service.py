"""Tournament service for managing tournament state and calculations."""

import os
from pathlib import Path
from typing import Optional

import tourney_utils as tourney


class TournamentService:
    """Service for tournament calculations with caching."""

    _instance: Optional["TournamentService"] = None

    def __init__(self):
        self.state: Optional[tourney.TournamentState] = None
        self.ratings: dict = {}
        self.scores: dict = {}
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

        # Calculate expected scores
        self.scores = self.state.calculate_scores_prob()

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
