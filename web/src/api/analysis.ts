import { api } from './client';
import type {
  GameImpact,
  GameDeltaResponse,
  WhatIfRequest,
  WhatIfResponse,
  SlotCandidatesResponse,
  ComputePathRequest,
  ComputePathResponse,
  WhatIfState,
} from '../types';

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

export const analysisApi = {
  getUpcomingGames: (topN = 10) =>
    api.get<GameImpact[]>(`/analysis/games/upcoming?top_n=${topN}`),
  getGameImpact: (team1: string, team2: string) =>
    api.get<GameDeltaResponse>(`/analysis/game/${encodeURIComponent(team1)}/${encodeURIComponent(team2)}`),
  analyzeWhatIf: (request: WhatIfRequest) =>
    api.post<WhatIfResponse>('/analysis/what-if', request),
  getSlotCandidates: (round: number, position: number, whatIf: WhatIfState | null = null) =>
    api.get<SlotCandidatesResponse>(
      `/analysis/slot/${round}/${position}/candidates${encodeWhatIfParams(whatIf)}`
    ),
  computePath: (request: ComputePathRequest) =>
    api.post<ComputePathResponse>('/analysis/compute-path', request),

  // What-If State Persistence
  getWhatIfState: async (): Promise<WhatIfState> => {
    const response = await api.get<{
      game_outcomes: { winner: string; loser: string }[];
      rating_adjustments: Record<string, number>;
    }>('/analysis/whatif/state');
    return {
      gameOutcomes: response.game_outcomes || [],
      ratingAdjustments: response.rating_adjustments || {},
    };
  },
  setWhatIfGameOutcome: (winner: string, loser: string) =>
    api.post<{ success: boolean }>('/analysis/whatif/game-outcome', { winner, loser }),
  removeWhatIfGameOutcome: (winner: string, loser: string) =>
    api.delete<{ success: boolean }>(
      `/analysis/whatif/game-outcome?winner=${encodeURIComponent(winner)}&loser=${encodeURIComponent(loser)}`
    ),
  setWhatIfRatingAdjustment: (team: string, adjustment: number) =>
    api.post<{ success: boolean }>(
      `/analysis/whatif/rating-adjustment?team=${encodeURIComponent(team)}&adjustment=${adjustment}`,
      {}
    ),
  removeWhatIfRatingAdjustment: (team: string) =>
    api.delete<{ success: boolean }>(`/analysis/whatif/rating-adjustment/${encodeURIComponent(team)}`),
  clearWhatIfState: () =>
    api.delete<{ success: boolean }>('/analysis/whatif/state'),
};
