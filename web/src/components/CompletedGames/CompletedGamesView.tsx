import { useState } from 'react';
import { useCompletedGames, useAddCompletedGame, useRemoveCompletedGame, useTeams } from '../../hooks/useTournament';
import type { CompletedGame } from '../../types';

export function CompletedGamesView() {
  const { data: completedGames, isLoading: gamesLoading } = useCompletedGames();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const addGameMutation = useAddCompletedGame();
  const removeGameMutation = useRemoveCompletedGame();

  const [winner, setWinner] = useState('');
  const [loser, setLoser] = useState('');
  const [error, setError] = useState<string | null>(null);

  const testIdSafe = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-');

  // Get eliminated teams for filtering
  const eliminatedTeams = new Set(completedGames?.map((g) => g.loser) || []);

  // Filter to teams that are still active (not eliminated)
  const activeTeams = (teams || []).filter((t) => !eliminatedTeams.has(t.name));

  const handleAddGame = async () => {
    if (!winner || !loser) {
      setError('Please select both winner and loser');
      return;
    }
    if (winner === loser) {
      setError('Winner and loser must be different teams');
      return;
    }

    setError(null);
    try {
      await addGameMutation.mutateAsync({ winner, loser });
      setWinner('');
      setLoser('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add game');
    }
  };

  const handleRemoveGame = async (game: CompletedGame) => {
    try {
      await removeGameMutation.mutateAsync({ winner: game.winner, loser: game.loser });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove game');
    }
  };

  if (gamesLoading || teamsLoading) {
    return (
      <div data-testid="completed-games-view-loading" className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Completed Games</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="completed-games-view" className="space-y-6">
      {/* Add new completed game */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Record Game Result</h2>

        {error && (
          <div data-testid="completed-games-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Winner</label>
            <select
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              data-testid="completed-winner-select"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select winner...</option>
              {activeTeams
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((team) => (
                  <option key={team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loser</label>
            <select
              value={loser}
              onChange={(e) => setLoser(e.target.value)}
              data-testid="completed-loser-select"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select loser...</option>
              {activeTeams
                .filter((t) => t.name !== winner)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((team) => (
                  <option key={team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={handleAddGame}
            disabled={addGameMutation.isPending || !winner || !loser}
            data-testid="completed-record-button"
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addGameMutation.isPending ? 'Adding...' : 'Record Result'}
          </button>
        </div>
      </div>

      {/* List of completed games */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Completed Games ({completedGames?.length || 0})
        </h2>

        {completedGames?.length === 0 ? (
          <p className="text-gray-500 text-sm">No games have been recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table data-testid="completed-games-table" className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Winner
                  </th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Loser
                  </th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {completedGames?.map((game) => (
                  <tr
                    key={`${game.winner}-${game.loser}`}
                    data-testid={`completed-game-row-${testIdSafe(game.winner)}-${testIdSafe(game.loser)}`}
                    className="border-b border-gray-100"
                  >
                    <td className="py-3 text-sm font-medium text-green-700">{game.winner}</td>
                    <td className="py-3 text-sm text-gray-400 line-through">{game.loser}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleRemoveGame(game)}
                        disabled={removeGameMutation.isPending}
                        data-testid={`completed-remove-${testIdSafe(game.winner)}-${testIdSafe(game.loser)}`}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h3 className="font-medium text-gray-700">Permanent Results</h3>
            <p>
              Completed games are stored permanently and automatically applied to all portfolio
              calculations. Unlike what-if scenarios, these results cannot be overridden.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-700">Eliminated Teams</h3>
            <p>
              Teams that lose a game are marked as eliminated. They appear greyed out in the
              bracket and teams list, and cannot be selected as winners in future games.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-gray-700">Corrections</h3>
            <p>
              If you record a result incorrectly, you can remove it using the "Remove" button.
              This will restore the losing team and recalculate all portfolio values.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
