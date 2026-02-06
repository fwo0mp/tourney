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
  team1: string;
  team2: string;
  probability: number; // Probability that team1 wins (0.0 to 1.0)
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
  // Permanent overrides (always applied)
  permanentGameOutcomes: WhatIfGameOutcome[];
  permanentRatingAdjustments: Record<string, number>;
  // Scenario-specific overrides (only when scenario is active)
  scenarioGameOutcomes: WhatIfGameOutcome[];
  scenarioRatingAdjustments: Record<string, number>;
  // Active scenario info
  activeScenarioId: number | null;
  activeScenarioName: string | null;
}

// Scenario for what-if analysis
export interface Scenario {
  id: number;
  name: string;
  description: string | null;
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

// Tree-based bracket types

/**
 * A node in the tournament bracket tree.
 * Each node represents a slot where a team can be.
 * Nodes form a binary tree where winners advance to parent nodes.
 */
export interface BracketTreeNode {
  // Identity
  id: string;  // e.g., "south-R0-P5" or "finals-R5-P0"
  round: number;  // -1 for play-in, 0 for first round, etc.
  position: number;  // Position within this round (0-indexed)
  region: string | null;  // "south", "east", etc., or null for finals

  // Tree relationships (IDs for JSON serialization)
  parent_id: string | null;  // Node the winner advances to
  left_child_id: string | null;  // Top/higher seed child
  right_child_id: string | null;  // Bottom/lower seed child

  // Team data
  teams: Record<string, number>;  // team_name -> probability

  // State flags
  is_play_in: boolean;
  is_championship: boolean;
  is_completed: boolean;  // Has a winner been determined?
  winner: string | null;  // Team name if completed
}

/**
 * Complete tournament bracket as a tree structure.
 * Stored as a flat dict for efficient lookup with explicit relationships.
 */
export interface BracketTree {
  // Node storage
  nodes: Record<string, BracketTreeNode>;  // id -> node

  // Entry points
  root_id: string;  // Championship game node
  leaf_ids: string[];  // All first-round (or play-in) leaf nodes

  // Metadata
  num_teams: number;
  num_rounds: number;
  regions: string[];  // e.g., ["south", "east", "midwest", "west"]

  // Backward compatibility index
  // Key format: "R{round}-P{position}" e.g., "R0-P5"
  position_index: Record<string, string>;  // position key -> node_id
}

/**
 * API response containing bracket tree with game state.
 */
export interface BracketTreeResponse {
  tree: BracketTree;
  completed_games: CompletedGame[];
  eliminated_teams: string[];
}

/**
 * Helper functions for navigating the bracket tree.
 */
export interface BracketTreeHelpers {
  getNode(id: string): BracketTreeNode | undefined;
  getParent(node: BracketTreeNode): BracketTreeNode | undefined;
  getLeftChild(node: BracketTreeNode): BracketTreeNode | undefined;
  getRightChild(node: BracketTreeNode): BracketTreeNode | undefined;
  getSibling(node: BracketTreeNode): BracketTreeNode | undefined;
  getPathToRoot(node: BracketTreeNode): BracketTreeNode[];
  getNodeByPosition(round: number, position: number): BracketTreeNode | undefined;
}
