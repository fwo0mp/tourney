import type { BracketGame, CompletedGame, WhatIfGameOutcome } from '../../types';

type GameOutcome = CompletedGame | WhatIfGameOutcome;

export function getDeltaColor(delta: number, maxDelta: number): string {
  // Color based on portfolio delta (sensitivity to team's rating change)
  if (delta === 0 || maxDelta === 0) return '#e5e7eb'; // gray-200
  const intensity = Math.min(Math.abs(delta) / maxDelta, 1);
  // Start from neutral gray (229) and interpolate toward green or red
  const neutral = 229; // gray-200
  if (delta > 0) {
    // Green gradient for positive delta (portfolio benefits from team improvement)
    const r = Math.round(neutral - intensity * 189); // 229 -> 40
    const g = Math.round(neutral + intensity * 26); // 229 -> 255
    const b = Math.round(neutral - intensity * 189); // 229 -> 40
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Red gradient for negative delta (portfolio hurt by team improvement)
  const r = Math.round(neutral + intensity * 26); // 229 -> 255
  const g = Math.round(neutral - intensity * 189); // 229 -> 40
  const b = Math.round(neutral - intensity * 189); // 229 -> 40
  return `rgb(${r}, ${g}, ${b})`;
}

export function getImportanceColor(importance: number, maxImportance: number): string {
  if (importance === 0 || maxImportance === 0) return '#d1d5db'; // gray-300
  const t = Math.min(importance / maxImportance, 1);
  // grey (#d1d5db = 209,213,219) -> deep blue (#1e40af = 30,64,175)
  return `rgb(${Math.round(209 - t * 179)}, ${Math.round(213 - t * 149)}, ${Math.round(219 - t * 44)})`;
}

export function makeGameKey(t1: string, t2: string): string {
  return t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
}

// Helper to get winner from an outcome (works with both formats)
export function getOutcomeWinner(
  outcome: GameOutcome
): { winner: string; loser: string } | null {
  if ('winner' in outcome) {
    return { winner: outcome.winner, loser: outcome.loser };
  }

  // New format: team1/team2/probability
  if (outcome.probability >= 0.9999) {
    return { winner: outcome.team1, loser: outcome.team2 };
  }
  if (outcome.probability <= 0.0001) {
    return { winner: outcome.team2, loser: outcome.team1 };
  }

  // Probabilistic outcome - no definite winner
  return null;
}

// Build a map of which team is in each slot based on game outcomes
// Returns Map of "round-slotIndex" -> team name
export function buildSlotMapFromOutcomes(games: BracketGame[], outcomes: GameOutcome[]): Map<string, string> {
  const slotMap = new Map<string, string>();

  if (outcomes.length === 0) return slotMap;

  // Create a map of winner -> teams they beat (their "path")
  const winnerBeats = new Map<string, Set<string>>();
  for (const outcome of outcomes) {
    const resolved = getOutcomeWinner(outcome);
    if (!resolved) continue; // Skip probabilistic outcomes
    if (!winnerBeats.has(resolved.winner)) {
      winnerBeats.set(resolved.winner, new Set());
    }
    winnerBeats.get(resolved.winner)?.add(resolved.loser);
  }

  // Create team -> round 0 slot index map
  const teamToR0Slot = new Map<string, number>();
  games.forEach((game, i) => {
    const teamNames = Object.keys(game.teams);
    teamNames.forEach((name) => teamToR0Slot.set(name, i));
  });

  // For each winner, trace their path through the bracket
  for (const [winner, beatSet] of winnerBeats.entries()) {
    const r0Slot = teamToR0Slot.get(winner);
    if (r0Slot === undefined) continue;

    // Check each round - calculate positions directly from R0 slot
    for (let round = 1; round <= 4; round++) {
      // Team's slot in the previous round (round - 1)
      // At round R-1, team is at slot floor(r0Slot / 2^(R-1))
      const teamSlotInPrevRound = Math.floor(r0Slot / Math.pow(2, round - 1));

      // Opponent's slot in the previous round (XOR with 1 to get adjacent slot)
      const opponentSlotInPrevRound = teamSlotInPrevRound ^ 1;

      // Opponent could have come from any R0 slot in this range
      // Slot S in round R-1 contains teams from R0 slots [S * 2^(R-1), (S+1) * 2^(R-1))
      const opponentR0Start = opponentSlotInPrevRound * Math.pow(2, round - 1);
      const opponentR0End = opponentR0Start + Math.pow(2, round - 1);

      // Get all teams that could be in the opponent position
      const opponentTeams: string[] = [];
      for (let i = opponentR0Start; i < opponentR0End && i < games.length; i++) {
        opponentTeams.push(...Object.keys(games[i]?.teams ?? {}));
      }

      // Check if this winner has beaten any of those teams
      const hasBeatenOpponent = opponentTeams.some((team) => beatSet.has(team));

      if (hasBeatenOpponent) {
        // Team's slot in this round (after winning)
        const teamSlotInThisRound = Math.floor(r0Slot / Math.pow(2, round));
        slotMap.set(`${round}-${teamSlotInThisRound}`, winner);
      } else {
        // No win recorded for this round, stop tracing
        break;
      }
    }
  }

  return slotMap;
}

export function truncateTeamName(name: string, compact: boolean): string {
  const maxNameLen = compact ? 11 : 14;
  return name.length > maxNameLen ? `${name.substring(0, maxNameLen - 2)}..` : name;
}
