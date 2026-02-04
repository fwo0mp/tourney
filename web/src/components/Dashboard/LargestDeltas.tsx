import { useState } from 'react';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { TeamInfo } from '../../types';

type SortColumn = 'name' | 'delta' | 'position' | 'ev';
type SortDirection = 'asc' | 'desc';

function SortHeader({
  label,
  column,
  currentColumn,
  direction,
  onSort,
}: {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
  onSort: (col: SortColumn) => void;
}) {
  const isActive = column === currentColumn;
  return (
    <th
      className={`py-2 text-xs font-medium uppercase cursor-pointer hover:text-gray-700 select-none ${
        column === 'name' ? 'text-left' : 'text-right'
      } ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
      onClick={() => onSort(column)}
    >
      {label}
      {isActive && (
        <span className="ml-1">{direction === 'desc' ? '↓' : '↑'}</span>
      )}
    </th>
  );
}

export function LargestDeltas() {
  const { data: teams, isLoading } = useTeams();
  const selectTeam = useUIStore((state) => state.selectTeam);
  const [sortColumn, setSortColumn] = useState<SortColumn>('delta');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Largest Deltas</h2>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...(teams || [])]
    .filter((t) => t.delta !== 0)
    .sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'delta':
          cmp = Math.abs(b.delta) - Math.abs(a.delta);
          break;
        case 'position':
          cmp = Math.abs(b.position) - Math.abs(a.position);
          break;
        case 'ev':
          cmp = b.expected_score - a.expected_score;
          break;
      }
      return sortDirection === 'desc' ? cmp : -cmp;
    })
    .slice(0, 10);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Largest Deltas</h2>
      <p className="text-xs text-gray-500 mb-4">
        Portfolio sensitivity to team rating changes (+/- 1 point)
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <SortHeader label="Team" column="name" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortHeader label="Delta" column="delta" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortHeader label="Position" column="position" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
              <SortHeader label="EV" column="ev" currentColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((team: TeamInfo) => (
              <tr
                key={team.name}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => selectTeam(team.name)}
              >
                <td className="py-2 text-sm font-medium text-gray-900">{team.name}</td>
                <td className={`py-2 text-sm text-right font-medium ${team.delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
                </td>
                <td className={`py-2 text-sm text-right ${team.position !== 0 ? (team.position > 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                  {team.position !== 0 ? (team.position > 0 ? '+' : '') + team.position.toFixed(1) : '-'}
                </td>
                <td className="py-2 text-sm text-right text-gray-600">
                  {team.expected_score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
