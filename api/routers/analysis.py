"""Analysis API endpoints for game impact and what-if scenarios."""

import json
from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import (
    GameImpact,
    GameDeltaResponse,
    TeamDeltaInfo,
    WhatIfRequest,
    WhatIfResponse,
    SlotCandidate,
    SlotCandidatesResponse,
    ComputePathRequest,
    ComputePathResponse,
    WhatIfGameOutcome,
)
from api.services.tournament_service import (
    TournamentService,
    get_tournament_service,
    apply_what_if,
    compute_path_to_slot,
)
from api.services.portfolio_service import (
    PortfolioService,
    get_portfolio_service,
    get_slot_candidates_with_deltas,
)
import portfolio_value as pv

router = APIRouter(prefix="/analysis", tags=["analysis"])


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


@router.get("/games/upcoming", response_model=list[GameImpact])
def get_upcoming_games(
    top_n: int = Query(default=10, ge=1, le=50),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get upcoming games with biggest portfolio impact."""
    try:
        games = portfolio.get_upcoming_games_impact(top_n)
        return [
            GameImpact(
                team1=g["team1"],
                team2=g["team2"],
                win_prob=g["win_prob"],
                if_team1_wins=g["if_team1_wins"],
                if_team2_wins=g["if_team2_wins"],
                swing=g["swing"],
            )
            for g in games
        ]
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/game/{team1}/{team2}", response_model=GameDeltaResponse)
def get_game_impact(
    team1: str,
    team2: str,
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get portfolio impact for a specific game outcome."""
    try:
        result = portfolio.get_game_delta(team1, team2)
        return GameDeltaResponse(
            team1=result["team1"],
            team2=result["team2"],
            win_prob=result["win_prob"],
            if_team1_wins=result["if_team1_wins"],
            if_team2_wins=result["if_team2_wins"],
            swing=result["swing"],
            team_impacts=[
                TeamDeltaInfo(**ti) for ti in result["team_impacts"]
            ],
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/what-if", response_model=WhatIfResponse)
def analyze_what_if(
    request: WhatIfRequest,
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Analyze a what-if scenario with game outcomes and/or rating adjustments."""
    try:
        positions, _ = portfolio.get_positions()

        # Get original state and scores
        original_state = tournament.get_state()
        original_scores = original_state.calculate_scores_prob()
        original_value = pv.get_portfolio_value(positions, original_scores)

        # Apply modifications to create new state
        modified_state = original_state

        # Apply game outcome overrides (winner gets 100% probability)
        for outcome in request.game_outcomes:
            modified_state = modified_state.with_override(
                outcome.winner, outcome.loser, 1.0
            )

        # Apply rating adjustments
        for team_name, delta in request.rating_adjustments.items():
            modified_state = modified_state.with_team_adjustment(team_name, delta)

        # Calculate modified scores and value
        modified_scores = modified_state.calculate_scores_prob()
        modified_value = pv.get_portfolio_value(positions, modified_scores)

        return WhatIfResponse(
            original_value=original_value,
            modified_value=modified_value,
            delta=modified_value - original_value,
            original_scores=original_scores,
            modified_scores=modified_scores,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Team not found: {e}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/slot/{round}/{position}/candidates", response_model=SlotCandidatesResponse)
def get_slot_candidates(
    round: int,
    position: int,
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get teams that can reach a specific bracket slot with probabilities and portfolio deltas."""
    try:
        # Apply what-if state to tournament
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)
        state = tournament.get_state()
        if outcomes or adjustments:
            state = apply_what_if(state, outcomes, adjustments)

        # Get candidates using the (possibly modified) state
        candidates = get_slot_candidates_with_deltas(
            portfolio, state, round, position
        )

        return SlotCandidatesResponse(
            round=round,
            position=position,
            candidates=[SlotCandidate(**c) for c in candidates],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compute-path", response_model=ComputePathResponse)
def compute_path(
    request: ComputePathRequest,
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Compute game outcomes needed for a team to reach a specific bracket slot."""
    try:
        # Apply existing outcomes to state
        state = tournament.get_state()
        if request.current_outcomes:
            outcomes = [{"winner": o.winner, "loser": o.loser} for o in request.current_outcomes]
            state = apply_what_if(state, game_outcomes=outcomes)

        # Compute path
        path = compute_path_to_slot(state, request.team, request.round, request.position)

        return ComputePathResponse(
            required_outcomes=[
                WhatIfGameOutcome(winner=w, loser=l) for w, l in path
            ]
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
