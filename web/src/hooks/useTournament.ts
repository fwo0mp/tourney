import { useQuery } from '@tanstack/react-query';
import { tournamentApi } from '../api/tournament';
import { analysisApi } from '../api/analysis';

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

export function useGameImpact(team1: string | null, team2: string | null) {
  return useQuery({
    queryKey: ['analysis', 'game', team1, team2],
    queryFn: () => analysisApi.getGameImpact(team1!, team2!),
    enabled: !!team1 && !!team2,
    staleTime: 60_000,
  });
}
