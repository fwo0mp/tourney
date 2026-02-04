import { api } from './client';
import type { GameImpact, GameDeltaResponse, WhatIfRequest, WhatIfResponse } from '../types';

export const analysisApi = {
  getUpcomingGames: (topN = 10) =>
    api.get<GameImpact[]>(`/analysis/games/upcoming?top_n=${topN}`),
  getGameImpact: (team1: string, team2: string) =>
    api.get<GameDeltaResponse>(`/analysis/game/${encodeURIComponent(team1)}/${encodeURIComponent(team2)}`),
  analyzeWhatIf: (request: WhatIfRequest) =>
    api.post<WhatIfResponse>('/analysis/what-if', request),
};
