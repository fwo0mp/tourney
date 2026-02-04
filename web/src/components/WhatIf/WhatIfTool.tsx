import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { analysisApi } from '../../api';
import type { WhatIfResponse } from '../../types';

export function WhatIfTool() {
  const { data: teams } = useTeams();
  const whatIf = useUIStore((state) => state.whatIf);
  const setGameOutcome = useUIStore((state) => state.setGameOutcome);
  const removeGameOutcome = useUIStore((state) => state.removeGameOutcome);
  const setRatingAdjustment = useUIStore((state) => state.setRatingAdjustment);
  const removeRatingAdjustment = useUIStore((state) => state.removeRatingAdjustment);
  const clearWhatIf = useUIStore((state) => state.clearWhatIf);

  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [adjustTeam, setAdjustTeam] = useState('');
  const [adjustValue, setAdjustValue] = useState(0);

  const analysisMutation = useMutation({
    mutationFn: () =>
      analysisApi.analyzeWhatIf({
        game_outcomes: whatIf.gameOutcomes,
        rating_adjustments: whatIf.ratingAdjustments,
      }),
  });

  const handleAddOutcome = () => {
    if (team1 && team2 && team1 !== team2) {
      setGameOutcome(team1, team2);
      setTeam1('');
      setTeam2('');
    }
  };

  const handleAddAdjustment = () => {
    if (adjustTeam && adjustValue !== 0) {
      setRatingAdjustment(adjustTeam, adjustValue);
      setAdjustTeam('');
      setAdjustValue(0);
    }
  };

  const handleAnalyze = () => {
    analysisMutation.mutate();
  };

  const teamNames = teams?.map((t) => t.name).sort() || [];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">What-If Analysis</h2>
        <button
          onClick={clearWhatIf}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear All
        </button>
      </div>

      {/* Add Game Outcome */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Set Game Winner</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Winner</label>
            <select
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select team...</option>
              {teamNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="text-gray-400 pb-2">beats</div>
          <div className="flex-1">
            <label className="text-xs text-gray-500">Loser</label>
            <select
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select team...</option>
              {teamNames.filter((n) => n !== team1).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddOutcome}
            disabled={!team1 || !team2}
            className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Current Game Outcomes */}
      {whatIf.gameOutcomes.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Game Outcomes</h4>
          <div className="space-y-1">
            {whatIf.gameOutcomes.map((outcome, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm"
              >
                <span>
                  <span className="font-medium text-green-600">{outcome.winner}</span>
                  {' beats '}
                  <span className="text-red-600">{outcome.loser}</span>
                </span>
                <button
                  onClick={() => removeGameOutcome(outcome.winner, outcome.loser)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Rating Adjustment */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Adjust Team Rating</h3>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-500">Team</label>
            <select
              value={adjustTeam}
              onChange={(e) => setAdjustTeam(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select team...</option>
              {teamNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="text-xs text-gray-500">Points +/-</label>
            <input
              type="number"
              value={adjustValue}
              onChange={(e) => setAdjustValue(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              step="0.5"
            />
          </div>
          <button
            onClick={handleAddAdjustment}
            disabled={!adjustTeam || adjustValue === 0}
            className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Current Rating Adjustments */}
      {Object.keys(whatIf.ratingAdjustments).length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Rating Adjustments</h4>
          <div className="space-y-1">
            {Object.entries(whatIf.ratingAdjustments).map(([team, delta]) => (
              <div
                key={team}
                className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm"
              >
                <span>
                  <span className="font-medium">{team}</span>
                  {' '}
                  <span className={delta > 0 ? 'text-green-600' : 'text-red-600'}>
                    {delta > 0 ? '+' : ''}{delta} points
                  </span>
                </span>
                <button
                  onClick={() => removeRatingAdjustment(team)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyze Button */}
      <button
        onClick={handleAnalyze}
        disabled={whatIf.gameOutcomes.length === 0 && Object.keys(whatIf.ratingAdjustments).length === 0}
        className="w-full py-2 bg-blue-600 text-white rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {analysisMutation.isPending ? 'Analyzing...' : 'Analyze Scenario'}
      </button>

      {/* Results */}
      {analysisMutation.data && (
        <WhatIfResults data={analysisMutation.data} />
      )}

      {analysisMutation.isError && (
        <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md text-sm">
          Error analyzing scenario. Please try again.
        </div>
      )}
    </div>
  );
}

function WhatIfResults({ data }: { data: WhatIfResponse }) {
  const delta = data.delta;
  const percentChange = (delta / Math.abs(data.original_value)) * 100;

  // Find biggest score changes
  const scoreChanges = Object.entries(data.modified_scores)
    .map(([team, newScore]) => ({
      team,
      original: data.original_scores[team] || 0,
      modified: newScore,
      change: newScore - (data.original_scores[team] || 0),
    }))
    .filter((c) => Math.abs(c.change) > 0.01)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 10);

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Scenario Impact</h3>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-gray-900">
            {data.original_value.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Original Value</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-gray-900">
            {data.modified_value.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">New Value</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${delta > 0 ? 'bg-green-50' : delta < 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <div className={`text-lg font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            Change ({percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%)
          </div>
        </div>
      </div>

      {scoreChanges.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-2">Biggest Score Changes</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {scoreChanges.map((change) => (
              <div
                key={change.team}
                className="flex items-center justify-between text-sm py-1"
              >
                <span className="text-gray-700">{change.team}</span>
                <span className={change.change > 0 ? 'text-green-600' : 'text-red-600'}>
                  {change.original.toFixed(2)} → {change.modified.toFixed(2)}
                  {' '}
                  ({change.change > 0 ? '+' : ''}{change.change.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
