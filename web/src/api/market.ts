import { api } from './client';
import type {
  OrderbookResponse,
  MakeMarketRequest,
  MakeMarketResponse,
  MyMarketsResponse,
} from '../types';

export const marketApi = {
  getOrderbook: (team: string) =>
    api.get<OrderbookResponse>(`/market/${encodeURIComponent(team)}/orderbook`),

  makeMarket: (team: string, request: MakeMarketRequest) =>
    api.post<MakeMarketResponse>(`/market/${encodeURIComponent(team)}/make-market`, request),

  getMyMarkets: () =>
    api.get<MyMarketsResponse>('/market/my-markets'),
};
