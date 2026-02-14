"""Tournament service for managing tournament state and calculations."""

import math
from pathlib import Path
from typing import Optional

import tourney_utils as tourney

from api import database as db
from api.models import BracketTree, BracketTreeNode, BracketTreeResponse, CompletedGame


class TournamentService:
    """Service for tournament calculations with caching."""

    _instance: Optional["TournamentService"] = None

    def __init__(self):
        self.state: Optional[tourney.TournamentState] = None
        self.ratings: dict = {}
        self.scores: dict = {}
        self.completed_games: list[tuple[str, str]] = []
        self._bracket_file = "bracket.txt"
        self._ratings_file = "ratings.txt"
        self._adjustments_file = "adjustments.txt"
        self._overrides_file = "overrides.txt"

    @classmethod
    def get_instance(cls) -> "TournamentService":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = TournamentService()
        return cls._instance

    def load(self, bracket_file: str = None, ratings_file: str = None):
        """Load tournament state from files."""
        bracket_path = bracket_file or self._bracket_file
        ratings_path = ratings_file or self._ratings_file

        # Check files exist
        if not Path(bracket_path).exists():
            raise FileNotFoundError(f"Bracket file not found: {bracket_path}")
        if not Path(ratings_path).exists():
            raise FileNotFoundError(f"Ratings file not found: {ratings_path}")

        # Load adjustments if available
        adjustments = None
        if Path(self._adjustments_file).exists():
            adjustments = tourney.read_adjustments_file(self._adjustments_file)

        # Load ratings
        self.ratings = tourney.read_ratings_file(ratings_path, adjustments)

        # Load overrides
        overrides = tourney.OverridesMap()
        if Path(self._overrides_file).exists():
            tourney.read_overrides_file(overrides, self._overrides_file)

        # Load bracket
        games = tourney.read_games_from_file(bracket_path, self.ratings, overrides)

        # Create tournament state (expands ratings with equivalence classes)
        self.state = tourney.TournamentState(
            bracket=games,
            ratings=self.ratings,
            scoring=list(tourney.ROUND_POINTS),
            overrides=overrides,
            forfeit_prob=0.0,
        )

        # Use expanded ratings (includes all name variants from equivalence classes)
        self.ratings = self.state.ratings

        # Load and apply completed games
        self.completed_games = self.load_completed_games()
        for winner, loser in self.completed_games:
            self.state = self.state.with_override(winner, loser, 1.0)

        # Calculate expected scores
        self.scores = self.state.calculate_scores_prob()

    def load_completed_games(self) -> list[tuple[str, str]]:
        """Load completed games from database."""
        return db.get_completed_games()

    def get_eliminated_teams(self) -> set[str]:
        """Get set of teams that have been eliminated."""
        return {loser for _, loser in self.completed_games}

    def ensure_loaded(self):
        """Ensure tournament state is loaded."""
        if self.state is None:
            self.load()

    def get_state(self) -> tourney.TournamentState:
        """Get tournament state, loading if necessary."""
        self.ensure_loaded()
        return self.state

    def get_effective_state(
        self,
        game_outcomes: list | None = None,
        rating_adjustments: dict | None = None,
    ) -> tourney.TournamentState:
        """Get base state with optional what-if modifications applied safely.

        Completed games are always respected, regardless of endpoint.
        """
        base_state = self.get_state()
        if not game_outcomes and not rating_adjustments:
            return base_state

        return apply_what_if(
            base_state,
            game_outcomes=game_outcomes,
            rating_adjustments=rating_adjustments,
            completed_games=self.completed_games,
        )

    def get_scores(self) -> dict:
        """Get expected scores for all teams."""
        self.ensure_loaded()
        return self.scores

    def get_team_info(self, team_name: str) -> dict:
        """Get detailed info for a single team."""
        self.ensure_loaded()
        if team_name not in self.ratings:
            raise KeyError(f"Team not found: {team_name}")

        team = self.ratings[team_name]
        return {
            "name": team.name,
            "offense": team.offense,
            "defense": team.defense,
            "tempo": team.tempo,
            "expected_score": self.scores.get(team_name, 0.0),
        }

    def calculate_win_prob(self, team1_name: str, team2_name: str) -> float:
        """Calculate win probability for a matchup."""
        self.ensure_loaded()
        team1 = self.ratings.get(team1_name)
        team2 = self.ratings.get(team2_name)

        if not team1:
            raise KeyError(f"Team not found: {team1_name}")
        if not team2:
            raise KeyError(f"Team not found: {team2_name}")

        return tourney.calculate_win_prob(
            team1, team2, self.state.overrides, self.state.forfeit_prob
        )

    def run_simulations(self, n_simulations: int = 10000, seed: int = None) -> list[dict]:
        """Run Monte Carlo simulations."""
        self.ensure_loaded()
        return self.state.run_simulations(n_simulations, seed)

    def with_override(self, team1: str, team2: str, prob: float) -> tourney.TournamentState:
        """Create modified state with game outcome override."""
        self.ensure_loaded()
        return self.state.with_override(team1, team2, prob)

    def with_team_adjustment(self, team: str, delta: float) -> tourney.TournamentState:
        """Create modified state with rating adjustment."""
        self.ensure_loaded()
        return self.state.with_team_adjustment(team, delta)


