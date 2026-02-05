export interface TeamInfo {
  name: string;
  offense: number;
  defense: number;
  tempo: number;
  seed: number | null;
  expected_score: number;
  position: number;
  delta: number;
  is_eliminated: boolean;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface PortfolioSummary {
  expected_value: number;
  min_value: number;
  max_value: number;
  p1: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  histogram: HistogramBin[];
}

export interface GameImpact {
  team1: string;
  team2: string;
  win_prob: number;
  if_team1_wins: number;
  if_team2_wins: number;
  swing: number;
}

export interface TeamDeltaInfo {
  team: string;
  position: number;
  delta_per_share: number;
  total_delta: number;
}

export interface GameDeltaResponse {
  team1: string;
  team2: string;
  win_prob: number;
  if_team1_wins: number;
  if_team2_wins: number;
  swing: number;
  team_impacts: TeamDeltaInfo[];
}

export interface BracketGame {
  id: string;
  round: number;
  region: string | null;
  teams: Record<string, number>;
}

export interface PlayInGame {
  id: string;
  slot_index: number;  // Which round 0 slot this feeds into
  region: string | null;
  team1: string;
  team2: string;
  team1_prob: number;
  team2_prob: number;
}

export interface BracketResponse {
  games: BracketGame[];
  play_in_games: PlayInGame[];
  num_teams: number;
  num_rounds: number;
  completed_games: CompletedGame[];
  eliminated_teams: string[];
}

export interface PositionsResponse {
  positions: Record<string, number>;
  cash_balance: number;
  is_mock: boolean;
}

export interface DeltasResponse {
  deltas: Record<string, number>;
  pairwise: Record<string, Record<string, number>>;
}

export interface WhatIfGameOutcome {
  winner: string;
  loser: string;
}

export interface CompletedGame {
  winner: string;
  loser: string;
}

export interface WhatIfRequest {
  game_outcomes: WhatIfGameOutcome[];
  rating_adjustments: Record<string, number>;
}

export interface WhatIfResponse {
  original_value: number;
  modified_value: number;
  delta: number;
  original_scores: Record<string, number>;
  modified_scores: Record<string, number>;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookResponse {
  team: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  is_mock: boolean;
  error?: string;
}

export interface SlotCandidate {
  team: string;
  probability: number;
  portfolio_delta: number;
}

export interface SlotCandidatesResponse {
  round: number;
  position: number;
  candidates: SlotCandidate[];
}

export interface ComputePathRequest {
  team: string;
  round: number;
  position: number;
  current_outcomes: WhatIfGameOutcome[];
}

export interface ComputePathResponse {
  required_outcomes: WhatIfGameOutcome[];
}

export interface WhatIfState {
  gameOutcomes: WhatIfGameOutcome[];
  ratingAdjustments: Record<string, number>;
}

// View modes for Dashboard tabs
export type ViewMode = 'overview' | 'bracket' | 'whatif' | 'completed' | 'teamdetail';

// Hypothetical trade for exploring potential trades
export interface HypotheticalTrade {
  team: string;
  direction: 'buy' | 'sell';
  quantity: number;
  price: number;
}

// Response from hypothetical value calculation
export interface HypotheticalValueResponse {
  current_value: number;
  hypothetical_value: number;
  delta: number;
  hypothetical_positions: Record<string, number>;
  // Cash balance info
  current_cash: number;
  // Total portfolio value including cash
  current_total: number;  // current_value + current_cash
  hypothetical_total: number;  // hypothetical_value + current_cash (trade cost not applied)
}

// Response from /portfolio/value endpoint
export interface PortfolioValueResponse {
  expected_value: number;
  cash_balance: number;
  total_value: number;
}

// Scoring configuration from /tournament/scoring
export interface ScoringConfig {
  round_points: number[];  // Points per round
  max_score: number;  // Maximum possible score (sum of round points)
  num_rounds: number;
}
