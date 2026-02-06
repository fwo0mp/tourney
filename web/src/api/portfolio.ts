import { api, encodeWhatIfParams } from './client';
import type {
  PositionsResponse,
  PortfolioSummary,
  DeltasResponse,
  WhatIfState,
  HypotheticalValueResponse,
  PortfolioValueResponse,
} from '../types';

export const portfolioApi = {
  getPositions: () => api.get<PositionsResponse>('/portfolio/positions'),
  getValue: (whatIf?: WhatIfState) =>
    api.get<PortfolioValueResponse>(`/portfolio/value${encodeWhatIfParams(whatIf)}`),
  getDistribution: (nSimulations = 10000, whatIf?: WhatIfState) => {
    const whatIfQs = encodeWhatIfParams(whatIf);
    const sep = whatIfQs ? '&' : '?';
    const base = `/portfolio/distribution${whatIfQs}`;
    return api.get<PortfolioSummary>(`${base}${sep}n_simulations=${nSimulations}`);
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

  getHypotheticalValue: (positionChanges: Record<string, number>, whatIf?: WhatIfState) =>
    api.post<HypotheticalValueResponse>(
      `/portfolio/hypothetical-value${encodeWhatIfParams(whatIf)}`,
      { position_changes: positionChanges }
    ),
};
