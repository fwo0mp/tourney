"""API-level behavior tests for rule enforcement and error mapping."""

import json

import pytest
from fastapi import HTTPException

from api import database as db
from api.models import CompletedGame, SetActiveScenarioRequest
from api.routers import analysis as analysis_router
from api.routers import market as market_router
from api.routers import portfolio as portfolio_router
from api.routers import tournament as tournament_router
from api.services.cix_service import (
    CIXConfigurationError,
    CIXService,
    CIXUnavailableError,
    CIXUpstreamError,
)
from api.services.portfolio_service import PortfolioService
from api.services.tournament_service import TournamentService, compute_path_to_slot


def _find_single_team_matchup(state):
    """Find a first-round matchup with one team in each feeder slot."""
    bracket = state.bracket
    for slot_idx in range(0, len(bracket), 2):
        if slot_idx + 1 >= len(bracket):
            continue
        if len(bracket[slot_idx]) == 1 and len(bracket[slot_idx + 1]) == 1:
            team1 = next(iter(bracket[slot_idx]))
            team2 = next(iter(bracket[slot_idx + 1]))
            return slot_idx, team1, team2
    raise AssertionError("No deterministic first-round matchup found in bracket")


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    """Isolate singleton services and database state for each test."""
    monkeypatch.setenv("USE_MOCK_DATA", "true")
    db.DATABASE_PATH = tmp_path / "test.db"
    db.init_db()

    with db.get_connection() as conn:
        conn.execute("DELETE FROM completed_games")
        conn.execute("DELETE FROM whatif_game_outcomes")
        conn.execute("DELETE FROM whatif_rating_adjustments")
        conn.execute("DELETE FROM scenarios")
        conn.execute("UPDATE active_scenario SET scenario_id = NULL WHERE id = 1")
        conn.commit()

    TournamentService._instance = None
    PortfolioService._instance = None
    CIXService._instance = None
    yield
    TournamentService._instance = None
    PortfolioService._instance = None
    CIXService._instance = None


def test_portfolio_value_respects_completed_games_against_conflicting_what_if():
    tournament = TournamentService.get_instance()
    tournament.load()
    portfolio = PortfolioService.get_instance()

    _, winner, loser = _find_single_team_matchup(tournament.get_state())
    tournament_router.add_completed_game(
        CompletedGame(winner=winner, loser=loser),
        tournament=tournament,
    )

    baseline = portfolio_router.get_value(
        what_if_outcomes=None,
        what_if_adjustments=None,
        portfolio=portfolio,
        tournament=tournament,
    )
    conflicting = portfolio_router.get_value(
        what_if_outcomes=json.dumps(
            [{"team1": winner, "team2": loser, "probability": 0.0}]
        ),
        what_if_adjustments=None,
        portfolio=portfolio,
        tournament=tournament,
    )

    assert conflicting["expected_value"] == pytest.approx(
        baseline["expected_value"],
        abs=1e-9,
    )
    assert conflicting["total_value"] == pytest.approx(
        baseline["total_value"],
        abs=1e-9,
    )


def test_analysis_slot_candidates_respect_completed_games_against_conflicting_what_if():
    tournament = TournamentService.get_instance()
    tournament.load()
    portfolio = PortfolioService.get_instance()

    slot_idx, winner, loser = _find_single_team_matchup(tournament.get_state())
    tournament_router.add_completed_game(
        CompletedGame(winner=winner, loser=loser),
        tournament=tournament,
    )

    target_round = 1
    target_position = slot_idx // 2
    baseline = analysis_router.get_slot_candidates(
        round=target_round,
        position=target_position,
        what_if_outcomes=None,
        what_if_adjustments=None,
        tournament=tournament,
        portfolio=portfolio,
    )
    conflicting = analysis_router.get_slot_candidates(
        round=target_round,
        position=target_position,
        what_if_outcomes=json.dumps(
            [{"team1": winner, "team2": loser, "probability": 0.0}]
        ),
        what_if_adjustments=None,
        tournament=tournament,
        portfolio=portfolio,
    )

    assert conflicting.round == baseline.round
    assert conflicting.position == baseline.position
    assert len(conflicting.candidates) == len(baseline.candidates)

    for observed, expected in zip(conflicting.candidates, baseline.candidates):
        assert observed.team == expected.team
        assert observed.probability == pytest.approx(expected.probability, abs=1e-12)
        assert observed.portfolio_delta == pytest.approx(expected.portfolio_delta, abs=1e-9)


