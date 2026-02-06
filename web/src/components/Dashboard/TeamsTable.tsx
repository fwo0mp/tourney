import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { SortHeader, useSortState, sortData } from '../common';
import type { TeamInfo } from '../../types';

type SortColumn = 'name' | 'position' | 'ev' | 'value' | 'delta';

export function TeamsTable() {
  const { data: teams, isLoading } = useTeams();
  const selectTeam = useUIStore((state) => state.selectTeam);
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);
  const { sortColumn, sortMode, handleSort } = useSortState<SortColumn>('value');

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Teams</h2>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const getValue = (team: TeamInfo) => team.position * team.expected_score;

  // Filter to teams with positions or non-zero delta, then sort
  const teamsWithActivity = (teams || []).filter(
    (t) => t.position !== 0 || Math.abs(t.delta) > 0.01
  );

  const sorted = sortData(teamsWithActivity, sortColumn, sortMode, (team, column) => {
    switch (column) {
      case 'name': return team.name;
      case 'position': return team.position;
      case 'ev': return team.expected_score;
      case 'value': return getValue(team);
      case 'delta': return team.delta;
      default: return 0;
    }
  });

  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col h-[500px]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">Teams</h2>
        <span className="text-xs text-gray-500">
          {teamsWithActivity.length} teams with positions or exposure
        </span>
      </div>
      <div className="overflow-auto flex-1">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200">
              <SortHeader label="Team" column="name" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} align="left" />
              <SortHeader label="Position" column="position" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="EV" column="ev" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="Value" column="value" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="Delta" column="delta" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((team: TeamInfo) => (
              <tr
                key={team.name}
                className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                  team.is_eliminated ? 'opacity-50' : ''
                }`}
                onClick={() => selectTeam(team.name)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  navigateToDetailedView(team.name);
                }}
              >
                <td className={`py-2 text-sm font-medium ${
                  team.is_eliminated ? 'text-gray-400 line-through' : 'text-gray-900'
                }`}>{team.name}</td>
                <td className={`py-2 text-sm text-right ${team.position > 0 ? 'text-green-600' : team.position < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {team.position !== 0 ? (team.position > 0 ? '+' : '') + team.position.toFixed(1) : '-'}
                </td>
                <td className="py-2 text-sm text-right text-gray-600">
                  {team.expected_score.toFixed(2)}
                </td>
                <td className={`py-2 text-sm text-right font-medium ${getValue(team) > 0 ? 'text-green-600' : getValue(team) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {team.position !== 0 ? getValue(team).toFixed(2) : '-'}
                </td>
                <td className={`py-2 text-sm text-right font-medium ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {Math.abs(team.delta) > 0.01 ? (team.delta > 0 ? '+' : '') + team.delta.toFixed(2) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
