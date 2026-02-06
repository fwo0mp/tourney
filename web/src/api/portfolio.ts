import { api } from './client';
import type {
  PositionsResponse,
  PortfolioSummary,
  DeltasResponse,
  WhatIfState,
  HypotheticalValueResponse,
  PortfolioValueResponse,
} from '../types';

function encodeWhatIfParams(whatIf?: WhatIfState): URLSearchParams {
  const params = new URLSearchParams();
  if (!whatIf) return params;

  // Combine permanent and scenario overrides
  const allOutcomes = [
    ...whatIf.permanentGameOutcomes,
    ...whatIf.scenarioGameOutcomes,
  ];
  const allAdjustments = {
    ...whatIf.permanentRatingAdjustments,
    ...whatIf.scenarioRatingAdjustments,
  };

  if (allOutcomes.length > 0) {
    params.set('what_if_outcomes', JSON.stringify(allOutcomes));
  }
  if (Object.keys(allAdjustments).length > 0) {
    params.set('what_if_adjustments', JSON.stringify(allAdjustments));
  }
  return params;
}

export const portfolioApi = {
  getPositions: () => api.get<PositionsResponse>('/portfolio/positions'),
  getValue: (whatIf?: WhatIfState) => {
    const params = encodeWhatIfParams(whatIf);
    const queryString = params.toString();
    return api.get<PortfolioValueResponse>(`/portfolio/value${queryString ? `?${queryString}` : ''}`);
  },
  getDistribution: (nSimulations = 10000, whatIf?: WhatIfState) => {
    const params = encodeWhatIfParams(whatIf);
    params.set('n_simulations', String(nSimulations));
    return api.get<PortfolioSummary>(`/portfolio/distribution?${params.toString()}`);
  },
  getDeltas: (pointDelta = 1.0) =>
    api.get<DeltasResponse>(`/portfolio/deltas?point_delta=${pointDelta}`),
  getTeamImpact: (teamName: string, pointDelta = 1.0) =>
    api.get<{
      team: string;
      portfolio_delta: number;
      breakdown: Array<{
        holding: string;
        position: number;
        ev_delta: number;
        portfolio_impact: number;
      }>;
    }>(`/portfolio/team/${encodeURIComponent(teamName)}/impact?point_delta=${pointDelta}`),

  getHypotheticalValue: (positionChanges: Record<string, number>, whatIf?: WhatIfState) => {
    const params = encodeWhatIfParams(whatIf);
    const queryString = params.toString();
    return api.post<HypotheticalValueResponse>(
      `/portfolio/hypothetical-value${queryString ? `?${queryString}` : ''}`,
      { position_changes: positionChanges }
    );
  },
};
