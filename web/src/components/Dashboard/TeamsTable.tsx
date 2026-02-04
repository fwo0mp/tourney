import { useState } from 'react';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { TeamInfo } from '../../types';

type SortColumn = 'name' | 'position' | 'ev' | 'value' | 'delta';
type SortMode = 'abs-desc' | 'desc' | 'asc';

function getSortIndicator(mode: SortMode): string {
  switch (mode) {
    case 'abs-desc': return '↓|';
    case 'desc': return '↓';
    case 'asc': return '↑';
  }
}

function SortHeader({
  label,
  column,
  currentColumn,
  sortMode,
  onSort,
  align = 'right',
}: {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  sortMode: SortMode;
  onSort: (col: SortColumn) => void;
  align?: 'left' | 'right';
}) {
  const isActive = column === currentColumn;
  return (
    <th
      className={`py-2 text-xs font-medium uppercase cursor-pointer hover:text-gray-700 select-none ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
      onClick={() => onSort(column)}
    >
      {label}
      {isActive && (
        <span className="ml-1">{getSortIndicator(sortMode)}</span>
      )}
    </th>
  );
}

export function TeamsTable() {
  const { data: teams, isLoading } = useTeams();
  const selectTeam = useUIStore((state) => state.selectTeam);
  const [sortColumn, setSortColumn] = useState<SortColumn>('value');
  const [sortMode, setSortMode] = useState<SortMode>('abs-desc');

  const handleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      // Cycle through modes: abs-desc -> desc -> asc -> abs-desc
      const nextMode: SortMode = sortMode === 'abs-desc' ? 'desc' : sortMode === 'desc' ? 'asc' : 'abs-desc';
      setSortMode(nextMode);
    } else {
      setSortColumn(column);
      setSortMode('abs-desc');
    }
  };

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

  const sorted = [...teamsWithActivity].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortColumn) {
      case 'name':
        aVal = a.name;
        bVal = b.name;
        break;
      case 'position':
        aVal = a.position;
        bVal = b.position;
        break;
      case 'ev':
        aVal = a.expected_score;
        bVal = b.expected_score;
        break;
      case 'value':
        aVal = getValue(a);
        bVal = getValue(b);
        break;
      case 'delta':
        aVal = a.delta;
        bVal = b.delta;
        break;
    }

    // For string comparison (name column)
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const cmp = aVal.localeCompare(bVal);
      return sortMode === 'asc' ? cmp : -cmp;
    }

    // For numeric comparison
    const aNum = aVal as number;
    const bNum = bVal as number;

    if (sortMode === 'abs-desc') {
      return Math.abs(bNum) - Math.abs(aNum);
    } else if (sortMode === 'desc') {
      return bNum - aNum;
    } else {
      return aNum - bNum;
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
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => selectTeam(team.name)}
              >
                <td className="py-2 text-sm font-medium text-gray-900">{team.name}</td>
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
