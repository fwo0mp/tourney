import { useMutation } from '@tanstack/react-query';
import { useSlotCandidates } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { analysisApi } from '../../api/analysis';
import type { WhatIfGameOutcome } from '../../types';

interface MetaTeamModalProps {
  round: number;
  position: number;
  onClose: () => void;
}

export function MetaTeamModal({ round, position, onClose }: MetaTeamModalProps) {
  const whatIf = useUIStore((state) => state.whatIf);
  const setGameOutcomes = useUIStore((state) => state.setGameOutcomes);
  const { data, isLoading, error } = useSlotCandidates(round, position);

  const computePathMutation = useMutation({
    mutationFn: (team: string) =>
      analysisApi.computePath({
        team,
        round,
        position,
        current_outcomes: whatIf.gameOutcomes,
      }),
    onSuccess: (response) => {
      // Merge existing outcomes with required outcomes
      const existingOutcomes = whatIf.gameOutcomes;
      const newOutcomes = response.required_outcomes;

      // Create a map of outcomes keyed by teams involved
      const outcomeMap = new Map<string, WhatIfGameOutcome>();

      // Add existing outcomes
      for (const outcome of existingOutcomes) {
        const key = [outcome.winner, outcome.loser].sort().join('|');
        outcomeMap.set(key, outcome);
      }

      // Add/override with new outcomes
      for (const outcome of newOutcomes) {
        const key = [outcome.winner, outcome.loser].sort().join('|');
        outcomeMap.set(key, outcome);
      }

      setGameOutcomes(Array.from(outcomeMap.values()));
      onClose();
    },
  });

  const handleSelectTeam = (team: string) => {
    computePathMutation.mutate(team);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Select Team for This Slot
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Round {round + 1}, Position {position + 1}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="text-red-600 text-sm py-4">
              Failed to load candidates
            </div>
          ) : data?.candidates.length === 0 ? (
            <div className="text-gray-500 text-sm py-4">
              No teams can reach this slot
            </div>
          ) : (
            <ul className="space-y-2">
              {data?.candidates.map((candidate) => (
                <li key={candidate.team}>
                  <button
                    onClick={() => handleSelectTeam(candidate.team)}
                    disabled={computePathMutation.isPending}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">
                        {candidate.team}
                      </span>
                      <span className="text-sm text-gray-500">
                        {(candidate.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        candidate.portfolio_delta > 0
                          ? 'text-green-600'
                          : candidate.portfolio_delta < 0
                          ? 'text-red-600'
                          : 'text-gray-500'
                      }`}
                    >
                      {candidate.portfolio_delta > 0 ? '+' : ''}
                      {candidate.portfolio_delta.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
          {computePathMutation.isPending && (
            <span className="text-sm text-gray-500 mr-auto">
              Applying selection...
            </span>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
