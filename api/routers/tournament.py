"""Tournament API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from api.models import TeamInfo, BracketResponse, BracketGame, PlayInGame, CompletedGame, ScoringConfig, BracketTreeResponse
from api.services.tournament_service import TournamentService, get_tournament_service, apply_what_if, build_bracket_tree_response
from api.services.portfolio_service import PortfolioService, get_portfolio_service
from api.utils import parse_what_if_params
from api import database as db
import portfolio_value as pv
import tourney_utils as tourney

router = APIRouter(prefix="/tournament", tags=["tournament"])


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
            state = apply_what_if(state, outcomes, adjustments, tournament.completed_games)

        # Calculate scores with the (possibly modified) state
        scores = state.calculate_scores_prob()
        positions, _ = portfolio.get_positions()

        # Calculate deltas with the modified state
        team_deltas, _ = pv.get_all_team_deltas(positions, state)

        # Get eliminated teams
        eliminated = tournament.get_eliminated_teams()

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
                        is_eliminated=team_name in eliminated,
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
        eliminated = tournament.get_eliminated_teams()

        return TeamInfo(
            name=team["name"],
            offense=team["offense"],
            defense=team["defense"],
            tempo=team["tempo"],
            expected_score=team["expected_score"],
            position=positions.get(team_name, 0.0),
            delta=deltas.get(team_name, 0.0),
            is_eliminated=team_name in eliminated,
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
            state = apply_what_if(state, outcomes, adjustments, tournament.completed_games)

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

        # Build completed games list for response
        completed_games = [
            CompletedGame(winner=w, loser=l)
            for w, l in tournament.completed_games
        ]
        eliminated_teams = list(tournament.get_eliminated_teams())

        return BracketResponse(
            games=games,
            play_in_games=play_in_games,
            num_teams=num_teams,
            num_rounds=num_rounds,
            completed_games=completed_games,
            eliminated_teams=eliminated_teams,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/bracket/tree", response_model=BracketTreeResponse)
def get_bracket_tree(
    what_if_outcomes: str = Query(default=None, description="JSON-encoded game outcomes"),
    what_if_adjustments: str = Query(default=None, description="JSON-encoded rating adjustments"),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get bracket as an explicit tree structure.

    Returns a tree representation where each node has explicit parent/child
    references, eliminating the need for position arithmetic. Play-in games
    are represented as round -1 nodes.
    """
    try:
        # Apply what-if modifications if provided
        outcomes, adjustments = parse_what_if_params(what_if_outcomes, what_if_adjustments)
        state = tournament.get_state()
        if outcomes or adjustments:
            state = apply_what_if(state, outcomes, adjustments, tournament.completed_games)

        return build_bracket_tree_response(state, tournament.completed_games)
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


@router.get("/scoring", response_model=ScoringConfig)
def get_scoring_config():
    """Get tournament scoring configuration.

    Returns the points awarded per round and the maximum possible score.
    In mock mode, uses default ROUND_POINTS. When connected to CIX,
    this will fetch the actual scoring configuration from the market.
    """
    # TODO: When CIX integration is complete, fetch from CIX API if available
    # For now, always use the default ROUND_POINTS
    round_points = list(tourney.ROUND_POINTS)
    max_score = sum(round_points)

    return ScoringConfig(
        round_points=round_points,
        max_score=max_score,
        num_rounds=len(round_points),
    )


@router.get("/completed-games", response_model=list[CompletedGame])
def get_completed_games(
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Get all completed games."""
    tournament.ensure_loaded()
    return [
        CompletedGame(winner=winner, loser=loser)
        for winner, loser in tournament.completed_games
    ]


@router.post("/completed-games", response_model=CompletedGame)
def add_completed_game(
    game: CompletedGame,
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Add a completed game result."""
    tournament.ensure_loaded()

    # Verify both teams exist in the tournament
    bracket_teams = tournament.state.get_bracket_teams()
    if game.winner not in bracket_teams:
        raise HTTPException(status_code=400, detail=f"Team not in tournament: {game.winner}")
    if game.loser not in bracket_teams:
        raise HTTPException(status_code=400, detail=f"Team not in tournament: {game.loser}")

    # Check if winner is already eliminated
    eliminated = tournament.get_eliminated_teams()
    if game.winner in eliminated:
        raise HTTPException(status_code=400, detail=f"Team already eliminated: {game.winner}")

    # Add to database
    added = db.add_completed_game(game.winner, game.loser)
    if not added:
        raise HTTPException(status_code=400, detail="Game already recorded")

    # Reload tournament state to reflect the new completed game
    tournament.load()

    return game


@router.delete("/completed-games")
def remove_completed_game(
    winner: str = Query(..., description="Winning team name"),
    loser: str = Query(..., description="Losing team name"),
    tournament: TournamentService = Depends(get_tournament_service),
):
    """Remove a completed game result."""
    removed = db.remove_completed_game(winner, loser)
    if not removed:
        raise HTTPException(status_code=404, detail="Game not found")

    # Reload tournament state
    tournament.load()

    return {"success": True}
