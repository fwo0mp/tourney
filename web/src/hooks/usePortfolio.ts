import { useQuery } from '@tanstack/react-query';
import { portfolioApi } from '../api/portfolio';
import { useUIStore } from '../store/uiStore';
import { whatIfKey } from './useTournament';

export function usePositions() {
  return useQuery({
    queryKey: ['portfolio', 'positions'],
    queryFn: portfolioApi.getPositions,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function usePortfolioValue() {
  // Include whatIf in query key so EV updates reactively on what-if changes
  // This is a cheap probabilistic calculation, so it's safe to call frequently
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['portfolio', 'value', whatIfKey(whatIf)],
    queryFn: () => portfolioApi.getValue(whatIf),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function usePortfolioDistribution(nSimulations = 10000) {
  // Get whatIf state but DON'T include in query key.
  // This way, changing what-if doesn't auto-trigger expensive simulation.
  // User must click "Re-simulate" to explicitly recompute with current what-if state.
  const whatIf = useUIStore((state) => state.whatIf);
  return useQuery({
    queryKey: ['portfolio', 'distribution', nSimulations],
    queryFn: () => portfolioApi.getDistribution(nSimulations, whatIf),
    staleTime: 5 * 60_000,
  });
}

export function useDeltas(pointDelta = 1.0) {
  return useQuery({
    queryKey: ['portfolio', 'deltas', pointDelta],
    queryFn: () => portfolioApi.getDeltas(pointDelta),
    staleTime: 60_000,
  });
}

export function useTeamImpact(teamName: string | null, pointDelta = 1.0) {
  return useQuery({
    queryKey: ['portfolio', 'team-impact', teamName, pointDelta],
    queryFn: () => portfolioApi.getTeamImpact(teamName!, pointDelta),
    enabled: !!teamName,
    staleTime: 60_000,
  });
}

export function useHypotheticalPortfolio(positionChanges: Record<string, number> | null) {
  // Include whatIf so hypothetical value respects current what-if state
  const whatIf = useUIStore((state) => state.whatIf);

  const hasChanges = positionChanges !== null && Object.keys(positionChanges).length > 0;
  const hasNonZeroChanges = hasChanges && Object.values(positionChanges!).some((v) => v !== 0);

  return useQuery({
    queryKey: ['portfolio', 'hypothetical', positionChanges, whatIfKey(whatIf)],
    queryFn: () => portfolioApi.getHypotheticalValue(positionChanges!, whatIf),
    enabled: hasNonZeroChanges,
    staleTime: 30_000,
  });
}
