import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketApi } from '../api/market';
import type { MakeMarketRequest } from '../types';

export function useOrderbook(team: string | null) {
  return useQuery({
    queryKey: ['market', 'orderbook', team],
    queryFn: () => marketApi.getOrderbook(team!),
    enabled: !!team,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useMyMarkets() {
  return useQuery({
    queryKey: ['market', 'my-markets'],
    queryFn: marketApi.getMyMarkets,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useMakeMarket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ team, request }: { team: string; request: MakeMarketRequest }) =>
      marketApi.makeMarket(team, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market', 'orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['market', 'my-markets'] });
    },
  });
}
