import { api } from './client';
import type {
  MarketOverviewResponse,
  OrderbookResponse,
  MakeMarketRequest,
  MakeMarketResponse,
  MyMarketsResponse,
} from '../types';

export const marketApi = {
  getOverview: () => api.get<MarketOverviewResponse>('/market/overview'),

  getOrderbook: (team: string) =>
    api.get<OrderbookResponse>(`/market/${encodeURIComponent(team)}/orderbook`),

  makeMarket: (team: string, request: MakeMarketRequest) =>
    api.post<MakeMarketResponse>(`/market/${encodeURIComponent(team)}/make-market`, request),

  getMyMarkets: () =>
    api.get<MyMarketsResponse>('/market/my-markets'),
};
