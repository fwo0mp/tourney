"""Tournament API endpoints."""

import json
from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import TeamInfo, BracketResponse, BracketGame, PlayInGame
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

        def get_region(idx: int, total: int) -> str | None:
            """Determine region based on position."""
            if total == 64:
                if idx < 16:
                    return "South"
                elif idx < 32:
                    return "East"
                elif idx < 48:
                    return "Midwest"
                else:
                    return "West"
            return None

        games = []
        play_in_games = []

        for i, game in enumerate(bracket):
            region = get_region(i, num_teams)

            # Check if this is a play-in game (has 2 teams with non-100% probabilities)
            team_names = list(game.keys())
            if len(team_names) == 2:
                # Sort so higher probability team is first
                probs = [(name, game[name]) for name in team_names]
                probs.sort(key=lambda x: x[1], reverse=True)
                team1, team1_prob = probs[0]
                team2, team2_prob = probs[1]

                # This is a play-in game
                play_in_games.append(
                    PlayInGame(
                        id=f"playin_{i}",
                        slot_index=i,
                        region=region,
                        team1=team1,
                        team2=team2,
                        team1_prob=team1_prob,
                        team2_prob=team2_prob,
                    )
                )

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
            play_in_games=play_in_games,
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
