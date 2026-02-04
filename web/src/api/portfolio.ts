import { api } from './client';
import type { PositionsResponse, PortfolioSummary, DeltasResponse } from '../types';

export const portfolioApi = {
  getPositions: () => api.get<PositionsResponse>('/portfolio/positions'),
  getValue: () => api.get<{ expected_value: number }>('/portfolio/value'),
  getDistribution: (nSimulations = 10000) =>
    api.get<PortfolioSummary>(`/portfolio/distribution?n_simulations=${nSimulations}`),
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
