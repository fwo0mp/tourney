import { useQuery } from '@tanstack/react-query';
import { tournamentApi } from '../api/tournament';

export function useTeams() {
  return useQuery({
    queryKey: ['tournament', 'teams'],
    queryFn: tournamentApi.getTeams,
    staleTime: 5 * 60_000,
  });
}

export function useTeam(name: string) {
  return useQuery({
    queryKey: ['tournament', 'teams', name],
    queryFn: () => tournamentApi.getTeam(name),
    enabled: !!name,
    staleTime: 5 * 60_000,
  });
}

export function useBracket() {
  return useQuery({
    queryKey: ['tournament', 'bracket'],
    queryFn: tournamentApi.getBracket,
    staleTime: 5 * 60_000,
  });
}
