"""Portfolio service for positions and delta calculations."""

import os
from typing import Optional

import portfolio_value as pv
from api.services.tournament_service import TournamentService, get_tournament_service


# Mock positions for development/demo mode
# Uses team names as they appear in bracket.txt/ratings.txt
MOCK_POSITIONS = {
    "Duke": 15.0,
    "North Carolina": -8.0,
    "Kansas": 12.0,
    "Kentucky": 5.0,
    "Gonzaga": -10.0,
    "Arizona": 7.0,
    "Purdue": 20.0,
    "Houston": -5.0,
    "Connecticut": 18.0,
    "Tennessee": 3.0,
    "Auburn": -12.0,
    "Iowa St.": 8.0,
    "Marquette": -6.0,
    "Creighton": 4.0,
    "Baylor": 10.0,
    "Illinois": -3.0,
    "Wisconsin": 6.0,
    "Alabama": -15.0,
    "Michigan St.": 9.0,
    "Texas": 2.0,
}


class PortfolioService:
    """Service for portfolio calculations."""

    _instance: Optional["PortfolioService"] = None

    def __init__(self):
        self._positions: dict = {}
        self._cix_client = None
        self._use_mock = os.getenv("USE_MOCK_DATA", "").lower() in ("true", "1", "yes")

    @classmethod
    def get_instance(cls) -> "PortfolioService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = PortfolioService()
        return cls._instance

    def _get_cix_client(self):
        """Get or create CIX client."""
        if self._cix_client is None and not self._use_mock:
            apid = os.getenv("CIX_APID")
            if apid:
                try:
                    import cix_client
                    self._cix_client = cix_client.CixClient(apid)
                except ImportError:
                    pass  # cix_client not available
        return self._cix_client

    def get_positions(self) -> tuple[dict, bool]:
        """Get current positions. Returns (positions, is_mock)."""
        if self._use_mock:
            return MOCK_POSITIONS.copy(), True

        client = self._get_cix_client()
        if client:
            try:
                positions = client.my_positions(full_names=True)
                # Convert Decimal to float if needed
                return {k: float(v) for k, v in positions.items()}, False
            except Exception:
                pass

        # Fallback to mock if CIX unavailable
        return MOCK_POSITIONS.copy(), True

    def get_portfolio_value(self, positions: dict = None) -> float:
        """Calculate current portfolio expected value."""
        if positions is None:
            positions, _ = self.get_positions()

        tournament = get_tournament_service()
        scores = tournament.get_scores()
        return pv.get_portfolio_value(positions, scores)

    def get_portfolio_distribution(
        self, n_simulations: int = 10000, seed: int = 42, n_bins: int = 50
    ) -> dict:
        """Calculate portfolio value distribution via Monte Carlo."""
        positions, _ = self.get_positions()
        tournament = get_tournament_service()
        state = tournament.get_state()

        # Filter positions to only include teams in the bracket
        bracket_teams = set(state.get_bracket_teams())
        filtered_positions = {
            k: v for k, v in positions.items()
            if k in bracket_teams or k == "points"
        }

        # Run simulations
        sim_results = state.run_simulations(n_simulations, seed)

        # Calculate portfolio value for each simulation
        values = []
        for sim_scores in sim_results:
            value = pv.get_portfolio_value(filtered_positions, sim_scores)
            values.append(value)

        values.sort()
        n = len(values)

        def percentile(p: float) -> float:
            idx = int(p * n / 100)
            return values[min(idx, n - 1)]

        # Build histogram
        min_val = values[0]
        max_val = values[-1]
        bin_width = (max_val - min_val) / n_bins if max_val > min_val else 1
        histogram = []
        for i in range(n_bins):
            bin_start = min_val + i * bin_width
            bin_end = min_val + (i + 1) * bin_width
            count = sum(1 for v in values if bin_start <= v < bin_end)
            # Include max value in last bin
            if i == n_bins - 1:
                count += sum(1 for v in values if v == max_val)
            histogram.append({
                "bin_start": bin_start,
                "bin_end": bin_end,
                "count": count,
            })

        return {
            "expected_value": self.get_portfolio_value(filtered_positions),
            "min_value": min_val,
            "max_value": max_val,
            "p1": percentile(1),
            "p5": percentile(5),
            "p10": percentile(10),
            "p25": percentile(25),
            "p50": percentile(50),
            "p75": percentile(75),
            "p90": percentile(90),
            "p95": percentile(95),
            "p99": percentile(99),
            "histogram": histogram,
        }

    def get_all_deltas(self, point_delta: float = 1.0) -> tuple[dict, dict]:
        """Get portfolio deltas for all teams."""
        positions, _ = self.get_positions()
        tournament = get_tournament_service()
        state = tournament.get_state()

        team_deltas, pairwise_deltas = pv.get_all_team_deltas(
            positions, state, point_delta
        )
        return team_deltas, pairwise_deltas

    def get_game_delta(self, team1: str, team2: str) -> dict:
        """Get portfolio impact for a specific game."""
        positions, _ = self.get_positions()
        tournament = get_tournament_service()
        state = tournament.get_state()

        # Get current expected portfolio value
        current_scores = state.calculate_scores_prob()
        current_value = pv.get_portfolio_value(positions, current_scores)

        # Get portfolio values for each outcome
        win_value, loss_value, team_impacts = pv.game_delta(
            positions, state, team1, team2
        )

        # Calculate deltas from current expected value
        win_delta = win_value - current_value
        loss_delta = loss_value - current_value

        win_prob = tournament.calculate_win_prob(team1, team2)

        return {
            "team1": team1,
            "team2": team2,
            "win_prob": win_prob,
            "if_team1_wins": win_delta,
            "if_team2_wins": loss_delta,
            "swing": abs(win_delta - loss_delta),
            "team_impacts": [
                {
                    "team": td.team,
                    "position": td.position,
                    "delta_per_share": td.delta_per_share,
                    "total_delta": td.total_delta,
                }
                for td in team_impacts
            ],
        }

    def get_upcoming_games_impact(self, top_n: int = 10) -> list[dict]:
        """Get games with biggest portfolio impact."""
        positions, _ = self.get_positions()
        tournament = get_tournament_service()
        state = tournament.get_state()
        bracket = state.bracket

        # Get all first-round matchups
        games = []
        for i in range(0, len(bracket), 2):
            if i + 1 < len(bracket):
                game1 = bracket[i]
                game2 = bracket[i + 1]

                # Get team names from each game
                teams1 = list(game1.keys())
                teams2 = list(game2.keys())

                if teams1 and teams2:
                    # This is a matchup between winners of game1 and game2
                    # For simplicity, take the favorite from each
                    team1 = max(teams1, key=lambda t: game1.get(t, 0))
                    team2 = max(teams2, key=lambda t: game2.get(t, 0))

                    try:
                        delta_info = self.get_game_delta(team1, team2)
                        games.append(delta_info)
                    except Exception:
                        continue

        # Sort by swing (absolute impact)
        games.sort(key=lambda g: g["swing"], reverse=True)
        return games[:top_n]


