import { useState } from 'react';
import { useTeam } from '../../hooks/useTournament';
import { useTeamImpact } from '../../hooks/usePortfolio';
import { useUIStore } from '../../store/uiStore';

type SortColumn = 'holding' | 'position' | 'ev_delta' | 'portfolio_impact';
type SortDirection = 'asc' | 'desc';

interface TeamPanelProps {
  teamName: string;
}

export function TeamPanel({ teamName }: TeamPanelProps) {
  const { data: team, isLoading: teamLoading } = useTeam(teamName);
  const { data: impact, isLoading: impactLoading } = useTeamImpact(teamName);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);
  const whatIf = useUIStore((state) => state.whatIf);
  const setRatingAdjustment = useUIStore((state) => state.setRatingAdjustment);
  const removeRatingAdjustment = useUIStore((state) => state.removeRatingAdjustment);
  const promoteRatingAdjustment = useUIStore((state) => state.promoteRatingAdjustment);
  const [sortColumn, setSortColumn] = useState<SortColumn>('portfolio_impact');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [adjustmentInput, setAdjustmentInput] = useState<string>('');

  const isLoading = teamLoading || impactLoading;

  // Get current rating adjustment for this team (if any)
  // Check both permanent and scenario adjustments
  const permanentAdjustment = whatIf.permanentRatingAdjustments[teamName];
  const scenarioAdjustment = whatIf.scenarioRatingAdjustments[teamName];
  const currentAdjustment = scenarioAdjustment ?? permanentAdjustment ?? null;
  const isPermanentAdjustment = permanentAdjustment !== undefined && scenarioAdjustment === undefined;

  const handleSetAdjustment = () => {
    const value = parseFloat(adjustmentInput);
    if (!isNaN(value) && value !== 0) {
      setRatingAdjustment(teamName, value);
      setAdjustmentInput('');
    }
  };

  const handleRemoveAdjustment = () => {
    removeRatingAdjustment(teamName, isPermanentAdjustment);
  };

  const handleQuickAdjust = (delta: number) => {
    const newValue = (currentAdjustment ?? 0) + delta;
    if (newValue === 0) {
      // Remove the adjustment (from permanent if it was permanent, otherwise scenario)
      removeRatingAdjustment(teamName, isPermanentAdjustment);
    } else {
      // New adjustments go to scenario by default
      setRatingAdjustment(teamName, newValue, false);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Filter to only show holdings with non-zero positions and meaningful impact
  const breakdown = (impact?.breakdown ?? [])
    .filter((item) => item.position !== 0 && Math.abs(item.portfolio_impact) > 0.001)
    .sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'holding':
          cmp = a.holding.localeCompare(b.holding);
          break;
        case 'position':
          cmp = Math.abs(b.position) - Math.abs(a.position);
          break;
        case 'ev_delta':
          cmp = Math.abs(b.ev_delta) - Math.abs(a.ev_delta);
          break;
        case 'portfolio_impact':
          cmp = Math.abs(b.portfolio_impact) - Math.abs(a.portfolio_impact);
          break;
      }
      return sortDirection === 'desc' ? cmp : -cmp;
    });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">{teamName}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateToDetailedView(teamName)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              View Details
            </button>
            <button
              onClick={() => selectTeam(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        ) : team ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {team.expected_score.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Expected Score</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className={`text-2xl font-bold ${team.position > 0 ? 'text-green-600' : team.position < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {team.position !== 0 ? (team.position > 0 ? '+' : '') + team.position.toFixed(1) : '-'}
                </div>
                <div className="text-xs text-gray-500">Position (Shares)</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className={`text-xl font-bold ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">Portfolio Delta</div>
              <p className="text-xs text-gray-400 mt-1">
                Portfolio value change per +1 point rating adjustment
              </p>
            </div>

            {/* What-If Rating Adjustment */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">What-If Rating Adjustment</h3>

              {currentAdjustment !== null ? (
                <div className="mb-3">
                  <div className={`rounded-lg p-3 border ${
                    isPermanentAdjustment
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          isPermanentAdjustment
                            ? 'bg-purple-200 text-purple-800'
                            : 'bg-blue-200 text-blue-800'
                        }`}>
                          {isPermanentAdjustment ? 'Permanent' : whatIf.activeScenarioName || 'Ad-hoc'}
                        </span>
                      </div>
                      <button
                        onClick={handleRemoveAdjustment}
                        className={`text-sm font-medium ${
                          isPermanentAdjustment
                            ? 'text-purple-600 hover:text-purple-800'
                            : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-sm ${isPermanentAdjustment ? 'text-purple-800' : 'text-blue-800'}`}>
                          Adjustment:{' '}
                        </span>
                        <span className={`text-lg font-bold ${currentAdjustment > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {currentAdjustment > 0 ? '+' : ''}{currentAdjustment.toFixed(1)} pts
                        </span>
                      </div>
                    </div>
                    {!isPermanentAdjustment && scenarioAdjustment !== undefined && (
                      <button
                        onClick={() => promoteRatingAdjustment(teamName)}
                        className="w-full mt-2 px-2 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 border border-purple-300 rounded hover:bg-purple-200 flex items-center justify-center gap-1"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        Make Permanent
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-3">No adjustment applied</p>
              )}

              {/* Quick adjustment buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => handleQuickAdjust(-5)}
                  className="flex-1 px-2 py-1.5 text-sm font-medium bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  -5
                </button>
                <button
                  onClick={() => handleQuickAdjust(-1)}
                  className="flex-1 px-2 py-1.5 text-sm font-medium bg-red-50 text-red-600 rounded hover:bg-red-100"
                >
                  -1
                </button>
                <button
                  onClick={() => handleQuickAdjust(+1)}
                  className="flex-1 px-2 py-1.5 text-sm font-medium bg-green-50 text-green-600 rounded hover:bg-green-100"
                >
                  +1
                </button>
                <button
                  onClick={() => handleQuickAdjust(+5)}
                  className="flex-1 px-2 py-1.5 text-sm font-medium bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  +5
                </button>
              </div>

              {/* Custom adjustment input */}
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  placeholder="Custom adjustment"
                  value={adjustmentInput}
                  onChange={(e) => setAdjustmentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetAdjustment()}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSetAdjustment}
                  disabled={!adjustmentInput || isNaN(parseFloat(adjustmentInput))}
                  className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Adjust team rating to see impact on portfolio value
              </p>
            </div>

            {/* Delta Breakdown by Holding */}
            {breakdown.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Delta Breakdown by Holding</h3>
                <p className="text-xs text-gray-500 mb-3">
                  How a +1 point adjustment to {teamName} affects your portfolio
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th
                          className={`text-left py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'holding' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('holding')}
                        >
                          Holding{sortColumn === 'holding' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'position' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('position')}
                        >
                          Pos{sortColumn === 'position' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'ev_delta' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('ev_delta')}
                        >
                          EV Δ{sortColumn === 'ev_delta' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'portfolio_impact' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('portfolio_impact')}
                        >
                          Impact{sortColumn === 'portfolio_impact' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.map(({ holding, position, ev_delta, portfolio_impact }) => (
                        <tr
                          key={holding}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => selectTeam(holding)}
                        >
                          <td className="py-1.5 text-gray-700 truncate max-w-[120px]">{holding}</td>
                          <td className={`py-1.5 text-right ${position > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {position > 0 ? '+' : ''}{position.toFixed(1)}
                          </td>
                          <td className={`py-1.5 text-right ${ev_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {ev_delta > 0 ? '+' : ''}{ev_delta.toFixed(2)}
                          </td>
                          <td className={`py-1.5 text-right font-medium ${portfolio_impact > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {portfolio_impact > 0 ? '+' : ''}{portfolio_impact.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="py-1.5 font-medium text-gray-700">Total</td>
                        <td className={`py-1.5 text-right font-bold ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Team Ratings</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {(team.offense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Offense</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {(team.defense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Defense</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {team.tempo.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Tempo</div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Position Value</h3>
              <div className="text-2xl font-bold text-gray-900">
                {(team.position * team.expected_score).toFixed(2)}
              </div>
              <p className="text-xs text-gray-400">
                {team.position.toFixed(1)} shares x {team.expected_score.toFixed(2)} EV
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Team not found</p>
        )}
      </div>
    </div>
  );
}