def get_tournament_service() -> TournamentService:
    """Dependency injection for tournament service."""
    return TournamentService.get_instance()


def apply_what_if(
    state: tourney.TournamentState,
    game_outcomes: list = None,
    rating_adjustments: dict = None,
    completed_games: list[tuple[str, str]] = None,
) -> tourney.TournamentState:
    """Apply what-if modifications to a tournament state.

    Respects completed games: if a team has already been eliminated,
    what-if outcomes that have them winning are silently ignored.
    """
    modified_state = state

    # Build set of eliminated teams (losers of completed games)
    eliminated = set()
    if completed_games:
        eliminated = {loser for _, loser in completed_games}

    if game_outcomes:
        for outcome in game_outcomes:
            # Support both dict and object access
            if hasattr(outcome, 'team1'):
                team1 = outcome.team1
                team2 = outcome.team2
                prob = outcome.probability
            else:
                team1 = outcome.get("team1")
                team2 = outcome.get("team2")
                prob = outcome.get("probability", 1.0)

            # Skip if either team is already eliminated
            if team1 in eliminated or team2 in eliminated:
                continue

            modified_state = modified_state.with_override(team1, team2, prob)

    if rating_adjustments:
        for team_name, delta in rating_adjustments.items():
            modified_state = modified_state.with_team_adjustment(team_name, delta)

    return modified_state


def compute_bracket_rounds(state: tourney.TournamentState) -> list[list[dict]]:
    """Compute all rounds of the bracket with team probabilities.

    Returns a list of rounds, where each round is a list of slots.
    Each slot is a dict of team -> probability.
    """
    bracket = state.bracket  # Round 0 games
    rounds = [list(bracket)]  # Start with round 0

    current_round = list(bracket)
    while len(current_round) > 1:
        next_round = []
        # Pair up games and compute winners
        for i in range(0, len(current_round), 2):
            game1 = current_round[i]
            game2 = current_round[i + 1]

            # Compute probability each team reaches this slot
            winner_probs = {}
            for team1, prob1 in game1.items():
                for team2, prob2 in game2.items():
                    # Get win probability
                    t1 = state.ratings.get(team1)
                    t2 = state.ratings.get(team2)
                    if t1 and t2:
                        win_prob = tourney.calculate_win_prob(
                            t1, t2, state.overrides, state.forfeit_prob
                        )
                        # Probability team1 reaches and wins
                        p1_wins = prob1 * prob2 * win_prob
                        # Probability team2 reaches and wins
                        p2_wins = prob1 * prob2 * (1 - win_prob)

                        winner_probs[team1] = winner_probs.get(team1, 0) + p1_wins
                        winner_probs[team2] = winner_probs.get(team2, 0) + p2_wins

            next_round.append(winner_probs)

        rounds.append(next_round)
        current_round = next_round

    return rounds


def get_slot_teams(state: tourney.TournamentState, target_round: int, position: int) -> dict:
    """Get teams that can reach a specific slot with their probabilities."""
    rounds = compute_bracket_rounds(state)

    if target_round >= len(rounds):
        return {}

    round_slots = rounds[target_round]
    if position >= len(round_slots):
        return {}

    return round_slots[position]


