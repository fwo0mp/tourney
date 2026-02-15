import { useGameImportance } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { SortHeader, useSortState, sortData } from '../common';
import type { GameImportance } from '../../types';

type SortColumn = 'matchup' | 'round' | 'win_prob' | 'if_team1_wins' | 'if_team2_wins' | 'raw_importance' | 'adjusted_importance';

function deltaColor(val: number): string {
  if (val > 0) return 'text-green-600';
  if (val < 0) return 'text-red-600';
  return 'text-gray-400';
}

function formatDelta(val: number): string {
  return (val > 0 ? '+' : '') + val.toFixed(2);
}

export function GameImportanceTable() {
  const { data, isLoading } = useGameImportance();
  const selectGame = useUIStore((state) => state.selectGame);
  const { sortColumn, sortMode, handleSort } = useSortState<SortColumn>('adjusted_importance');

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Importance</h2>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const games = data?.games ?? [];

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Importance</h2>
        <p className="text-sm text-gray-500">No upcoming determined games found.</p>
      </div>
    );
  }

  const sorted = sortData(games, sortColumn, sortMode, (game: GameImportance, column: SortColumn) => {
    switch (column) {
      case 'matchup': return `${game.team1} vs ${game.team2}`;
      case 'round': return game.round;
      case 'win_prob': return game.win_prob;
      case 'if_team1_wins': return game.if_team1_wins;
      case 'if_team2_wins': return game.if_team2_wins;
      case 'raw_importance': return game.raw_importance;
      case 'adjusted_importance': return game.adjusted_importance;
      default: return 0;
    }
  });

  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col h-[500px]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">Game Importance</h2>
        <span className="text-xs text-gray-500">
          {games.length} upcoming games
        </span>
      </div>
      <div className="overflow-auto flex-1">
        <table data-testid="game-importance-table" className="min-w-full">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200">
              <SortHeader label="Matchup" column="matchup" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} align="left" />
              <SortHeader label="Rd" column="round" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="Win %" column="win_prob" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="If T1" column="if_team1_wins" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="If T2" column="if_team2_wins" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="Raw" column="raw_importance" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
              <SortHeader label="Adj" column="adjusted_importance" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((game: GameImportance) => (
              <tr
                key={`${game.team1}-${game.team2}`}
                data-testid="game-importance-row"
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => selectGame({ team1: game.team1, team2: game.team2, bothConfirmedFromCompleted: true })}
              >
                <td className="py-2 text-sm font-medium text-gray-900">
                  {game.team1} <span className="text-gray-400">vs</span> {game.team2}
                </td>
                <td className="py-2 text-sm text-right text-gray-600">
                  {game.round + 1}
                </td>
                <td className="py-2 text-sm text-right text-gray-600">
                  {(game.win_prob * 100).toFixed(0)}%
                </td>
                <td className={`py-2 text-sm text-right ${deltaColor(game.if_team1_wins)}`}>
                  {formatDelta(game.if_team1_wins)}
                </td>
                <td className={`py-2 text-sm text-right ${deltaColor(game.if_team2_wins)}`}>
                  {formatDelta(game.if_team2_wins)}
                </td>
                <td className="py-2 text-sm text-right font-medium text-blue-600">
                  {game.raw_importance.toFixed(2)}
                </td>
                <td className="py-2 text-sm text-right font-medium text-blue-600">
                  {game.adjusted_importance.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
