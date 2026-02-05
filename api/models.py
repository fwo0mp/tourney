"""Pydantic models for API request/response schemas."""

from pydantic import BaseModel


class TeamInfo(BaseModel):
    """Team information with ratings, scores, and portfolio data."""

    name: str
    offense: float
    defense: float
    tempo: float
    seed: int | None = None
    expected_score: float
    position: float = 0.0
    delta: float = 0.0
    is_eliminated: bool = False


class HistogramBin(BaseModel):
    """A single bin in a histogram."""

    bin_start: float
    bin_end: float
    count: int


class PortfolioSummary(BaseModel):
    """Portfolio value distribution from Monte Carlo simulations."""

    expected_value: float
    min_value: float
    max_value: float
    p1: float
    p5: float
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float
    p99: float
    histogram: list[HistogramBin] = []


class GameImpact(BaseModel):
    """Impact of a game outcome on portfolio value."""

    team1: str
    team2: str
    win_prob: float
    if_team1_wins: float
    if_team2_wins: float
    swing: float


class TeamDeltaInfo(BaseModel):
    """Team delta details for portfolio sensitivity."""

    team: str
    position: float
    delta_per_share: float
    total_delta: float


class GameDeltaResponse(BaseModel):
    """Response for game delta analysis."""

    team1: str
    team2: str
    win_prob: float
    if_team1_wins: float
    if_team2_wins: float
    swing: float
    team_impacts: list[TeamDeltaInfo]


class WhatIfGameOutcome(BaseModel):
    """A game outcome for what-if analysis."""

    winner: str
    loser: str


class CompletedGame(BaseModel):
    """A completed tournament game."""

    winner: str
    loser: str


class WhatIfRequest(BaseModel):
    """Request for what-if scenario analysis."""

    game_outcomes: list[WhatIfGameOutcome] = []
    rating_adjustments: dict[str, float] = {}


class WhatIfResponse(BaseModel):
    """Response for what-if scenario analysis."""

    original_value: float
    modified_value: float
    delta: float
    original_scores: dict[str, float]
    modified_scores: dict[str, float]


class WhatIfStateResponse(BaseModel):
    """Persisted what-if state."""

    game_outcomes: list[WhatIfGameOutcome] = []
    rating_adjustments: dict[str, float] = {}


class BracketGame(BaseModel):
    """A game in the bracket."""

    id: str
    round: int
    region: str | None
    teams: dict[str, float]  # team_name -> win_probability


class PlayInGame(BaseModel):
    """A play-in game where two teams compete for one spot in round 0."""

    id: str
    slot_index: int  # Which round 0 slot this feeds into
    region: str | None
    team1: str
    team2: str
    team1_prob: float  # Probability team1 wins
    team2_prob: float  # Probability team2 wins


class BracketResponse(BaseModel):
    """Full bracket structure for visualization."""

    games: list[BracketGame]
    play_in_games: list[PlayInGame] = []  # Play-in games (Round -1)
    num_teams: int
    num_rounds: int
    completed_games: list[CompletedGame] = []
    eliminated_teams: list[str] = []


class PositionsResponse(BaseModel):
    """Current portfolio positions."""

    positions: dict[str, float]
    cash_balance: float
    is_mock: bool


class DeltasResponse(BaseModel):
    """All team deltas for portfolio sensitivity."""

    deltas: dict[str, float]
    pairwise: dict[str, dict[str, float]]


class SlotCandidate(BaseModel):
    """A candidate team for a bracket slot."""

    team: str
    probability: float
    portfolio_delta: float


class SlotCandidatesResponse(BaseModel):
    """Response for slot candidates query."""

    round: int
    position: int
    candidates: list[SlotCandidate]


class ComputePathRequest(BaseModel):
    """Request to compute path for team to reach a slot."""

    team: str
    round: int
    position: int
    current_outcomes: list[WhatIfGameOutcome] = []


class ComputePathResponse(BaseModel):
    """Response with required game outcomes for team to reach slot."""

    required_outcomes: list[WhatIfGameOutcome]


class HypotheticalValueRequest(BaseModel):
    """Request for hypothetical portfolio value calculation."""

    position_changes: dict[str, float]  # team name -> quantity change (+/-)


class HypotheticalValueResponse(BaseModel):
    """Response for hypothetical portfolio value calculation."""

    current_value: float
    hypothetical_value: float
    delta: float
    hypothetical_positions: dict[str, float]
    # Cash balance info (unchanged by position changes, but useful for display)
    current_cash: float
    # Total portfolio value including cash
    current_total: float  # current_value + current_cash
    hypothetical_total: float  # hypothetical_value + current_cash (trade cost not included here)


class ScoringConfig(BaseModel):
    """Tournament scoring configuration."""

    round_points: list[float]  # Points per round [round1, round2, ...]
    max_score: float  # Maximum possible score (sum of all round points)
    num_rounds: int  # Number of rounds


# Tree-based bracket models


class BracketTreeNode(BaseModel):
    """A node in the tournament bracket tree.

    Each node represents a slot in the bracket where a team can be.
    Nodes form a binary tree where the winner of each node advances
    to the parent node.
    """

    # Identity
    id: str  # e.g., "south-R0-P5" or "finals-R5-P0"
    round: int  # -1 for play-in, 0 for first round, 1 for second, etc.
    position: int  # Position within this round (0-indexed)
    region: str | None = None  # "south", "east", "midwest", "west", or None for finals

    # Tree relationships (IDs for JSON serialization)
    parent_id: str | None = None  # Node the winner advances to
    left_child_id: str | None = None  # Top/higher seed child
    right_child_id: str | None = None  # Bottom/lower seed child

    # Team data
    teams: dict[str, float]  # team_name -> probability of being in this slot

    # State flags
    is_play_in: bool = False
    is_championship: bool = False
    is_completed: bool = False  # Has a winner been determined?
    winner: str | None = None  # Team name if completed


class BracketTree(BaseModel):
    """Complete tournament bracket as a tree structure.

    The tree is stored as a flat dict of nodes for efficient lookup,
    with explicit parent/child relationships via IDs.
    """

    # Node storage (flat map for efficient lookup)
    nodes: dict[str, BracketTreeNode]  # id -> node

    # Entry points
    root_id: str  # Championship game node
    leaf_ids: list[str]  # All first-round (or play-in) leaf nodes

    # Metadata
    num_teams: int
    num_rounds: int
    regions: list[str]  # e.g., ["south", "east", "midwest", "west"]

    # Backward compatibility index: maps (round, position) to node_id
    # Key format: "R{round}-P{position}" e.g., "R0-P5"
    position_index: dict[str, str]


class BracketTreeResponse(BaseModel):
    """API response containing bracket tree with game state."""

    tree: BracketTree
    completed_games: list[CompletedGame] = []
    eliminated_teams: list[str] = []