def test_set_active_scenario_missing_id_returns_404():
    with pytest.raises(HTTPException) as exc_info:
        analysis_router.set_active_scenario(
            SetActiveScenarioRequest(scenario_id=999999)
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Scenario not found"


def test_invalid_what_if_json_returns_400():
    tournament = TournamentService.get_instance()
    portfolio = PortfolioService.get_instance()

    with pytest.raises(HTTPException) as exc_info:
        portfolio_router.get_value(
            what_if_outcomes="not-json",
            what_if_adjustments=None,
            portfolio=portfolio,
            tournament=tournament,
        )

    assert exc_info.value.status_code == 400
    assert "Invalid JSON" in exc_info.value.detail


def test_compute_path_to_slot_respects_target_position():
    tournament = TournamentService.get_instance()
    tournament.load()
    state = tournament.get_state()

    slot_idx, team1, _ = _find_single_team_matchup(state)
    correct_position = slot_idx // 2
    total_round1_slots = len(state.bracket) // 2
    wrong_position = (correct_position + 1) % total_round1_slots

    correct_path = compute_path_to_slot(state, team1, 1, correct_position)
    wrong_path = compute_path_to_slot(state, team1, 1, wrong_position)

    assert correct_path
    assert wrong_path == []


class _FailingCIX:
    def __init__(self, error):
        self._error = error

    def get_executions(self, mine_only=True, since=None, n=None):
        raise self._error

    def get_orderbook(self, team):
        raise self._error

    def place_order(self, team, side, price, size):
        raise self._error

    def cancel_order(self, order_id):
        raise self._error


class _StubCIX:
    def get_executions(self, mine_only=True, since=None, n=None):
        return {
            "executions": [
                {
                    "time": "2026-02-14T00:00:00+00:00",
                    "team": "Duke",
                    "side": "buy",
                    "quantity": 3,
                    "price": 2.5,
                }
            ],
            "is_mock": False,
        }


def test_market_router_get_executions_success():
    response = market_router.get_executions(
        mine_only=True,
        since=None,
        n=100,
        cix=_StubCIX(),
    )

    assert response.is_mock is False
    assert len(response.executions) == 1
    assert response.executions[0].team == "Duke"


def test_market_router_maps_unavailable_to_503():
    with pytest.raises(HTTPException) as exc_info:
        market_router.get_orderbook(
            team="Duke",
            cix=_FailingCIX(CIXUnavailableError("network down")),
        )

    assert exc_info.value.status_code == 503


def test_market_router_maps_upstream_to_502():
    with pytest.raises(HTTPException) as exc_info:
        market_router.place_order(
            team="Duke",
            order=market_router.OrderRequest(side="buy", price=1.0, size=1),
            cix=_FailingCIX(CIXUpstreamError("upstream rejected order")),
        )

    assert exc_info.value.status_code == 502


def test_market_router_executions_map_upstream_to_502():
    with pytest.raises(HTTPException) as exc_info:
        market_router.get_executions(
            mine_only=True,
            since=None,
            n=100,
            cix=_FailingCIX(CIXUpstreamError("upstream rejected executions request")),
        )

    assert exc_info.value.status_code == 502


def test_market_router_maps_configuration_to_503():
    with pytest.raises(HTTPException) as exc_info:
        market_router.cancel_order(
            order_id="abc",
            cix=_FailingCIX(CIXConfigurationError("missing CIX_APID")),
        )

    assert exc_info.value.status_code == 503
