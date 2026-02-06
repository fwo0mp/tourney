import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentApi } from '../api/tournament';
import { analysisApi } from '../api/analysis';
import { useUIStore } from '../store/uiStore';
import type { WhatIfState } from '../types';

// Helper to create a stable key from whatIf state
export function whatIfKey(whatIf: WhatIfState): string {
  const allOutcomes = [
    ...whatIf.permanentGameOutcomes,
    ...whatIf.scenarioGameOutcomes,
  ];
  const allAdjustments = {
    ...whatIf.permanentRatingAdjustments,
    ...whatIf.scenarioRatingAdjustments,
  };

  if (allOutcomes.length === 0 && Object.keys(allAdjustments).length === 0) {
    return 'base';
  }
  return JSON.stringify({ outcomes: allOutcomes, adjustments: allAdjustments });
}

export function useTeams() {
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['tournament', 'teams', whatIfKey(whatIf)],
    queryFn: () => tournamentApi.getTeams(whatIf),
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
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['tournament', 'bracket', whatIfKey(whatIf)],
    queryFn: () => tournamentApi.getBracket(whatIf),
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch bracket as explicit tree structure.
 * Provides tree navigation without position arithmetic.
 */
export function useBracketTree() {
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['tournament', 'bracket-tree', whatIfKey(whatIf)],
    queryFn: () => tournamentApi.getBracketTree(whatIf),
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

export function useSlotCandidates(round: number | null, position: number | null) {
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['analysis', 'slot-candidates', round, position, whatIfKey(whatIf)],
    queryFn: () => analysisApi.getSlotCandidates(round!, position!, whatIf),
    enabled: round !== null && position !== null && round >= 0 && position >= 0,
    staleTime: 60_000,
  });
}

export function useCompletedGames() {
  return useQuery({
    queryKey: ['tournament', 'completed-games'],
    queryFn: () => tournamentApi.getCompletedGames(),
    staleTime: 5 * 60_000,
  });
}

export function useAddCompletedGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winner, loser }: { winner: string; loser: string }) =>
      tournamentApi.addCompletedGame(winner, loser),
    onSuccess: () => {
      // Invalidate all tournament-related queries since completed games affect everything
      queryClient.invalidateQueries({ queryKey: ['tournament'] });
      queryClient.invalidateQueries({ queryKey: ['analysis'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useRemoveCompletedGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ winner, loser }: { winner: string; loser: string }) =>
      tournamentApi.removeCompletedGame(winner, loser),
    onSuccess: () => {
      // Invalidate all tournament-related queries
      queryClient.invalidateQueries({ queryKey: ['tournament'] });
      queryClient.invalidateQueries({ queryKey: ['analysis'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useScoringConfig() {
  return useQuery({
    queryKey: ['tournament', 'scoring'],
    queryFn: () => tournamentApi.getScoringConfig(),
    staleTime: Infinity, // Scoring config rarely changes
  });
}
