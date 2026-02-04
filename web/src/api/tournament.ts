import { api } from './client';
import type { TeamInfo, BracketResponse, WhatIfState } from '../types';

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
  getScores: () => api.get<Record<string, number>>('/tournament/scores'),
};
