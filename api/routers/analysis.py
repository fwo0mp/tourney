"""Analysis API endpoints for game impact and what-if scenarios."""

from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import (
    GameImpact,
    GameDeltaResponse,
    GameImportance,
    GameImportanceResponse,
    TeamDeltaInfo,
    WhatIfRequest,
    WhatIfResponse,
    WhatIfStateResponse,
    SlotCandidate,
    SlotCandidatesResponse,
    ComputePathRequest,
    ComputePathResponse,
    WhatIfGameOutcome,
    Scenario,
    CreateScenarioRequest,
    SetActiveScenarioRequest,
    SetGameOutcomeRequest,
    SetRatingAdjustmentRequest,
    PromoteOverrideRequest,
)
from api.services.tournament_service import (
    TournamentService,
    get_tournament_service,
    compute_path_to_slot,
)
from api.services.portfolio_service import (
    PortfolioService,
    get_portfolio_service,
    get_slot_candidates_with_deltas,
)
from api.utils import parse_what_if_params
from api import database as db
import portfolio_value as pv

router = APIRouter(prefix="/analysis", tags=["analysis"])


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


@router.get("/game-importance", response_model=GameImportanceResponse)
def get_game_importance(
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    tournament: TournamentService = Depends(get_tournament_service),
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get importance scores for all upcoming determined games."""
    try:
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)
        state = tournament.get_effective_state(outcomes, adjustments)

        result = portfolio.get_all_game_importance(state=state)
        return GameImportanceResponse(
            games=[GameImportance(**g) for g in result["games"]],
            current_ev=result["current_ev"],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/game/{team1}/{team2}", response_model=GameDeltaResponse)
def get_game_impact(
    team1: str,
    team2: str,
    portfolio: PortfolioService = Depends(get_portfolio_service),
):
    """Get portfolio impact for a specific game outcome."""
    try:
        result = portfolio.get_game_delta(team1, team2)

        # Compute importance scores inline
        win_prob = result["win_prob"]
        delta_t1 = result["if_team1_wins"]
        delta_t2 = result["if_team2_wins"]
        raw_importance = result["swing"]  # already abs(delta_t1 - delta_t2)
        adjusted_importance = abs(delta_t1) * win_prob**2 + abs(delta_t2) * (1 - win_prob)**2

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
            raw_importance=raw_importance,
            adjusted_importance=adjusted_importance,
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

        # Apply modifications to create new state while respecting completed games.
        modified_state = tournament.get_effective_state(
            game_outcomes=request.game_outcomes,
            rating_adjustments=request.rating_adjustments,
        )

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
        state = tournament.get_effective_state(outcomes, adjustments)

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
        outcomes = None
        if request.current_outcomes:
            outcomes = [
                {"team1": o.team1, "team2": o.team2, "probability": o.probability}
                for o in request.current_outcomes
            ]
        state = tournament.get_effective_state(game_outcomes=outcomes)

        # Compute path - returns (winner, loser) tuples for definite outcomes
        path = compute_path_to_slot(state, request.team, request.round, request.position)

        return ComputePathResponse(
            required_outcomes=[
                WhatIfGameOutcome(team1=winner, team2=loser, probability=1.0)
                for winner, loser in path
            ]
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Scenario Management Endpoints

@router.get("/scenarios", response_model=list[Scenario])
def get_scenarios():
    """Get all scenarios."""
    scenarios = db.get_scenarios()
    return [Scenario(**s) for s in scenarios]


@router.post("/scenarios", response_model=Scenario)
def create_scenario(request: CreateScenarioRequest):
    """Create a new scenario."""
    scenario = db.create_scenario(request.name, request.description)
    if scenario is None:
        raise HTTPException(status_code=400, detail="Scenario with this name already exists")
    return Scenario(**scenario)


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int):
    """Delete a scenario and its overrides."""
    deleted = db.delete_scenario(scenario_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"success": True}


@router.get("/scenarios/active", response_model=Scenario | None)
def get_active_scenario():
    """Get the currently active scenario, or null for default."""
    scenario = db.get_active_scenario()
    if scenario:
        return Scenario(**scenario)
    return None


@router.put("/scenarios/active")
def set_active_scenario(request: SetActiveScenarioRequest):
    """Set the active scenario. Pass null scenario_id for default."""
    updated = db.set_active_scenario(request.scenario_id)
    if not updated and request.scenario_id is not None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"success": True}


# What-If State Persistence Endpoints

@router.get("/whatif/state", response_model=WhatIfStateResponse)
def get_whatif_state():
    """Get persisted what-if state with permanent and scenario separation."""
    # Get active scenario
    active_scenario = db.get_active_scenario()
    active_scenario_id = active_scenario["id"] if active_scenario else None
    active_scenario_name = active_scenario["name"] if active_scenario else None

    # Get permanent overrides
    permanent_outcomes = db.get_whatif_game_outcomes(is_permanent=True)
    permanent_adjustments = db.get_whatif_rating_adjustments(is_permanent=True)

    # Get scenario/ad-hoc overrides
    if active_scenario_id:
        # Active scenario - get that scenario's overrides
        scenario_outcomes = db.get_whatif_game_outcomes(
            is_permanent=False, scenario_id=active_scenario_id
        )
        scenario_adjustments = db.get_whatif_rating_adjustments(
            is_permanent=False, scenario_id=active_scenario_id
        )
    else:
        # No active scenario - get ad-hoc overrides (scenario_id IS NULL)
        scenario_outcomes = db.get_whatif_game_outcomes(
            is_permanent=False, scenario_id_is_null=True
        )
        scenario_adjustments = db.get_whatif_rating_adjustments(
            is_permanent=False, scenario_id_is_null=True
        )

    return WhatIfStateResponse(
        permanent_game_outcomes=[
            WhatIfGameOutcome(team1=t1, team2=t2, probability=prob)
            for t1, t2, prob in permanent_outcomes
        ],
        permanent_rating_adjustments=permanent_adjustments,
        scenario_game_outcomes=[
            WhatIfGameOutcome(team1=t1, team2=t2, probability=prob)
            for t1, t2, prob in scenario_outcomes
        ],
        scenario_rating_adjustments=scenario_adjustments,
        active_scenario_id=active_scenario_id,
        active_scenario_name=active_scenario_name,
    )


@router.post("/whatif/game-outcome")
def set_whatif_game_outcome(request: SetGameOutcomeRequest):
    """Save a what-if game outcome with probability.

    If is_permanent=True, adds to permanent overrides.
    Otherwise, adds to the active scenario (or ad-hoc if no scenario active).
    """
    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    db.set_whatif_game_outcome(
        request.team1,
        request.team2,
        request.probability,
        is_permanent=request.is_permanent,
        scenario_id=scenario_id if not request.is_permanent else None,
    )
    return {"success": True}


@router.delete("/whatif/game-outcome")
def remove_whatif_game_outcome(
    team1: str = Query(..., description="First team name"),
    team2: str = Query(..., description="Second team name"),
    is_permanent: bool = Query(False, description="Whether this is a permanent override"),
):
    """Remove a what-if game outcome."""
    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    removed = db.remove_whatif_game_outcome(
        team1, team2, is_permanent=is_permanent, scenario_id=scenario_id if not is_permanent else None
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Game outcome not found")
    return {"success": True}


@router.post("/whatif/rating-adjustment")
def set_whatif_rating_adjustment(request: SetRatingAdjustmentRequest):
    """Save a what-if rating adjustment.

    If is_permanent=True, adds to permanent overrides.
    Otherwise, adds to the active scenario (or ad-hoc if no scenario active).
    """
    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    db.set_whatif_rating_adjustment(
        request.team,
        request.adjustment,
        is_permanent=request.is_permanent,
        scenario_id=scenario_id if not request.is_permanent else None,
    )
    return {"success": True}


@router.delete("/whatif/rating-adjustment/{team}")
def remove_whatif_rating_adjustment(
    team: str,
    is_permanent: bool = Query(False, description="Whether this is a permanent override"),
):
    """Remove a what-if rating adjustment."""
    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    removed = db.remove_whatif_rating_adjustment(
        team, is_permanent=is_permanent, scenario_id=scenario_id if not is_permanent else None
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Rating adjustment not found")
    return {"success": True}


@router.delete("/whatif/temporary")
def clear_temporary_overrides():
    """Clear only temporary overrides. For active scenario, clears scenario overrides. For ad-hoc, clears ad-hoc overrides. Permanent overrides remain."""
    active_scenario = db.get_active_scenario()
    if active_scenario:
        db.clear_scenario_whatif(active_scenario["id"])
    else:
        db.clear_adhoc_whatif()
    return {"success": True}


@router.delete("/whatif/state")
def clear_whatif_state():
    """Clear all what-if state (both permanent and scenario overrides)."""
    db.clear_all_whatif()
    return {"success": True}


@router.post("/whatif/promote/game-outcome")
def promote_game_outcome(request: PromoteOverrideRequest):
    """Promote a game outcome from the active scenario (or ad-hoc) to permanent."""
    if not request.team1 or not request.team2:
        raise HTTPException(status_code=400, detail="team1 and team2 are required")

    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    promoted = db.promote_game_outcome_to_permanent(
        request.team1, request.team2, scenario_id
    )
    if not promoted:
        raise HTTPException(status_code=404, detail="Game outcome not found")
    return {"success": True}


@router.post("/whatif/promote/rating-adjustment")
def promote_rating_adjustment(request: PromoteOverrideRequest):
    """Promote a rating adjustment from the active scenario (or ad-hoc) to permanent."""
    if not request.team:
        raise HTTPException(status_code=400, detail="team is required")

    active_scenario = db.get_active_scenario()
    scenario_id = active_scenario["id"] if active_scenario else None

    promoted = db.promote_rating_adjustment_to_permanent(
        request.team, scenario_id
    )
    if not promoted:
        raise HTTPException(status_code=404, detail="Rating adjustment not found")
    return {"success": True}
