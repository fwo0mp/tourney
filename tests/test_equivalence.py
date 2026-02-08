"""
Equivalence tests comparing Python and Rust implementations.

These tests verify that the Rust implementation produces results
equivalent to the original Python implementation (within floating
point tolerance).
"""

import random
from decimal import Decimal

import pytest

# Reference Python implementation
import tourney_utils_reference as python_impl

# Rust implementation (via main module)
import tourney_utils as rust_impl
import tourney_core


# Tolerance for floating point comparisons
TOLERANCE = 1e-9


class TestTeam:
    """Test Team class equivalence."""

    def test_team_creation_basic(self):
        """Test basic team creation without adjustment."""
        py_team = python_impl.Team("Duke", Decimal("0.05"), Decimal("-0.02"), Decimal("68.0"))
        rust_team = tourney_core.Team("Duke", 0.05, -0.02, 68.0)

        assert rust_team.name == py_team.name
        assert abs(rust_team.offense - float(py_team.offense)) < TOLERANCE
        assert abs(rust_team.defense - float(py_team.defense)) < TOLERANCE
        assert abs(rust_team.tempo - float(py_team.tempo)) < TOLERANCE

    def test_team_creation_with_adjustment(self):
        """Test team creation with rating adjustment."""
        # Raw KenPom-style ratings
        offense = 115.0
        defense = 95.0
        tempo = 70.0

        py_team = python_impl.Team("Test", Decimal(str(offense)), Decimal(str(defense)), Decimal(str(tempo)), adjust=True)
        rust_team = tourney_core.Team("Test", offense, defense, tempo, adjust=True)

        assert abs(rust_team.offense - float(py_team.offense)) < TOLERANCE
        assert abs(rust_team.defense - float(py_team.defense)) < TOLERANCE

    def test_team_copy(self):
        """Test team copy method."""
        rust_team = tourney_core.Team("Test", 0.05, -0.02, 68.0)
        rust_copy = rust_team.copy()

        assert rust_copy.name == rust_team.name
        assert rust_copy.offense == rust_team.offense


class TestOverridesMap:
    """Test OverridesMap class equivalence."""

    def test_add_and_get_override(self):
        """Test adding and retrieving overrides."""
        py_overrides = python_impl.OverridesMap()
        rust_overrides = tourney_core.OverridesMap()

        py_overrides.add_override("Duke", "UNC", Decimal("0.65"))
        rust_overrides.add_override("Duke", "UNC", 0.65)

        py_prob = py_overrides.get_override("Duke", "UNC")
        rust_prob = rust_overrides.get_override("Duke", "UNC")

        assert abs(float(py_prob) - rust_prob) < TOLERANCE

    def test_override_name_ordering(self):
        """Test that name ordering is handled consistently."""
        py_overrides = python_impl.OverridesMap()
        rust_overrides = tourney_core.OverridesMap()

        # Add with names in one order
        py_overrides.add_override("UNC", "Duke", Decimal("0.35"))
        rust_overrides.add_override("UNC", "Duke", 0.35)

        # Retrieve with names in opposite order
        py_prob = py_overrides.get_override("Duke", "UNC")
        rust_prob = rust_overrides.get_override("Duke", "UNC")

        assert abs(float(py_prob) - rust_prob) < TOLERANCE
        assert abs(rust_prob - 0.65) < TOLERANCE  # Should be 1 - 0.35


