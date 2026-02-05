import { useMutation } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { useSlotCandidates, useBracketTree } from '../../hooks/useTournament';
import { useGameImpact } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { analysisApi } from '../../api/analysis';
import { createBracketTreeHelpers, parsePositionKey, getWinner } from '../../utils/bracketTree';
import type { WhatIfGameOutcome } from '../../types';

interface MetaTeamModalProps {
  nodeId: string;
  onClose: () => void;
}

export function MetaTeamModal({ nodeId, onClose }: MetaTeamModalProps) {
  const whatIf = useUIStore((state) => state.whatIf);
  const setGameOutcome = useUIStore((state) => state.setGameOutcome);
  const removeGameOutcome = useUIStore((state) => state.removeGameOutcome);
  const setGameOutcomes = useUIStore((state) => state.setGameOutcomes);
  const { data: treeResponse } = useBracketTree();

  // Parse round/position from nodeId for API compatibility
  const parsed = useMemo(() => parsePositionKey(nodeId), [nodeId]);
  const round = parsed?.round ?? 0;
  const position = parsed?.position ?? 0;

  // Get node and tree helpers
  const { node, helpers } = useMemo(() => {
    if (!treeResponse?.tree) {
      return { node: null, helpers: null };
    }
    const h = createBracketTreeHelpers(treeResponse.tree);
    let foundNode = h.getNode(nodeId);
    if (!foundNode && parsed) {
      foundNode = h.getNodeByPosition(parsed.round, parsed.position);
    }
    return { node: foundNode, helpers: h };
  }, [treeResponse, nodeId, parsed]);

  // Check if both feeder teams are definitively known
  const matchupTeams = useMemo(() => {
    if (!node || !helpers) return null;

    const leftChild = node.left_child_id ? helpers.getNode(node.left_child_id) : null;
    const rightChild = node.right_child_id ? helpers.getNode(node.right_child_id) : null;

    if (!leftChild || !rightChild) return null;

    const leftWinner = getWinner(leftChild);
    const rightWinner = getWinner(rightChild);

    if (!leftWinner || !rightWinner) return null;

    // Both teams are definitively known
    return { team1: leftWinner, team2: rightWinner };
  }, [node, helpers]);

  // Get theoretical win probability for the matchup
  const { data: gameImpact } = useGameImpact(
    matchupTeams?.team1 ?? null,
    matchupTeams?.team2 ?? null
  );

  // Find existing override for this matchup
  const existingOverride = useMemo(() => {
    if (!matchupTeams) return null;
    const { team1, team2 } = matchupTeams;
    const [t1, t2] = team1 < team2 ? [team1, team2] : [team2, team1];
    return whatIf.gameOutcomes.find(
      (o) => o.team1 === t1 && o.team2 === t2
    );
  }, [matchupTeams, whatIf.gameOutcomes]);

  // Probability state for slider (team1's win probability)
  const [probability, setProbability] = useState<number>(50);
  const [inputValue, setInputValue] = useState<string>('50');

  // Initialize probability from existing override or model prediction
  useEffect(() => {
    if (matchupTeams && gameImpact) {
      if (existingOverride) {
        // Get probability relative to team1 (first alphabetically in the override)
        const { team1 } = matchupTeams;
        const [t1] = team1 < matchupTeams.team2 ? [team1] : [matchupTeams.team2];
        const prob = existingOverride.team1 === t1
          ? existingOverride.probability
          : 1.0 - existingOverride.probability;
        // Convert to team1's perspective (matchupTeams.team1)
        const team1Prob = matchupTeams.team1 < matchupTeams.team2
          ? prob
          : 1.0 - prob;
        setProbability(team1Prob * 100);
        setInputValue((team1Prob * 100).toFixed(0));
      } else {
        // Use model prediction
        setProbability(gameImpact.win_prob * 100);
        setInputValue((gameImpact.win_prob * 100).toFixed(0));
      }
    }
  }, [matchupTeams, gameImpact, existingOverride]);

  // Use slot candidates API for the regular team selection flow
  const { data, isLoading, error } = useSlotCandidates(round, position);

  // Find what-if outcomes involving selected team (with probability ~1.0)
  const selectedTeam = data?.candidates.find((c) => c.probability >= 0.9999);
  const relevantOutcomes = useMemo(() => {
    if (!selectedTeam) return [];
    return whatIf.gameOutcomes.filter(
      (o) => (o.team1 === selectedTeam.team || o.team2 === selectedTeam.team) &&
             (o.probability >= 0.9999 || o.probability <= 0.0001)
    );
  }, [selectedTeam, whatIf.gameOutcomes]);

  const hasWhatIfSelection = selectedTeam && relevantOutcomes.length > 0;

  const handleClearSelection = () => {
    if (!selectedTeam) return;
    // Remove all what-if outcomes where this team won definitively
    const newOutcomes = whatIf.gameOutcomes.filter((o) => {
      const isTeam1 = o.team1 === selectedTeam.team;
      const isTeam2 = o.team2 === selectedTeam.team;
      if (!isTeam1 && !isTeam2) return true;
      // Remove if this team won (prob ~1.0 for team1, ~0.0 for team2)
      if (isTeam1 && o.probability >= 0.9999) return false;
      if (isTeam2 && o.probability <= 0.0001) return false;
      return true;
    });
    setGameOutcomes(newOutcomes);
  };

  const computePathMutation = useMutation({
    mutationFn: (team: string) =>
      analysisApi.computePath({
        team,
        round,
        position,
        current_outcomes: whatIf.gameOutcomes,
      }),
    onSuccess: (response) => {
      const existingOutcomes = whatIf.gameOutcomes;
      const newOutcomes = response.required_outcomes;
      const outcomeMap = new Map<string, WhatIfGameOutcome>();

      for (const outcome of existingOutcomes) {
        const key = [outcome.team1, outcome.team2].sort().join('|');
        outcomeMap.set(key, outcome);
      }
      for (const outcome of newOutcomes) {
        const key = [outcome.team1, outcome.team2].sort().join('|');
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

  // Handle probability slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setProbability(val);
    setInputValue(val.toFixed(0));
  };

  // Handle probability input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      setProbability(val);
    }
  };

  // Apply probability override
  const handleApplyProbability = () => {
    if (!matchupTeams) return;
    const { team1, team2 } = matchupTeams;
    setGameOutcome(team1, team2, probability / 100);
    onClose();
  };

  // Set definite winner
  const handleSetWinner = (winner: string) => {
    if (!matchupTeams) return;
    const { team1, team2 } = matchupTeams;
    const prob = winner === team1 ? 1.0 : 0.0;
    setGameOutcome(team1, team2, prob);
    onClose();
  };

  // Clear override for this matchup
  const handleClearOverride = () => {
    if (!matchupTeams) return;
    const { team1, team2 } = matchupTeams;
    removeGameOutcome(team1, team2);
    // Reset to model prediction
    if (gameImpact) {
      setProbability(gameImpact.win_prob * 100);
      setInputValue((gameImpact.win_prob * 100).toFixed(0));
    }
  };

  // Build display label from node info
  const displayLabel = useMemo(() => {
    if (node) {
      const roundName = node.is_play_in
        ? 'Play-In'
        : node.is_championship
        ? 'Championship'
        : `Round ${node.round + 1}`;
      const regionLabel = node.region ? `${node.region.charAt(0).toUpperCase() + node.region.slice(1)} ` : '';
      return `${regionLabel}${roundName}, Position ${node.position + 1}`;
    }
    return `Round ${round + 1}, Position ${position + 1}`;
  }, [node, round, position]);

  // Render matchup probability editor when both teams are known
  const renderMatchupEditor = () => {
    if (!matchupTeams || !gameImpact) return null;

    const { team1, team2 } = matchupTeams;
    const modelProb = gameImpact.win_prob * 100;

    return (
      <div className="space-y-4">
        {/* Matchup header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 text-lg font-semibold">
            <span className="text-gray-900">{team1}</span>
            <span className="text-gray-400">vs</span>
            <span className="text-gray-900">{team2}</span>
          </div>
        </div>

        {/* Override indicator */}
        {existingOverride && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-amber-800">
                Override active
              </span>
              <button
                onClick={handleClearOverride}
                className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Probability slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{team1}</span>
            <span>{team2}</span>
          </div>

          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={probability}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            {/* Model prediction marker */}
            <div
              className="absolute top-0 w-0.5 h-2 bg-blue-500"
              style={{ left: `${modelProb}%`, transform: 'translateX(-50%)' }}
              title={`Model: ${modelProb.toFixed(1)}%`}
            />
          </div>

          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-gray-500">Win probability:</span>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              className="w-16 px-2 py-1 text-center text-sm border border-gray-300 rounded"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>

          <div className="text-center text-xs text-gray-400">
            Model prediction: {modelProb.toFixed(1)}%
          </div>
        </div>

        {/* Quick set buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleSetWinner(team1)}
            className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
          >
            {team1} wins
          </button>
          <button
            onClick={() => handleSetWinner(team2)}
            className="px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
          >
            {team2} wins
          </button>
        </div>

        {/* Apply probability button */}
        <button
          onClick={handleApplyProbability}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Apply {probability.toFixed(0)}% / {(100 - probability).toFixed(0)}%
        </button>
      </div>
    );
  };

  // Render team candidate list
  const renderCandidateList = () => (
    <>
      {/* What-If Selection Indicator */}
      {hasWhatIfSelection && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-800">
              <span className="font-medium">{selectedTeam?.team}</span> is here via what-if
            </span>
            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {data?.candidates.map((candidate) => {
          const isCurrentSelection = candidate.probability >= 0.9999;
          return (
            <li key={candidate.team}>
              <button
                onClick={() => handleSelectTeam(candidate.team)}
                disabled={computePathMutation.isPending || isCurrentSelection}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors disabled:opacity-50 ${
                  isCurrentSelection
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {candidate.team}
                  </span>
                  <span className={`text-sm ${isCurrentSelection ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                    {isCurrentSelection ? 'Selected' : `${(candidate.probability * 100).toFixed(1)}%`}
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
          );
        })}
      </ul>
    </>
  );

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
            {matchupTeams ? 'Set Game Probability' : 'Select Team for This Slot'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {displayLabel}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="text-red-600 text-sm py-4">
              Failed to load data
            </div>
          ) : matchupTeams ? (
            renderMatchupEditor()
          ) : data?.candidates.length === 0 ? (
            <div className="text-gray-500 text-sm py-4">
              No teams can reach this slot
            </div>
          ) : (
            renderCandidateList()
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
