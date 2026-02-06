import { api, encodeWhatIfParams } from './client';
import type {
  GameImpact,
  GameDeltaResponse,
  WhatIfRequest,
  WhatIfResponse,
  SlotCandidatesResponse,
  ComputePathRequest,
  ComputePathResponse,
  WhatIfState,
  Scenario,
} from '../types';

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

  // Scenario Management
  getScenarios: () => api.get<Scenario[]>('/analysis/scenarios'),
  createScenario: (name: string, description?: string) =>
    api.post<Scenario>('/analysis/scenarios', { name, description }),
  deleteScenario: (scenarioId: number) =>
    api.delete<{ success: boolean }>(`/analysis/scenarios/${scenarioId}`),
  getActiveScenario: () => api.get<Scenario | null>('/analysis/scenarios/active'),
  setActiveScenario: (scenarioId: number | null) =>
    api.put<{ success: boolean }>('/analysis/scenarios/active', { scenario_id: scenarioId }),

  // What-If State Persistence
  getWhatIfState: async (): Promise<WhatIfState> => {
    const response = await api.get<{
      permanent_game_outcomes: { team1: string; team2: string; probability: number }[];
      permanent_rating_adjustments: Record<string, number>;
      scenario_game_outcomes: { team1: string; team2: string; probability: number }[];
      scenario_rating_adjustments: Record<string, number>;
      active_scenario_id: number | null;
      active_scenario_name: string | null;
    }>('/analysis/whatif/state');
    return {
      permanentGameOutcomes: response.permanent_game_outcomes || [],
      permanentRatingAdjustments: response.permanent_rating_adjustments || {},
      scenarioGameOutcomes: response.scenario_game_outcomes || [],
      scenarioRatingAdjustments: response.scenario_rating_adjustments || {},
      activeScenarioId: response.active_scenario_id,
      activeScenarioName: response.active_scenario_name,
    };
  },

  setWhatIfGameOutcome: (team1: string, team2: string, probability: number, isPermanent = false) =>
    api.post<{ success: boolean }>('/analysis/whatif/game-outcome', {
      team1,
      team2,
      probability,
      is_permanent: isPermanent,
    }),

  removeWhatIfGameOutcome: (team1: string, team2: string, isPermanent = false) =>
    api.delete<{ success: boolean }>(
      `/analysis/whatif/game-outcome?team1=${encodeURIComponent(team1)}&team2=${encodeURIComponent(team2)}&is_permanent=${isPermanent}`
    ),

  setWhatIfRatingAdjustment: (team: string, adjustment: number, isPermanent = false) =>
    api.post<{ success: boolean }>('/analysis/whatif/rating-adjustment', {
      team,
      adjustment,
      is_permanent: isPermanent,
    }),

  removeWhatIfRatingAdjustment: (team: string, isPermanent = false) =>
    api.delete<{ success: boolean }>(
      `/analysis/whatif/rating-adjustment/${encodeURIComponent(team)}?is_permanent=${isPermanent}`
    ),

  clearTemporaryOverrides: () =>
    api.delete<{ success: boolean }>('/analysis/whatif/temporary'),

  clearWhatIfState: () =>
    api.delete<{ success: boolean }>('/analysis/whatif/state'),

  // Promote overrides from scenario to permanent
  promoteGameOutcome: (team1: string, team2: string) =>
    api.post<{ success: boolean }>('/analysis/whatif/promote/game-outcome', { team1, team2 }),

  promoteRatingAdjustment: (team: string) =>
    api.post<{ success: boolean }>('/analysis/whatif/promote/rating-adjustment', { team }),
};