class TestCalculateWinProb:
    """Test win probability calculation equivalence."""

    def test_equal_teams(self):
        """Equal teams should have ~50% win probability."""
        py_team1 = python_impl.Team("A", Decimal("0"), Decimal("0"), Decimal("67.7"))
        py_team2 = python_impl.Team("B", Decimal("0"), Decimal("0"), Decimal("67.7"))

        rust_team1 = tourney_core.Team("A", 0.0, 0.0, 67.7)
        rust_team2 = tourney_core.Team("B", 0.0, 0.0, 67.7)

        py_prob = float(python_impl.calculate_win_prob(py_team1, py_team2))
        rust_prob = tourney_core.py_calculate_win_prob(rust_team1, rust_team2)

        assert abs(py_prob - 0.5) < TOLERANCE
        assert abs(rust_prob - 0.5) < TOLERANCE
        assert abs(py_prob - rust_prob) < TOLERANCE

    def test_random_teams(self):
        """Test win probability for many random team pairs."""
        random.seed(42)

        for _ in range(100):
            off1 = random.uniform(-0.15, 0.15)
            def1 = random.uniform(-0.15, 0.15)
            tempo1 = random.uniform(62, 75)
            off2 = random.uniform(-0.15, 0.15)
            def2 = random.uniform(-0.15, 0.15)
            tempo2 = random.uniform(62, 75)

            py_team1 = python_impl.Team("A", Decimal(str(off1)), Decimal(str(def1)), Decimal(str(tempo1)))
            py_team2 = python_impl.Team("B", Decimal(str(off2)), Decimal(str(def2)), Decimal(str(tempo2)))

            rust_team1 = tourney_core.Team("A", off1, def1, tempo1)
            rust_team2 = tourney_core.Team("B", off2, def2, tempo2)

            py_prob = float(python_impl.calculate_win_prob(py_team1, py_team2))
            rust_prob = tourney_core.py_calculate_win_prob(rust_team1, rust_team2)

            assert abs(py_prob - rust_prob) < 1e-6, f"Mismatch: Python={py_prob}, Rust={rust_prob}"

    def test_symmetry(self):
        """P(A beats B) + P(B beats A) should equal 1."""
        rust_team1 = tourney_core.Team("Duke", 0.05, -0.02, 68.0)
        rust_team2 = tourney_core.Team("UNC", 0.03, 0.01, 70.0)

        prob1 = tourney_core.py_calculate_win_prob(rust_team1, rust_team2)
        prob2 = tourney_core.py_calculate_win_prob(rust_team2, rust_team1)

        assert abs(prob1 + prob2 - 1.0) < TOLERANCE

    def test_with_override(self):
        """Test that overrides are used correctly."""
        rust_team1 = tourney_core.Team("A", 0.0, 0.0, 67.7)
        rust_team2 = tourney_core.Team("B", 0.0, 0.0, 67.7)

        rust_overrides = tourney_core.OverridesMap()
        rust_overrides.add_override("A", "B", 0.75)

        prob = tourney_core.py_calculate_win_prob(rust_team1, rust_team2, rust_overrides)
        assert abs(prob - 0.75) < TOLERANCE


class TestTournamentState:
    """Test tournament scoring equivalence."""

    @pytest.fixture
    def simple_bracket_python(self):
        """Create a simple 4-team bracket using Python implementation."""
        ratings = {
            "A": python_impl.Team("A", Decimal("0.05"), Decimal("-0.02"), Decimal("68.0")),
            "B": python_impl.Team("B", Decimal("0.03"), Decimal("0.01"), Decimal("70.0")),
            "C": python_impl.Team("C", Decimal("-0.02"), Decimal("0.03"), Decimal("66.0")),
            "D": python_impl.Team("D", Decimal("0"), Decimal("0"), Decimal("67.7")),
        }
        bracket = [
            {"A": Decimal("1")},
            {"B": Decimal("1")},
            {"C": Decimal("1")},
            {"D": Decimal("1")},
        ]
        scoring = [Decimal("1"), Decimal("1")]
        return python_impl.TournamentState(bracket, ratings, scoring)

    @pytest.fixture
    def simple_bracket_rust(self):
        """Create a simple 4-team bracket using Rust implementation."""
        ratings = {
            "A": tourney_core.Team("A", 0.05, -0.02, 68.0),
            "B": tourney_core.Team("B", 0.03, 0.01, 70.0),
            "C": tourney_core.Team("C", -0.02, 0.03, 66.0),
            "D": tourney_core.Team("D", 0.0, 0.0, 67.7),
        }
        bracket = [
            {"A": 1.0},
            {"B": 1.0},
            {"C": 1.0},
            {"D": 1.0},
        ]
        scoring = [1.0, 1.0]
        return tourney_core.TournamentState(bracket, ratings, scoring)

    def test_calculate_scores_prob(self, simple_bracket_python, simple_bracket_rust):
        """Test probabilistic scoring matches between implementations."""
        py_scores = simple_bracket_python.calculate_scores_prob()
        rust_scores = simple_bracket_rust.calculate_scores_prob()

        for team in py_scores:
            py_score = float(py_scores[team])
            rust_score = rust_scores.get(team, 0.0)
            assert abs(py_score - rust_score) < 1e-6, f"Team {team}: Python={py_score}, Rust={rust_score}"

    def test_total_score_consistency(self, simple_bracket_rust):
        """Total expected score should be consistent."""
        scores = simple_bracket_rust.calculate_scores_prob()

        # With 4 teams and 2 rounds with 1 point each:
        # Round 1: 2 winners get 1 point each = 2 points total
        # Round 2: 1 winner gets 1 point = 1 point total
        # Total: 3 points
        total = sum(scores.values())
        assert abs(total - 3.0) < 0.01

    def test_get_bracket_teams(self, simple_bracket_rust):
        """Test bracket team extraction."""
        teams = simple_bracket_rust.get_bracket_teams()
        assert set(teams) == {"A", "B", "C", "D"}


