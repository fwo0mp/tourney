import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';

function getDeltaOpacity(delta: number, maxDelta: number): number {
  if (delta === 0) return 0.1;
  return 0.2 + (Math.abs(delta) / maxDelta) * 0.6;
}

export function BracketPreview() {
  const { data: teams, isLoading } = useTeams();
  const selectTeam = useUIStore((state) => state.selectTeam);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Exposure Map</h2>
        <div className="animate-pulse grid grid-cols-8 gap-1">
          {Array(64).fill(0).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const maxDelta = Math.max(...(teams || []).map((t) => Math.abs(t.delta)));

  // Sort teams by expected score (roughly seed order)
  const sortedTeams = [...(teams || [])].sort((a, b) => b.expected_score - a.expected_score);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Team Exposure Map</h2>
      <p className="text-xs text-gray-500 mb-4">
        Green = positive exposure, Red = negative exposure. Intensity shows magnitude.
      </p>
      <div className="grid grid-cols-8 gap-1">
        {sortedTeams.slice(0, 64).map((team) => (
          <div
            key={team.name}
            className={`h-10 rounded cursor-pointer flex items-center justify-center ${
              team.delta > 0 ? 'bg-green-500' : team.delta < 0 ? 'bg-red-500' : 'bg-gray-200'
            }`}
            style={{ opacity: getDeltaOpacity(team.delta, maxDelta) }}
            onClick={() => selectTeam(team.name)}
            title={`${team.name}: Delta ${team.delta.toFixed(2)}`}
          >
            <span className="text-xs font-medium text-white truncate px-1">
              {team.name.length > 8 ? team.name.substring(0, 6) + '..' : team.name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded opacity-80"></div>
          <span>Long exposure</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded"></div>
          <span>Neutral</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded opacity-80"></div>
          <span>Short exposure</span>
        </div>
      </div>
    </div>
  );
}
