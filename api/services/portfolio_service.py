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

# Mock cash balance for development/demo mode
MOCK_CASH_BALANCE = 2500.0


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
        """Get or create CIX client.

        Raises RuntimeError if CIX_APID is not configured (and not in mock mode).
        """
        if self._cix_client is None and not self._use_mock:
            import cix_client
            apid = os.getenv("CIX_APID")
            if not apid:
                raise RuntimeError(
                    "CIX_APID environment variable is not set. "
                    "Set CIX_APID to connect to CIX, or set USE_MOCK_DATA=true for development."
                )
            self._cix_client = cix_client.CixClient(apid)
        return self._cix_client

    def get_positions(self) -> tuple[dict, bool]:
        """Get current positions. Returns (positions, is_mock).

        Raises if not in mock mode and CIX is unreachable or misconfigured.
        """
        if self._use_mock:
            return MOCK_POSITIONS.copy(), True

        client = self._get_cix_client()
        positions = client.my_positions(full_names=True)
        # Convert Decimal to float if needed
        return {k: float(v) for k, v in positions.items()}, False

    def get_cash_balance(self) -> tuple[float, bool]:
        """Get current cash balance. Returns (cash_balance, is_mock).

        Cash balance has zero delta - it doesn't change with team ratings.
        Raises if not in mock mode and CIX is unreachable or misconfigured.
        """
        if self._use_mock:
            return MOCK_CASH_BALANCE, True

        client = self._get_cix_client()
        portfolio = client.my_portfolio()
        return float(portfolio.cash), False

    def get_portfolio_value(self, positions: dict = None) -> float:
        """Calculate current portfolio expected value."""
        if positions is None:
            positions, _ = self.get_positions()

        tournament = get_tournament_service()
        scores = tournament.get_scores()
        return pv.get_portfolio_value(positions, scores)

    def get_portfolio_distribution(
        self, n_simulations: int = 10000, seed: int = 42, n_bins: int = 50,
        state=None,
    ) -> dict:
        """Calculate portfolio value distribution via Monte Carlo.

        Args:
            n_simulations: Number of Monte Carlo simulations to run
            seed: Random seed for reproducibility
            n_bins: Number of histogram bins
            state: Optional tournament state with what-if modifications applied.
                   If None, uses the base tournament state.
        """
        positions, _ = self.get_positions()
        if state is None:
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

        # Calculate expected value using the (possibly modified) state
        expected_scores = state.calculate_scores_prob()
        expected_value = pv.get_portfolio_value(filtered_positions, expected_scores)

        return {
            "expected_value": expected_value,
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

    def get_all_game_importance(self, state=None) -> dict:
        """Get importance scores for all upcoming determined games.

        A game is "determined" when both teams in the matchup have probability >= 0.9999
        of reaching that slot, but the game outcome itself is not yet decided.
        """
        import tourney_utils as tourney
        from api.services.tournament_service import compute_bracket_rounds

        positions, _ = self.get_positions()
        if state is None:
            tournament = get_tournament_service()
            state = tournament.get_state()

        # Get current EV
        current_scores = state.calculate_scores_prob()
        current_ev = pv.get_portfolio_value(positions, current_scores)

        rounds = compute_bracket_rounds(state)
        num_rounds = len(rounds)

        # Find determined but unresolved games
        games_to_evaluate = []
        for r in range(num_rounds - 1):
            round_slots = rounds[r]
            next_round_slots = rounds[r + 1]
            for j in range(0, len(round_slots), 2):
                if j + 1 >= len(round_slots):
                    break
                slot_a = round_slots[j]
                slot_b = round_slots[j + 1]

                # Check both slots have a single determined team (prob >= 0.9999)
                team1, team2 = None, None
                for t, p in slot_a.items():
                    if p >= 0.9999:
                        team1 = t
                        break
                for t, p in slot_b.items():
                    if p >= 0.9999:
                        team2 = t
                        break

                if not team1 or not team2:
                    continue

                # Check if next round slot is already determined (game already decided)
                next_slot_idx = j // 2
                if next_slot_idx < len(next_round_slots):
                    next_slot = next_round_slots[next_slot_idx]
                    already_decided = any(p >= 0.9999 for p in next_slot.values())
                    if already_decided:
                        continue

                games_to_evaluate.append((team1, team2, r))

        # Also check championship game (last round has 1 slot)
        # The championship is rounds[-1] with 1 slot, fed by rounds[-2] with 2 slots
        # Already handled above since we iterate r from 0 to num_rounds-2

        if not games_to_evaluate:
            return {"games": [], "current_ev": current_ev}

        # Build batch scenarios: for each game, two scenarios (team1 wins, team2 wins)
        scenarios = []
        for team1, team2, r in games_to_evaluate:
            scenarios.append([(team1, team2, 1.0)])  # team1 wins
            scenarios.append([(team1, team2, 0.0)])  # team2 wins

        # Compute all in parallel
        batch_results = state.calculate_scores_prob_batch(scenarios)

        # Process results
        games = []
        for i, (team1, team2, r) in enumerate(games_to_evaluate):
            scores_t1_wins = batch_results[i * 2]
            scores_t2_wins = batch_results[i * 2 + 1]

            ev_t1_wins = pv.get_portfolio_value(positions, scores_t1_wins)
            ev_t2_wins = pv.get_portfolio_value(positions, scores_t2_wins)

            delta_t1 = ev_t1_wins - current_ev
            delta_t2 = ev_t2_wins - current_ev

            raw_importance = abs(delta_t1 - delta_t2)

            # Get win probability
            t1_rating = state.ratings.get(team1)
            t2_rating = state.ratings.get(team2)
            if t1_rating and t2_rating:
                win_prob = tourney.calculate_win_prob(
                    t1_rating, t2_rating, state.overrides, state.forfeit_prob
                )
            else:
                win_prob = 0.5

            # Adjusted importance: weight by probability squared
            adjusted_importance = abs(delta_t1) * win_prob**2 + abs(delta_t2) * (1 - win_prob)**2

            games.append({
                "team1": team1,
                "team2": team2,
                "round": r,
                "win_prob": win_prob,
                "if_team1_wins": delta_t1,
                "if_team2_wins": delta_t2,
                "raw_importance": raw_importance,
                "adjusted_importance": adjusted_importance,
            })

        return {"games": games, "current_ev": current_ev}

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

    Uses Rust batch parallelization for fast score computation.

    Args:
        portfolio_service: The portfolio service instance
        state: The tournament state (possibly with what-if modifications applied)
        target_round: The round number (0 = first round, 1 = second round, etc.)
        target_position: The position within the round

    Returns a list of dicts with keys: team, probability, portfolio_delta
    """
    from api.services.tournament_service import (
        compute_bracket_rounds,
        compute_path_to_slot_with_rounds,
    )

    positions, _ = portfolio_service.get_positions()

    # Get current portfolio value
    current_scores = state.calculate_scores_prob()
    current_value = pv.get_portfolio_value(positions, current_scores)

    # Compute bracket rounds ONCE (this is the expensive part)
    rounds = compute_bracket_rounds(state)

    # Get teams from the target slot
    if target_round >= len(rounds) or target_position >= len(rounds[target_round]):
        return []

    slot_teams = rounds[target_round][target_position]

    # Filter to teams with non-negligible probability
    candidates_info = [
        (team, prob) for team, prob in slot_teams.items() if prob >= 0.001
    ]

    if not candidates_info:
        return []

    # Build override scenarios for batch computation, reusing precomputed rounds
    scenarios = []
    for team, prob in candidates_info:
        path = compute_path_to_slot_with_rounds(
            state, rounds, team, target_round, target_position
        )
        if path:
            # Convert to overrides format: list of (winner, loser, prob)
            overrides = [(w, l, 1.0) for w, l in path]
            scenarios.append(overrides)
        else:
            scenarios.append([])

    # Compute all scores in parallel using Rust
    batch_results = state.calculate_scores_prob_batch(scenarios)

    # Calculate portfolio deltas from batch results
    candidates = []
    for (team, prob), scores in zip(candidates_info, batch_results):
        if scores:
            modified_value = pv.get_portfolio_value(positions, scores)
            portfolio_delta = modified_value - current_value
        else:
            portfolio_delta = 0.0

        candidates.append({
            "team": team,
            "probability": prob,
            "portfolio_delta": portfolio_delta,
        })

    # Sort by probability descending
    candidates.sort(key=lambda c: c["probability"], reverse=True)
    return candidates