class TestFileReading:
    """Test file reading functions."""

    def test_read_ratings_file(self, tmp_path):
        """Test reading ratings from file."""
        import tourney_utils as tourney

        ratings_file = tmp_path / "ratings.txt"
        ratings_file.write_text("Duke|115.0|95.0|70.0\nUNC|110.0|100.0|68.0\n")

        ratings = tourney.read_ratings_file(str(ratings_file))

        assert "Duke" in ratings
        assert "UNC" in ratings
        # Check adjustment was applied (115/104.6 - 1 ≈ 0.099)
        assert abs(ratings["Duke"].offense - (115.0 / 104.6 - 1)) < TOLERANCE

    def test_read_adjustments_file(self, tmp_path):
        """Test reading adjustments from file."""
        import tourney_utils as tourney

        adj_file = tmp_path / "adjustments.txt"
        adj_file.write_text("Duke|+1.5\nUNC|-1.0\n")

        adj = tourney.read_adjustments_file(str(adj_file))

        assert adj["Duke"] == 1.5
        assert adj["UNC"] == -1.0


class TestPortfolioValue:
    """Test portfolio value calculations."""

    def _make_tournament(self):
        """Create a simple 4-team tournament for testing."""
        ratings = {
            "A": rust_impl.Team("A", 0.05, -0.02, 68.0),
            "B": rust_impl.Team("B", 0.03, 0.01, 70.0),
            "C": rust_impl.Team("C", -0.02, 0.03, 66.0),
            "D": rust_impl.Team("D", 0.0, 0.0, 67.7),
        }
        bracket = [
            {"A": 1.0}, {"B": 1.0},
            {"C": 1.0}, {"D": 1.0},
        ]
        return rust_impl.TournamentState(
            bracket=bracket, ratings=ratings,
            scoring=[1.0, 1.0],
        )

    def test_game_delta_with_points(self):
        """game_delta should handle 'points' (cash) consistently with get_portfolio_value."""
        import portfolio_value as pv

        state = self._make_tournament()
        positions = {"A": 10.0, "B": 5.0, "points": 500.0}

        # Compute current value (includes cash)
        current_scores = state.calculate_scores_prob()
        current_value = pv.get_portfolio_value(positions, current_scores)

        # Compute game delta
        win_value, loss_value, _ = pv.game_delta(positions, state, "A", "B")

        # win_value and loss_value should include cash, just like current_value
        # So deltas should be reasonable (not offset by -500)
        win_delta = win_value - current_value
        loss_delta = loss_value - current_value

        # If A wins, portfolio with long A position should benefit
        assert win_delta > 0, f"Expected positive delta when A wins (long A), got {win_delta}"
        # If B wins (A loses), portfolio should lose value
        assert loss_delta < 0, f"Expected negative delta when A loses, got {loss_delta}"

        # Verify the values include cash by checking they're > 500
        assert win_value > 500, f"win_value should include cash of 500, got {win_value}"
        assert loss_value > 500, f"loss_value should include cash of 500, got {loss_value}"

    def test_game_delta_without_points(self):
        """game_delta should work correctly without 'points' entry."""
        import portfolio_value as pv

        state = self._make_tournament()
        positions = {"A": 10.0, "B": 5.0}

        current_scores = state.calculate_scores_prob()
        current_value = pv.get_portfolio_value(positions, current_scores)

        win_value, loss_value, _ = pv.game_delta(positions, state, "A", "B")

        win_delta = win_value - current_value
        loss_delta = loss_value - current_value

        # One should be positive, the other negative (with long A and B positions)
        # Since we hold more A than B, A winning should benefit us more
        assert win_delta > 0, f"Expected positive delta when A wins, got {win_delta}"
        assert loss_delta < 0, f"Expected negative delta when A loses, got {loss_delta}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
