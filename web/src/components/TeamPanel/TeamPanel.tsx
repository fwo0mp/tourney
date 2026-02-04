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
  const [sortColumn, setSortColumn] = useState<SortColumn>('portfolio_impact');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const isLoading = teamLoading || impactLoading;

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
          <button
            onClick={() => selectTeam(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
