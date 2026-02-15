import { api } from './client';
import type { ExecutionsResponse } from '../types';

interface GetExecutionsParams {
  mineOnly?: boolean;
  since?: string;
  n?: number;
}

export const marketApi = {
  getExecutions: ({ mineOnly = true, since, n = 500 }: GetExecutionsParams = {}) => {
    const params = new URLSearchParams();
    params.set('mine_only', String(mineOnly));
    params.set('n', String(n));
    if (since) {
      params.set('since', since);
    }
    return api.get<ExecutionsResponse>(`/market/executions?${params.toString()}`);
  },
};