def get_portfolio_service() -> PortfolioService:
    """Dependency injection for portfolio service."""
    return PortfolioService.get_instance()


def get_slot_candidates_with_deltas(
    portfolio_service: PortfolioService,
    state,
    target_round: int,
    target_position: int,
) -> list[dict]:
    """Get all teams that can reach a slot with their probabilities and portfolio deltas.

    Args:
        portfolio_service: The portfolio service instance
        state: The tournament state (possibly with what-if modifications applied)
        target_round: The round number (0 = first round, 1 = second round, etc.)
        target_position: The position within the round

    Returns a list of dicts with keys: team, probability, portfolio_delta
    """
    from api.services.tournament_service import (
        get_slot_teams,
        compute_path_to_slot,
        apply_what_if,
    )

    positions, _ = portfolio_service.get_positions()

    # Get current portfolio value
    current_scores = state.calculate_scores_prob()
    current_value = pv.get_portfolio_value(positions, current_scores)

    # Get teams that can reach this slot
    slot_teams = get_slot_teams(state, target_round, target_position)

    candidates = []
    for team, probability in slot_teams.items():
        if probability < 0.001:  # Skip negligible probabilities
            continue

        # Compute path for this team to reach the slot
        path = compute_path_to_slot(state, team, target_round, target_position)

        if path:
            # Apply overrides and compute new value
            game_outcomes = [{"winner": w, "loser": l} for w, l in path]
            modified_state = apply_what_if(state, game_outcomes=game_outcomes)
            modified_scores = modified_state.calculate_scores_prob()
            modified_value = pv.get_portfolio_value(positions, modified_scores)
            portfolio_delta = modified_value - current_value
        else:
            portfolio_delta = 0.0

        candidates.append({
            "team": team,
            "probability": probability,
            "portfolio_delta": portfolio_delta,
        })

    # Sort by probability descending
    candidates.sort(key=lambda c: c["probability"], reverse=True)
    return candidates
