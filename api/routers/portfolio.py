"""Portfolio API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

import portfolio_value as pv
from api.models import (
    PositionsResponse,
    PortfolioSummary,
    DeltasResponse,
    HypotheticalValueRequest,
    HypotheticalValueResponse,
)
from api.services.portfolio_service import PortfolioService, get_portfolio_service
from api.services.tournament_service import TournamentService, get_tournament_service
from api.utils import parse_what_if_params

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/positions", response_model=PositionsResponse)
def get_positions(
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get current portfolio positions."""
    positions, is_mock = portfolio.get_positions()
    cash_balance, _ = portfolio.get_cash_balance()
    return PositionsResponse(positions=positions, cash_balance=cash_balance, is_mock=is_mock)


@router.get("/value")
def get_value(
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    portfolio: PortfolioService = Depends(get_portfolio_service),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get current portfolio expected value.

    This is a cheap probabilistic calculation that can be called frequently.
    Optionally apply what-if scenarios.
    """
    try:
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)

        # Get tournament state, optionally with what-if modifications
        state = tournament.get_effective_state(
            game_outcomes=outcomes,
            rating_adjustments=adjustments,
        )

        # Calculate expected value (cheap probabilistic calculation)
        positions, _ = portfolio.get_positions()
        cash_balance, _ = portfolio.get_cash_balance()
        scores = state.calculate_scores_prob()
        value = pv.get_portfolio_value(positions, scores)

        return {
            "expected_value": value,
            "cash_balance": cash_balance,
            "total_value": value + cash_balance,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/distribution", response_model=PortfolioSummary)
def get_distribution(
    n_simulations: int = Query(default=10000, ge=100, le=100000),
    seed: int = Query(default=42),
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    portfolio: PortfolioService = Depends(get_portfolio_service),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get portfolio value distribution from Monte Carlo simulations.

    Optionally apply what-if scenarios before running simulations.
    """
    try:
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)

        # Get tournament state, optionally with what-if modifications
        state = tournament.get_effective_state(
            game_outcomes=outcomes,
            rating_adjustments=adjustments,
        )

        dist = portfolio.get_portfolio_distribution(n_simulations, seed, state=state)
        return PortfolioSummary(**dist)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/deltas", response_model=DeltasResponse)
def get_deltas(
    point_delta: float = Query(default=1.0),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get portfolio sensitivity for all teams."""
    try:
        deltas, pairwise = portfolio.get_all_deltas(point_delta)
        return DeltasResponse(deltas=deltas, pairwise=pairwise)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/team/{team_name}/impact")
def get_team_impact(
    team_name: str,
    point_delta: float = Query(default=1.0),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get portfolio impact for a specific team."""
    try:
        deltas, pairwise = portfolio.get_all_deltas(point_delta)
        positions, _ = portfolio.get_positions()

        if team_name not in deltas:
            raise HTTPException(status_code=404, detail=f"Team not found: {team_name}")

        # Build detailed breakdown with EV delta and portfolio impact
        pairwise_raw = pairwise.get(team_name, {})
        breakdown = []
        for holding, ev_delta in pairwise_raw.items():
            position = positions.get(holding, 0.0)
            portfolio_impact = ev_delta * position
            breakdown.append({
                "holding": holding,
                "position": position,
                "ev_delta": ev_delta,
                "portfolio_impact": portfolio_impact,
            })

        # Sort by absolute portfolio impact
        breakdown.sort(key=lambda x: abs(x["portfolio_impact"]), reverse=True)

        return {
            "team": team_name,
            "portfolio_delta": deltas[team_name],
            "breakdown": breakdown,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/hypothetical-value", response_model=HypotheticalValueResponse)
def get_hypothetical_value(
    request: HypotheticalValueRequest,
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    portfolio: PortfolioService = Depends(get_portfolio_service),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Calculate portfolio value with hypothetical position changes.

    This endpoint allows exploring the impact of potential trades on portfolio value.
    The position_changes dict specifies quantity changes for each team (+ for buy, - for sell).
    Note: Cash changes from trades are not computed here - that's done on the frontend
    since it requires price info which is client-side only.
    """
    try:
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)

        # Get tournament state with any what-if modifications
        state = tournament.get_effective_state(
            game_outcomes=outcomes,
            rating_adjustments=adjustments,
        )

        # Get current positions and cash balance
        positions, _ = portfolio.get_positions()
        cash_balance, _ = portfolio.get_cash_balance()

        # Calculate current portfolio value
        scores = state.calculate_scores_prob()
        current_value = pv.get_portfolio_value(positions, scores)

        # Apply hypothetical position changes
        hypothetical_positions = dict(positions)
        for team, change in request.position_changes.items():
            hypothetical_positions[team] = hypothetical_positions.get(team, 0.0) + change

        # Calculate hypothetical portfolio value
        hypothetical_value = pv.get_portfolio_value(hypothetical_positions, scores)

        return HypotheticalValueResponse(
            current_value=current_value,
            hypothetical_value=hypothetical_value,
            delta=hypothetical_value - current_value,
            hypothetical_positions=hypothetical_positions,
            current_cash=cash_balance,
            current_total=current_value + cash_balance,
            hypothetical_total=hypothetical_value + cash_balance,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
