import { useQuery } from '@tanstack/react-query';
import { marketApi } from '../api/market';

export function useMarketOverview() {
  return useQuery({
    queryKey: ['market', 'overview'],
    queryFn: marketApi.getOverview,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