def compute_path_to_slot_with_rounds(
    state: tourney.TournamentState,
    rounds: list[list[dict]],
    team: str,
    target_round: int,
    target_position: int,
) -> list[tuple[str, str]]:
    """Compute the game outcomes (winner, loser) needed for team to reach slot.

    This version accepts precomputed rounds to avoid redundant computation.

    Returns a list of (winner, loser) tuples for all games the team must win.
    The team must beat ALL possible opponents they could face, not just the most likely.
    """
    # Find team's starting position in round 0
    bracket = state.bracket
    start_pos = None
    for i, game in enumerate(bracket):
        if team in game:
            start_pos = i
            break

    if start_pos is None:
        return []  # Team not in bracket

    if target_round < 0:
        return []

    if target_round >= len(rounds):
        return []

    # A team can only reach one deterministic slot per round based on its start slot.
    expected_target_position = start_pos // (2 ** target_round)
    if expected_target_position != target_position:
        return []

    outcomes = []
    current_pos = start_pos

    # Handle play-in games (round 0 slots with 2 teams)
    # If the team is in a play-in game, they must beat their play-in opponent first
    if start_pos < len(bracket):
        starting_slot = bracket[start_pos]
        if len(starting_slot) == 2 and team in starting_slot:
            # This is a play-in game - team must beat the other team
            for other_team in starting_slot.keys():
                if other_team != team:
                    outcomes.append((team, other_team))
                    break

    # If target_round is 0, we only need the play-in outcome (already added above)
    # For higher rounds, continue computing path
    for round_num in range(target_round):
        if round_num >= len(rounds):
            break

        round_slots = rounds[round_num]

        # Find the slot in this round where our team could be
        if current_pos >= len(round_slots):
            break

        slot = round_slots[current_pos]
        if team not in slot:
            break  # Team can't reach this point

        # Find the opposing slot
        if current_pos % 2 == 0:
            opponent_pos = current_pos + 1
        else:
            opponent_pos = current_pos - 1

        if opponent_pos >= len(round_slots):
            break

        opponent_slot = round_slots[opponent_pos]

        # The team must beat ALL possible opponents from the opposing slot
        if opponent_slot:
            for opponent in opponent_slot.keys():
                if opponent != team:  # Don't add self as opponent
                    outcomes.append((team, opponent))

        # Update position for next round (positions halve each round)
        current_pos = current_pos // 2

    return outcomes


def compute_path_to_slot(
    state: tourney.TournamentState,
    team: str,
    target_round: int,
    target_position: int,
) -> list[tuple[str, str]]:
    """Compute the game outcomes (winner, loser) needed for team to reach slot.

    Returns a list of (winner, loser) tuples for all games the team must win.
    The team must beat ALL possible opponents they could face, not just the most likely.
    """
    rounds = compute_bracket_rounds(state)
    return compute_path_to_slot_with_rounds(state, rounds, team, target_round, target_position)


def _get_region_name(slot_index: int, num_teams: int) -> str | None:
    """Get region name for a first-round slot based on its index."""
    if num_teams != 64:
        return None

    teams_per_region = num_teams // 4
    if slot_index < teams_per_region:
        return "south"
    elif slot_index < 2 * teams_per_region:
        return "east"
    elif slot_index < 3 * teams_per_region:
        return "midwest"
    else:
        return "west"


def _make_node_id(region: str | None, round_num: int, position: int) -> str:
    """Create a node ID from region, round, and position."""
    if region:
        return f"{region}-R{round_num}-P{position}"
    else:
        return f"finals-R{round_num}-P{position}"


