"""Tournament API endpoints."""

import json
from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import TeamInfo, BracketResponse, BracketGame
from api.services.tournament_service import TournamentService, get_tournament_service, apply_what_if
from api.services.portfolio_service import PortfolioService, get_portfolio_service
import portfolio_value as pv

router = APIRouter(prefix="/tournament", tags=["tournament"])


def parse_what_if_params(
    what_if_outcomes: str | None,
    what_if_adjustments: str | None,
) -> tuple[list, dict]:
    """Parse what-if parameters from query strings."""
    outcomes = []
    adjustments = {}

    if what_if_outcomes:
        try:
            outcomes = json.loads(what_if_outcomes)
        except json.JSONDecodeError:
            pass

    if what_if_adjustments:
        try:
            adjustments = json.loads(what_if_adjustments)
        except json.JSONDecodeError:
            pass

    return outcomes, adjustments


@router.get("/teams", response_model=list[TeamInfo])
def get_teams(
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get all teams with ratings, scores, and portfolio data."""
    try:
        # Apply what-if modifications if provided
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)
        state = tournament.get_state()
        if outcomes or adjustments:
            state = apply_what_if(state, outcomes, adjustments)

        # Calculate scores with the (possibly modified) state
        scores = state.calculate_scores_prob()
        positions, _ = portfolio.get_positions()

        # Calculate deltas with the modified state
        team_deltas, _ = pv.get_all_team_deltas(positions, state)

        result = []
        for team_name in state.get_bracket_teams():
            team = state.ratings.get(team_name)
            if team:
                result.append(
                    TeamInfo(
                        name=team.name,
                        offense=team.offense,
                        defense=team.defense,
                        tempo=team.tempo,
                        expected_score=scores.get(team_name, 0.0),
                        position=positions.get(team_name, 0.0),
                        delta=team_deltas.get(team_name, 0.0),
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
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get bracket structure for visualization."""
    try:
        # Apply what-if modifications if provided
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)
        state = tournament.get_state()
        if outcomes or adjustments:
            state = apply_what_if(state, outcomes, adjustments)

        # Get bracket structure from the modified state
        bracket = state.bracket
        num_teams = len(bracket)

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

            games.append(
                BracketGame(
                    id=f"game_{i}",
                    round=0,
                    region=region,
                    teams=game,
                )
            )

        return BracketResponse(
            games=games,
            num_teams=num_teams,
            num_rounds=num_rounds,
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
