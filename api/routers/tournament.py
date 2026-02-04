"""Tournament API endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from api.models import TeamInfo, BracketResponse, BracketGame
from api.services.tournament_service import TournamentService, get_tournament_service
from api.services.portfolio_service import PortfolioService, get_portfolio_service

router = APIRouter(prefix="/tournament", tags=["tournament"])


@router.get("/teams", response_model=list[TeamInfo])
def get_teams(
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get all teams with ratings, scores, and portfolio data."""
    try:
        teams = tournament.get_all_teams()
        positions, _ = portfolio.get_positions()
        deltas, _ = portfolio.get_all_deltas()

        result = []
        for team in teams:
            result.append(
                TeamInfo(
                    name=team["name"],
                    offense=team["offense"],
                    defense=team["defense"],
                    tempo=team["tempo"],
                    expected_score=team["expected_score"],
                    position=positions.get(team["name"], 0.0),
                    delta=deltas.get(team["name"], 0.0),
                )
            )

        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/teams/{team_name}", response_model=TeamInfo)
def get_team(
    team_name: str,
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get detailed info for a single team."""
    try:
        team = tournament.get_team_info(team_name)
        positions, _ = portfolio.get_positions()
        deltas, _ = portfolio.get_all_deltas()

        return TeamInfo(
            name=team["name"],
            offense=team["offense"],
            defense=team["defense"],
            tempo=team["tempo"],
            expected_score=team["expected_score"],
            position=positions.get(team_name, 0.0),
            delta=deltas.get(team_name, 0.0),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Team not found: {team_name}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/bracket", response_model=BracketResponse)
def get_bracket(
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get bracket structure for visualization."""
    try:
        bracket = tournament.get_bracket_structure()
        return BracketResponse(
            games=[
                BracketGame(
                    id=g["id"],
                    round=g["round"],
                    region=g["region"],
                    teams=g["teams"],
                )
                for g in bracket["games"]
            ],
            num_teams=bracket["num_teams"],
            num_rounds=bracket["num_rounds"],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/scores")
def get_scores(
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get expected scores for all teams."""
    try:
        return tournament.get_scores()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
