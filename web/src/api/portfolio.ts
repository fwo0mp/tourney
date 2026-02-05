import { api } from './client';
import type { PositionsResponse, PortfolioSummary, DeltasResponse, WhatIfState } from '../types';

export const portfolioApi = {
  getPositions: () => api.get<PositionsResponse>('/portfolio/positions'),
  getValue: (whatIf?: WhatIfState) => {
    const params = new URLSearchParams();
    if (whatIf && whatIf.gameOutcomes.length > 0) {
      params.set('what_if_outcomes', JSON.stringify(whatIf.gameOutcomes));
    }
    if (whatIf && Object.keys(whatIf.ratingAdjustments).length > 0) {
      params.set('what_if_adjustments', JSON.stringify(whatIf.ratingAdjustments));
    }
    const queryString = params.toString();
    return api.get<{ expected_value: number }>(`/portfolio/value${queryString ? `?${queryString}` : ''}`);
  },
  getDistribution: (nSimulations = 10000, whatIf?: WhatIfState) => {
    const params = new URLSearchParams();
    params.set('n_simulations', String(nSimulations));
    if (whatIf && whatIf.gameOutcomes.length > 0) {
      params.set('what_if_outcomes', JSON.stringify(whatIf.gameOutcomes));
    }
    if (whatIf && Object.keys(whatIf.ratingAdjustments).length > 0) {
      params.set('what_if_adjustments', JSON.stringify(whatIf.ratingAdjustments));
    }
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
};
