import { useState } from 'react';
import { useGameImpact } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';

type SortColumn = 'team' | 'position' | 'delta_per_share' | 'total_delta';
type SortDirection = 'asc' | 'desc';

interface GamePanelProps {
  team1: string;
  team2: string;
}

export function GamePanel({ team1, team2 }: GamePanelProps) {
  const { data: impact, isLoading } = useGameImpact(team1, team2);
  const selectGame = useUIStore((state) => state.selectGame);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const [sortColumn, setSortColumn] = useState<SortColumn>('total_delta');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Sort and filter team impacts
  const sortedImpacts = (impact?.team_impacts ?? [])
    .filter((item) => item.position !== 0 && Math.abs(item.total_delta) > 0.001)
    .sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'team':
          cmp = a.team.localeCompare(b.team);
          break;
        case 'position':
          cmp = Math.abs(b.position) - Math.abs(a.position);
          break;
        case 'delta_per_share':
          cmp = Math.abs(b.delta_per_share) - Math.abs(a.delta_per_share);
          break;
        case 'total_delta':
          cmp = Math.abs(b.total_delta) - Math.abs(a.total_delta);
          break;
      }
      return sortDirection === 'desc' ? cmp : -cmp;
    });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">Game Analysis</h2>
          <button
            onClick={() => selectGame(null)}
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
        ) : impact ? (
          <div className="space-y-6">
            {/* Matchup Header */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => selectTeam(team1)}
                  className="text-lg font-semibold text-blue-600 hover:underline"
                >
                  {team1}
                </button>
                <span className="text-gray-400">vs</span>
                <button
                  onClick={() => selectTeam(team2)}
                  className="text-lg font-semibold text-blue-600 hover:underline"
                >
                  {team2}
                </button>
              </div>
            </div>

            {/* Win Probabilities */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {(impact.win_prob * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">{team1} Wins</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {((1 - impact.win_prob) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">{team2} Wins</div>
              </div>
            </div>

            {/* Portfolio Impact */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Portfolio Impact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${impact.if_team1_wins > 0 ? 'text-green-600' : impact.if_team1_wins < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {impact.if_team1_wins > 0 ? '+' : ''}{impact.if_team1_wins.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">If {team1} wins</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${impact.if_team2_wins > 0 ? 'text-green-600' : impact.if_team2_wins < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {impact.if_team2_wins > 0 ? '+' : ''}{impact.if_team2_wins.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">If {team2} wins</div>
                </div>
              </div>
              <div className="mt-3 bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-blue-600">
                  {impact.swing.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Total Swing</div>
              </div>
            </div>

            {/* Impact Breakdown by Holding */}
            {sortedImpacts.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Impact Breakdown</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Portfolio change if {team1} wins (by holding)
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th
                          className={`text-left py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'team' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('team')}
                        >
                          Holding{sortColumn === 'team' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'position' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('position')}
                        >
                          Pos{sortColumn === 'position' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'delta_per_share' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('delta_per_share')}
                        >
                          EV Δ{sortColumn === 'delta_per_share' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                        <th
                          className={`text-right py-1 text-xs font-medium cursor-pointer hover:text-gray-700 select-none ${sortColumn === 'total_delta' ? 'text-gray-900' : 'text-gray-500'}`}
                          onClick={() => handleSort('total_delta')}
                        >
                          Impact{sortColumn === 'total_delta' && <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedImpacts.map(({ team, position, delta_per_share, total_delta }) => (
                        <tr
                          key={team}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => selectTeam(team)}
                        >
                          <td className="py-1.5 text-gray-700 truncate max-w-[120px]">{team}</td>
                          <td className={`py-1.5 text-right ${position > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {position > 0 ? '+' : ''}{position.toFixed(1)}
                          </td>
                          <td className={`py-1.5 text-right ${delta_per_share > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {delta_per_share > 0 ? '+' : ''}{delta_per_share.toFixed(2)}
                          </td>
                          <td className={`py-1.5 text-right font-medium ${total_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {total_delta > 0 ? '+' : ''}{total_delta.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="py-1.5 font-medium text-gray-700">Total</td>
                        <td className={`py-1.5 text-right font-bold ${impact.if_team1_wins > 0 ? 'text-green-600' : impact.if_team1_wins < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {impact.if_team1_wins > 0 ? '+' : ''}{impact.if_team1_wins.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Game not found</p>
        )}
      </div>
    </div>
  );
}