def build_bracket_tree(
    state: tourney.TournamentState,
    completed_games: list[tuple[str, str]] | None = None,
) -> BracketTree:
    """Build a tree representation of the tournament bracket.

    Converts the flat bracket structure to an explicit tree with parent/child
    references. Play-in games (slots with 2 teams in round 0) become round -1 nodes.

    Args:
        state: The tournament state with bracket and ratings
        completed_games: List of (winner, loser) tuples for completed games

    Returns:
        BracketTree with all nodes and relationships
    """
    bracket = state.bracket
    num_teams = len(bracket)
    num_rounds = int(math.log2(num_teams))

    # Compute all rounds (probabilities propagated through bracket)
    rounds = compute_bracket_rounds(state)

    # Build set of completed game outcomes for marking winners
    completed_winners = set()
    completed_losers = set()
    if completed_games:
        for winner, loser in completed_games:
            completed_winners.add((winner, loser))
            completed_losers.add(loser)

    nodes: dict[str, BracketTreeNode] = {}
    leaf_ids: list[str] = []
    position_index: dict[str, str] = {}
    regions: list[str] = []

    # Determine regions from first round
    seen_regions = set()
    for i in range(num_teams):
        region = _get_region_name(i, num_teams)
        if region and region not in seen_regions:
            seen_regions.add(region)
            regions.append(region)

    # Build nodes for all rounds
    for round_num, round_slots in enumerate(rounds):
        for pos, teams in enumerate(round_slots):
            # Determine region based on which first-round slots feed into this one
            # For round R, position P, the first slot is P * 2^R
            first_slot = pos * (2 ** round_num)
            region = _get_region_name(first_slot, num_teams) if round_num < num_rounds - 1 else None

            node_id = _make_node_id(region, round_num, pos)

            # Determine if this slot has a winner from completed games
            is_completed = False
            winner = None
            # A slot is completed if one team has 100% probability due to game result
            if len(teams) == 1:
                team_name = list(teams.keys())[0]
                prob = list(teams.values())[0]
                if prob >= 0.9999:
                    is_completed = True
                    winner = team_name

            # Parent ID: in next round at position // 2
            parent_id = None
            if round_num < len(rounds) - 1:
                parent_first_slot = (pos // 2) * (2 ** (round_num + 1))
                parent_region = _get_region_name(parent_first_slot, num_teams) if round_num + 1 < num_rounds - 1 else None
                parent_id = _make_node_id(parent_region, round_num + 1, pos // 2)

            # Child IDs: in previous round at positions pos*2 and pos*2+1
            left_child_id = None
            right_child_id = None
            if round_num > 0:
                child_first_slot = pos * 2 * (2 ** (round_num - 1))
                child_region = _get_region_name(child_first_slot, num_teams) if round_num - 1 < num_rounds - 1 else None
                child_region_2 = _get_region_name(child_first_slot + (2 ** (round_num - 1)), num_teams) if round_num - 1 < num_rounds - 1 else None
                left_child_id = _make_node_id(child_region, round_num - 1, pos * 2)
                right_child_id = _make_node_id(child_region_2, round_num - 1, pos * 2 + 1)

            node = BracketTreeNode(
                id=node_id,
                round=round_num,
                position=pos,
                region=region,
                parent_id=parent_id,
                left_child_id=left_child_id,
                right_child_id=right_child_id,
                teams=dict(teams),
                is_play_in=False,
                is_championship=(round_num == len(rounds) - 1),
                is_completed=is_completed,
                winner=winner,
            )
            nodes[node_id] = node
            position_index[f"R{round_num}-P{pos}"] = node_id

            # Track leaf nodes (round 0)
            if round_num == 0:
                leaf_ids.append(node_id)

    # Handle play-in games: create round -1 nodes for slots with 2 teams
    play_in_leaf_ids = []
    for i, game in enumerate(bracket):
        if len(game) == 2:
            # This is a play-in game
            region = _get_region_name(i, num_teams)
            play_in_id = _make_node_id(region, -1, i)

            # Find winner if completed
            teams_list = list(game.keys())
            team1, team2 = teams_list[0], teams_list[1]
            is_completed = False
            winner = None
            if (team1, team2) in completed_winners:
                is_completed = True
                winner = team1
            elif (team2, team1) in completed_winners:
                is_completed = True
                winner = team2

            # Parent is the round 0 slot at same position
            parent_id = _make_node_id(region, 0, i)

            play_in_node = BracketTreeNode(
                id=play_in_id,
                round=-1,
                position=i,
                region=region,
                parent_id=parent_id,
                left_child_id=None,
                right_child_id=None,
                teams=dict(game),
                is_play_in=True,
                is_championship=False,
                is_completed=is_completed,
                winner=winner,
            )
            nodes[play_in_id] = play_in_node
            position_index[f"R-1-P{i}"] = play_in_id

            # Update the round 0 node to point to this play-in as its child
            round_0_node = nodes.get(parent_id)
            if round_0_node:
                # Play-in is treated as a single child (the game itself)
                round_0_node.left_child_id = play_in_id

            # Play-in nodes are also leaves
            play_in_leaf_ids.append(play_in_id)

    # Add play-in leaf IDs to the leaf list
    leaf_ids.extend(play_in_leaf_ids)

    # Root is the championship node
    root_id = position_index[f"R{len(rounds) - 1}-P0"]

    return BracketTree(
        nodes=nodes,
        root_id=root_id,
        leaf_ids=leaf_ids,
        num_teams=num_teams,
        num_rounds=num_rounds,
        regions=regions,
        position_index=position_index,
    )


def build_bracket_tree_response(
    state: tourney.TournamentState,
    completed_games: list[tuple[str, str]] | None = None,
) -> BracketTreeResponse:
    """Build a complete bracket tree response with game state.

    Args:
        state: The tournament state
        completed_games: List of (winner, loser) tuples

    Returns:
        BracketTreeResponse with tree and game state
    """
    tree = build_bracket_tree(state, completed_games)

    # Convert completed games to model format
    completed = [CompletedGame(winner=w, loser=l) for w, l in (completed_games or [])]
    eliminated = [l for _, l in (completed_games or [])]

    return BracketTreeResponse(
        tree=tree,
        completed_games=completed,
        eliminated_teams=eliminated,
    )

