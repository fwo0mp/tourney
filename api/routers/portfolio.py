"""Portfolio API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import PositionsResponse, PortfolioSummary, DeltasResponse
from api.services.portfolio_service import PortfolioService, get_portfolio_service

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("/positions", response_model=PositionsResponse)
def get_positions(
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get current portfolio positions."""
    positions, is_mock = portfolio.get_positions()
    return PositionsResponse(positions=positions, is_mock=is_mock)


@router.get("/value")
def get_value(
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get current portfolio expected value."""
    try:
        value = portfolio.get_portfolio_value()
        return {"expected_value": value}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/distribution", response_model=PortfolioSummary)
def get_distribution(
    n_simulations: int = Query(default=10000, ge=100, le=100000),
    seed: int = Query(default=42),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get portfolio value distribution from Monte Carlo simulations."""
    try:
        dist = portfolio.get_portfolio_distribution(n_simulations, seed)
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
