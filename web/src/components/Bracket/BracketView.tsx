import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBracket, useGameImportance, useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { MetaTeamModal } from './MetaTeamModal';
import { RegionBracket } from './RegionBracket';
import { Sweet16Bracket } from './Sweet16Bracket';
import type { BracketGame, PlayInGame, TeamInfo } from '../../types';
import type { BracketViewType } from './bracketConstants';
import { getDeltaColor, getImportanceColor, makeGameKey } from './bracketUtils';

interface RegionData {
  games: BracketGame[];
  playInGames: PlayInGame[];
}

const REGION_COUNT = 4;
const REGION_SIZE = 16;

function getFirstTeamName(regionGames: BracketGame[]): string {
  const firstGame = regionGames[0];
  if (!firstGame) {
    return 'Unknown';
  }

  const teamNames = Object.keys(firstGame.teams);
  return teamNames[0] || 'Unknown';
}

function splitRegions(games: BracketGame[], playInGames: PlayInGame[]): RegionData[] {
  return Array.from({ length: REGION_COUNT }, (_, regionIndex) => {
    const start = regionIndex * REGION_SIZE;
    const end = start + REGION_SIZE;
    return {
      games: games.slice(start, end),
      playInGames: playInGames.filter((game) => game.slot_index >= start && game.slot_index < end),
    };
  });
}

function buildTeamInfoMap(teams: TeamInfo[]): Map<string, TeamInfo> {
  return new Map(teams.map((team) => [team.name, team]));
}

function buildGameImportance(games: { team1: string; team2: string; adjusted_importance: number }[] | undefined): {
  gameImportanceMap: Map<string, number>;
  maxImportance: number;
} {
  const gameImportanceMap = new Map<string, number>();
  let maxImportance = 0;

  for (const game of games ?? []) {
    const key = makeGameKey(game.team1, game.team2);
    gameImportanceMap.set(key, game.adjusted_importance);
    if (game.adjusted_importance > maxImportance) {
      maxImportance = game.adjusted_importance;
    }
  }

  return { gameImportanceMap, maxImportance };
}

export function BracketView() {
  const [view, setView] = useState<BracketViewType>('overall');
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: bracket, isLoading: bracketLoading } = useBracket();
  const { data: importanceData } = useGameImportance();
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);
  const metaTeamModal = useUIStore((state) => state.metaTeamModal);
  const closeMetaTeamModal = useUIStore((state) => state.closeMetaTeamModal);
  const whatIf = useUIStore((state) => state.whatIf);

  // Re-center bracket when sidebar opens/closes or view changes.
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;
    if (scrollWidth > clientWidth) {
      container.scrollLeft = (scrollWidth - clientWidth) / 2;
    }
  }, [selectedTeam, selectedGame, view]);

  const safeTeams = teams ?? [];
  const safeGames = bracket?.games ?? [];
  const safePlayInGames = bracket?.play_in_games ?? [];

  const teamInfoMap = useMemo(() => buildTeamInfoMap(safeTeams), [safeTeams]);
  const maxDelta = useMemo(
    () => (safeTeams.length ? Math.max(...safeTeams.map((team) => Math.abs(team.delta))) : 0),
    [safeTeams],
  );
  const completedGames = bracket?.completed_games ?? [];

  const { gameImportanceMap, maxImportance } = useMemo(
    () => buildGameImportance(importanceData?.games),
    [importanceData?.games],
  );

  const regions = useMemo(
    () => splitRegions(safeGames, safePlayInGames),
    [safeGames, safePlayInGames],
  );

  const viewOptions: { value: BracketViewType; label: string }[] = useMemo(
    () => [
      { value: 'overall', label: 'Overall' },
      { value: 'region1', label: `Region 1 (${getFirstTeamName(regions[0]?.games ?? [])})` },
      { value: 'region2', label: `Region 2 (${getFirstTeamName(regions[1]?.games ?? [])})` },
      { value: 'region3', label: `Region 3 (${getFirstTeamName(regions[2]?.games ?? [])})` },
      { value: 'region4', label: `Region 4 (${getFirstTeamName(regions[3]?.games ?? [])})` },
      { value: 'sweet16', label: 'Sweet 16' },
    ],
    [regions],
  );

  const isLoading = teamsLoading || bracketLoading;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <div className="animate-pulse h-96 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!teams || teams.length === 0 || !bracket) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <p className="text-gray-500">No bracket data available</p>
      </div>
    );
  }

  const permanentCount =
    whatIf.permanentGameOutcomes.length + Object.keys(whatIf.permanentRatingAdjustments).length;
  const scenarioCount =
    whatIf.scenarioGameOutcomes.length + Object.keys(whatIf.scenarioRatingAdjustments).length;
  const hasWhatIfActive = permanentCount > 0 || scenarioCount > 0;

  const renderRegion = (
    regionIndex: number,
    opts: { compact?: boolean; flipHorizontal?: boolean } = {},
  ) => {
    const region = regions[regionIndex];
    if (!region) return null;

    return (
      <RegionBracket
        games={region.games}
        playInGames={region.playInGames}
        completedGames={completedGames}
        teamInfoMap={teamInfoMap}
        regionIndex={regionIndex}
        maxDelta={maxDelta}
        gameImportanceMap={gameImportanceMap}
        maxImportance={maxImportance}
        compact={opts.compact}
        flipHorizontal={opts.flipHorizontal}
      />
    );
  };

  const renderBracketContent = () => {
    if (view === 'overall') {
      return (
        <div className="inline-grid grid-cols-2 gap-4 mx-auto">
          <div className="space-y-6">
            {renderRegion(0, { compact: true })}
            {renderRegion(1, { compact: true })}
          </div>
          <div className="space-y-6">
            {renderRegion(2, { compact: true, flipHorizontal: true })}
            {renderRegion(3, { compact: true, flipHorizontal: true })}
          </div>
        </div>
      );
    }

    if (view === 'sweet16') {
      return (
        <Sweet16Bracket
          regions={regions}
          teamInfoMap={teamInfoMap}
          maxDelta={maxDelta}
          getFirstTeamName={getFirstTeamName}
        />
      );
    }

    const regionByView: Record<Exclude<BracketViewType, 'overall' | 'sweet16'>, number> = {
      region1: 0,
      region2: 1,
      region3: 2,
      region4: 3,
    };

    return renderRegion(regionByView[view]);
  };

  return (
    <div
      ref={containerRef}
      data-testid="bracket-view"
      className="bg-white rounded-lg shadow p-6 overflow-x-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Tournament Bracket</h2>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as BracketViewType)}
            data-testid="bracket-view-select"
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {viewOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {hasWhatIfActive && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Overrides Active ({permanentCount + scenarioCount})
            </span>
          )}
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-600">Team:</span>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getDeltaColor(maxDelta, maxDelta) }}
              />
              <span>+Delta</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded bg-gray-200" />
              <span>Neutral</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getDeltaColor(-maxDelta, maxDelta) }}
              />
              <span>-Delta</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-600">Game:</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d1d5db' }} />
              <span>Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: getImportanceColor(0.5, 1) }}
              />
              <span>Med</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1e40af' }} />
              <span>High</span>
            </div>
          </div>
        </div>
      </div>

      {renderBracketContent()}

      {metaTeamModal && <MetaTeamModal nodeId={metaTeamModal.nodeId} onClose={closeMetaTeamModal} />}
    </div>
  );
}
