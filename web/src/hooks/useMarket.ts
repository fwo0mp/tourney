import { useQuery } from '@tanstack/react-query';
import { marketApi } from '../api/market';

export function useExecutions(n = 500, mineOnly = true) {
  return useQuery({
    queryKey: ['market', 'executions', mineOnly, n],
    queryFn: () => marketApi.getExecutions({ mineOnly, n }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
