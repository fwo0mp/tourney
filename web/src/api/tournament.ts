import { api } from './client';
import type { TeamInfo, BracketResponse, BracketTreeResponse, WhatIfState, CompletedGame, ScoringConfig } from '../types';

function encodeWhatIfParams(whatIf: WhatIfState | null): string {
  if (!whatIf) return '';
  const params = new URLSearchParams();
  if (whatIf.gameOutcomes.length > 0) {
    params.set('what_if_outcomes', JSON.stringify(whatIf.gameOutcomes));
  }
  if (Object.keys(whatIf.ratingAdjustments).length > 0) {
    params.set('what_if_adjustments', JSON.stringify(whatIf.ratingAdjustments));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

export const tournamentApi = {
  getTeams: (whatIf: WhatIfState | null = null) =>
    api.get<TeamInfo[]>(`/tournament/teams${encodeWhatIfParams(whatIf)}`),
  getTeam: (name: string) => api.get<TeamInfo>(`/tournament/teams/${encodeURIComponent(name)}`),
  getBracket: (whatIf: WhatIfState | null = null) =>
    api.get<BracketResponse>(`/tournament/bracket${encodeWhatIfParams(whatIf)}`),
  getBracketTree: (whatIf: WhatIfState | null = null) =>
    api.get<BracketTreeResponse>(`/tournament/bracket/tree${encodeWhatIfParams(whatIf)}`),
  getScores: () => api.get<Record<string, number>>('/tournament/scores'),
  getCompletedGames: () => api.get<CompletedGame[]>('/tournament/completed-games'),
  addCompletedGame: (winner: string, loser: string) =>
    api.post<CompletedGame>('/tournament/completed-games', { winner, loser }),
  removeCompletedGame: (winner: string, loser: string) =>
    api.delete<{ success: boolean }>(
      `/tournament/completed-games?winner=${encodeURIComponent(winner)}&loser=${encodeURIComponent(loser)}`
    ),
  getScoringConfig: () => api.get<ScoringConfig>('/tournament/scoring'),
};
