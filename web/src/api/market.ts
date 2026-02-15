import { api } from './client';
import type { MarketOverviewResponse } from '../types';

export const marketApi = {
  getOverview: () => api.get<MarketOverviewResponse>('/market/overview'),
};
