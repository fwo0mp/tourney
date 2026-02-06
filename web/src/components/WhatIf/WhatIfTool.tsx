import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { analysisApi } from '../../api';
import { ScenarioSelector } from './ScenarioSelector';
import { OverridesList } from './OverridesList';
import type { WhatIfResponse } from '../../types';

export function WhatIfTool() {
  const { data: teams } = useTeams();
  const whatIf = useUIStore((state) => state.whatIf);
  const setGameOutcome = useUIStore((state) => state.setGameOutcome);
  const setRatingAdjustment = useUIStore((state) => state.setRatingAdjustment);
  const clearWhatIf = useUIStore((state) => state.clearWhatIf);
  const clearTemporaryOverrides = useUIStore((state) => state.clearTemporaryOverrides);

  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [isPermanentGame, setIsPermanentGame] = useState(false);
  const [adjustTeam, setAdjustTeam] = useState('');
  const [adjustValue, setAdjustValue] = useState(0);
  const [isPermanentAdjust, setIsPermanentAdjust] = useState(false);

  // Combine all overrides for analysis
  const allGameOutcomes = [
    ...whatIf.permanentGameOutcomes,
    ...whatIf.scenarioGameOutcomes,
  ];
  const allRatingAdjustments = {
    ...whatIf.permanentRatingAdjustments,
    ...whatIf.scenarioRatingAdjustments,
  };

  const analysisMutation = useMutation({
    mutationFn: () =>
      analysisApi.analyzeWhatIf({
        game_outcomes: allGameOutcomes,
        rating_adjustments: allRatingAdjustments,
      }),
  });

  const handleAddOutcome = () => {
    if (team1 && team2 && team1 !== team2) {
      setGameOutcome(team1, team2, 1.0, isPermanentGame);
      setTeam1('');
      setTeam2('');
    }
  };

  const handleAddAdjustment = () => {
    if (adjustTeam && adjustValue !== 0) {
      setRatingAdjustment(adjustTeam, adjustValue, isPermanentAdjust);
      setAdjustTeam('');
      setAdjustValue(0);
    }
  };

  const handleAnalyze = () => {
    analysisMutation.mutate();
  };

  const teamNames = teams?.map((t) => t.name).sort() || [];

  const hasScenarioOverrides =
    whatIf.scenarioGameOutcomes.length > 0 ||
    Object.keys(whatIf.scenarioRatingAdjustments).length > 0;

  const hasPermanentOverrides =
    whatIf.permanentGameOutcomes.length > 0 ||
    Object.keys(whatIf.permanentRatingAdjustments).length > 0;

  const hasAnyOverrides = hasScenarioOverrides || hasPermanentOverrides;

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
      {/* Header with Scenario Selector */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">What-If Analysis</h2>
        <div className="flex items-center gap-2">
          {hasScenarioOverrides && (
            <button
              onClick={clearTemporaryOverrides}
              className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded"
              title="Clear scenario overrides"
            >
              Clear Temp
            </button>
          )}
          {hasAnyOverrides && (
            <button
              onClick={clearWhatIf}
              className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-zinc-800 hover:bg-zinc-700 rounded"
              title="Clear all overrides"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Scenario Selector */}
      <div className="mb-4">
        <label className="block text-xs text-zinc-500 mb-1">Active Scenario</label>
        <ScenarioSelector />
      </div>

      {/* Permanent Overrides Section */}
      <div className="mb-4">
        <OverridesList
          title="Permanent Overrides"
          gameOutcomes={whatIf.permanentGameOutcomes}
          ratingAdjustments={whatIf.permanentRatingAdjustments}
          isPermanent={true}
          emptyMessage="No permanent overrides"
        />
      </div>

      {/* Scenario/Ad-hoc Overrides Section */}
      <div className="mb-4">
        <OverridesList
          title={whatIf.activeScenarioId ? `${whatIf.activeScenarioName} Overrides` : 'Ad-hoc Overrides'}
          gameOutcomes={whatIf.scenarioGameOutcomes}
          ratingAdjustments={whatIf.scenarioRatingAdjustments}
          isPermanent={false}
          showPromote={true}
          emptyMessage={whatIf.activeScenarioId ? 'No scenario overrides' : 'No ad-hoc overrides'}
        />
      </div>

      {/* Add Game Outcome */}
      <div className="mb-4 bg-zinc-800/50 rounded-lg p-3">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Set Game Winner</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-32">
            <label className="text-xs text-zinc-500">Winner</label>
            <select
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            >
              <option value="">Select...</option>
              {teamNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="text-zinc-500 pb-1.5 text-sm">beats</div>
          <div className="flex-1 min-w-32">
            <label className="text-xs text-zinc-500">Loser</label>
            <select
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            >
              <option value="">Select...</option>
              {teamNames.filter((n) => n !== team1).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddOutcome}
            disabled={!team1 || !team2}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
          >
            Add
          </button>
        </div>
        <label className="flex items-center gap-2 mt-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={isPermanentGame}
            onChange={(e) => setIsPermanentGame(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
          />
          <span className={isPermanentGame ? 'text-purple-400' : ''}>Make permanent</span>
        </label>
      </div>

      {/* Add Rating Adjustment */}
      <div className="mb-4 bg-zinc-800/50 rounded-lg p-3">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Adjust Team Rating</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-32">
            <label className="text-xs text-zinc-500">Team</label>
            <select
              value={adjustTeam}
              onChange={(e) => setAdjustTeam(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            >
              <option value="">Select...</option>
              {teamNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="text-xs text-zinc-500">Points +/-</label>
            <input
              type="number"
              value={adjustValue}
              onChange={(e) => setAdjustValue(Number(e.target.value))}
              className="w-full mt-1 px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
              step="0.5"
            />
          </div>
          <button
            onClick={handleAddAdjustment}
            disabled={!adjustTeam || adjustValue === 0}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
          >
            Add
          </button>
        </div>
        <label className="flex items-center gap-2 mt-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={isPermanentAdjust}
            onChange={(e) => setIsPermanentAdjust(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
          />
          <span className={isPermanentAdjust ? 'text-purple-400' : ''}>Make permanent</span>
        </label>
      </div>

      {/* Analyze Button */}
      <button
        onClick={handleAnalyze}
        disabled={!hasAnyOverrides}
        className="w-full py-2 bg-blue-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500"
      >
        {analysisMutation.isPending ? 'Analyzing...' : 'Analyze Scenario'}
      </button>

      {/* Results */}
      {analysisMutation.data && (
        <WhatIfResults data={analysisMutation.data} />
      )}

      {analysisMutation.isError && (
        <div className="mt-4 p-3 bg-red-900/30 text-red-400 rounded text-sm border border-red-800">
          Error analyzing scenario. Please try again.
        </div>
      )}
    </div>
  );
}

function WhatIfResults({ data }: { data: WhatIfResponse }) {
  const delta = data.delta;
  const percentChange = data.original_value !== 0
    ? (delta / Math.abs(data.original_value)) * 100
    : 0;

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
    <div className="mt-4 pt-4 border-t border-zinc-700">
      <h3 className="text-sm font-medium text-zinc-300 mb-3">Scenario Impact</h3>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-zinc-800 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-zinc-100">
            {data.original_value.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500">Original</div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-zinc-100">
            {data.modified_value.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500">Modified</div>
        </div>
        <div className={`rounded-lg p-2 text-center ${
          delta > 0 ? 'bg-green-900/30' : delta < 0 ? 'bg-red-900/30' : 'bg-zinc-800'
        }`}>
          <div className={`text-lg font-bold ${
            delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-zinc-100'
          }`}>
            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
          </div>
          <div className="text-xs text-zinc-500">
            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </div>
        </div>
      </div>

      {scoreChanges.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-500 mb-2">Biggest Score Changes</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {scoreChanges.map((change) => (
              <div
                key={change.team}
                className="flex items-center justify-between text-sm py-1 px-2 bg-zinc-800/50 rounded"
              >
                <span className="text-zinc-300 truncate">{change.team}</span>
                <span className={`flex-shrink-0 ml-2 ${
                  change.change > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {change.original.toFixed(2)} → {change.modified.toFixed(2)}
                  <span className="ml-1 opacity-75">
                    ({change.change > 0 ? '+' : ''}{change.change.toFixed(2)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
