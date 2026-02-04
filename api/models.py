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


class BracketGame(BaseModel):
    """A game in the bracket."""

    id: str
    round: int
    region: str | None
    teams: dict[str, float]  # team_name -> win_probability


class BracketResponse(BaseModel):
    """Full bracket structure for visualization."""

    games: list[BracketGame]
    num_teams: int
    num_rounds: int


class PositionsResponse(BaseModel):
    """Current portfolio positions."""

    positions: dict[str, float]
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
