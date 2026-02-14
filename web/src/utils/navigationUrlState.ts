import type { BracketViewType, SelectedGame, ViewMode } from '../types';

const VIEW_MODES: readonly ViewMode[] = ['overview', 'bracket', 'whatif', 'completed', 'teamdetail'];
const BRACKET_VIEWS: readonly BracketViewType[] = ['overall', 'region1', 'region2', 'region3', 'region4', 'sweet16'];

const NAVIGATION_PARAMS = {
  viewMode: 'view',
  bracketView: 'bracketView',
  selectedTeam: 'team',
  gameTeam1: 'game1',
  gameTeam2: 'game2',
  gameConfirmed: 'gameConfirmed',
  detailedViewTeam: 'detailTeam',
} as const;

const MANAGED_NAVIGATION_PARAMS = Object.values(NAVIGATION_PARAMS);

export interface NavigationState {
  viewMode: ViewMode;
  bracketView: BracketViewType;
  selectedTeam: string | null;
  selectedGame: SelectedGame | null;
  detailedViewTeam: string | null;
}

const DEFAULT_NAVIGATION_STATE: NavigationState = {
  viewMode: 'overview',
  bracketView: 'overall',
  selectedTeam: null,
  selectedGame: null,
  detailedViewTeam: null,
};

function parseStringParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isViewMode(value: string | null): value is ViewMode {
  return value !== null && (VIEW_MODES as readonly string[]).includes(value);
}

function isBracketViewType(value: string | null): value is BracketViewType {
  return value !== null && (BRACKET_VIEWS as readonly string[]).includes(value);
}

function parseGameConfirmed(value: string | null): boolean | undefined {
  if (value === '1') return true;
  if (value === '0') return false;
  return undefined;
}

export function parseNavigationStateFromSearch(search: string): NavigationState {
  const params = new URLSearchParams(search);

  const viewModeParam = params.get(NAVIGATION_PARAMS.viewMode);
  const bracketViewParam = params.get(NAVIGATION_PARAMS.bracketView);
  const selectedTeamParam = parseStringParam(params.get(NAVIGATION_PARAMS.selectedTeam));
  const gameTeam1 = parseStringParam(params.get(NAVIGATION_PARAMS.gameTeam1));
  const gameTeam2 = parseStringParam(params.get(NAVIGATION_PARAMS.gameTeam2));
  const detailedViewTeamParam = parseStringParam(params.get(NAVIGATION_PARAMS.detailedViewTeam));

  const viewMode = isViewMode(viewModeParam) ? viewModeParam : DEFAULT_NAVIGATION_STATE.viewMode;
  const bracketView = isBracketViewType(bracketViewParam)
    ? bracketViewParam
    : DEFAULT_NAVIGATION_STATE.bracketView;

  let selectedGame: SelectedGame | null = null;
  if (gameTeam1 && gameTeam2) {
    const bothConfirmedFromCompleted = parseGameConfirmed(params.get(NAVIGATION_PARAMS.gameConfirmed));
    selectedGame = bothConfirmedFromCompleted === undefined
      ? { team1: gameTeam1, team2: gameTeam2 }
      : { team1: gameTeam1, team2: gameTeam2, bothConfirmedFromCompleted };
  }

  return {
    viewMode,
    bracketView,
    selectedTeam: selectedGame ? null : selectedTeamParam,
    selectedGame,
    detailedViewTeam: viewMode === 'teamdetail' ? detailedViewTeamParam : null,
  };
}

export function buildNavigationSearch(currentSearch: string, state: NavigationState): string {
  const params = new URLSearchParams(currentSearch);

  for (const key of MANAGED_NAVIGATION_PARAMS) {
    params.delete(key);
  }

  if (state.viewMode !== DEFAULT_NAVIGATION_STATE.viewMode) {
    params.set(NAVIGATION_PARAMS.viewMode, state.viewMode);
  }

  if (state.viewMode === 'bracket' && state.bracketView !== DEFAULT_NAVIGATION_STATE.bracketView) {
    params.set(NAVIGATION_PARAMS.bracketView, state.bracketView);
  }

  if (state.selectedGame) {
    params.set(NAVIGATION_PARAMS.gameTeam1, state.selectedGame.team1);
    params.set(NAVIGATION_PARAMS.gameTeam2, state.selectedGame.team2);
    if (state.selectedGame.bothConfirmedFromCompleted !== undefined) {
      params.set(
        NAVIGATION_PARAMS.gameConfirmed,
        state.selectedGame.bothConfirmedFromCompleted ? '1' : '0',
      );
    }
  } else if (state.selectedTeam) {
    params.set(NAVIGATION_PARAMS.selectedTeam, state.selectedTeam);
  }

  if (state.viewMode === 'teamdetail' && state.detailedViewTeam) {
    params.set(NAVIGATION_PARAMS.detailedViewTeam, state.detailedViewTeam);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}
