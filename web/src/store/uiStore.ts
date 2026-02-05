import { create } from 'zustand';
import type { WhatIfGameOutcome, WhatIfState, ViewMode, HypotheticalTrade } from '../types';
import { analysisApi } from '../api/analysis';

interface SelectedGame {
  team1: string;
  team2: string;
  bothConfirmedFromCompleted?: boolean;  // True if both teams reached this matchup via completed games
}

interface MetaTeamModal {
  round: number;
  position: number;
}

interface UIState {
  selectedTeam: string | null;
  selectedGame: SelectedGame | null;
  bracketZoom: number;
  whatIf: WhatIfState;
  whatIfLoaded: boolean;
  metaTeamModal: MetaTeamModal | null;
  monteCarloStale: boolean;
  // View mode for Dashboard tabs (moved from Dashboard local state)
  viewMode: ViewMode;
  // Team selected for detailed view (separate from sidebar selectedTeam)
  detailedViewTeam: string | null;
  // Hypothetical trade for exploration (not persisted)
  hypotheticalTrade: HypotheticalTrade | null;

  // Actions
  selectTeam: (team: string | null) => void;
  selectGame: (game: SelectedGame | null) => void;
  setBracketZoom: (zoom: number) => void;
  initWhatIf: () => Promise<void>;
  setGameOutcome: (winner: string, loser: string) => void;
  removeGameOutcome: (winner: string, loser: string) => void;
  setGameOutcomes: (outcomes: WhatIfGameOutcome[]) => void;
  setRatingAdjustment: (team: string, delta: number) => void;
  removeRatingAdjustment: (team: string) => void;
  clearWhatIf: () => void;
  openMetaTeamModal: (round: number, position: number) => void;
  closeMetaTeamModal: () => void;
  markMonteCarloStale: () => void;
  clearMonteCarloStale: () => void;
  // View mode actions
  setViewMode: (mode: ViewMode) => void;
  // Detailed view actions
  setDetailedViewTeam: (team: string | null) => void;
  navigateToDetailedView: (team: string) => void;
  // Hypothetical trade actions
  setHypotheticalTrade: (trade: HypotheticalTrade | null) => void;
  updateHypotheticalTrade: (updates: Partial<HypotheticalTrade>) => void;
  clearHypotheticalTrade: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTeam: null,
  selectedGame: null,
  bracketZoom: 1,
  whatIf: {
    gameOutcomes: [],
    ratingAdjustments: {},
  },
  whatIfLoaded: false,
  metaTeamModal: null,
  monteCarloStale: false,
  viewMode: 'overview',
  detailedViewTeam: null,
  hypotheticalTrade: null,

  selectTeam: (team) => set({ selectedTeam: team, selectedGame: null }),

  selectGame: (game) => set({ selectedGame: game, selectedTeam: null }),

  setBracketZoom: (zoom) => set({ bracketZoom: zoom }),

  initWhatIf: async () => {
    try {
      const state = await analysisApi.getWhatIfState();
      set({
        whatIfLoaded: true,
        whatIf: {
          gameOutcomes: state.gameOutcomes || [],
          ratingAdjustments: state.ratingAdjustments || {},
        },
      });
    } catch (e) {
      console.error('Failed to load what-if state:', e);
      set({ whatIfLoaded: true });
    }
  },

  setGameOutcome: (winner, loser) => {
    // Update local state
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        gameOutcomes: [
          ...state.whatIf.gameOutcomes.filter(
            (o) => !(o.winner === winner || o.winner === loser || o.loser === winner || o.loser === loser)
          ),
          { winner, loser },
        ],
      },
    }));
    // Persist to backend
    analysisApi.setWhatIfGameOutcome(winner, loser).catch((e) =>
      console.error('Failed to persist game outcome:', e)
    );
  },

  removeGameOutcome: (winner, loser) => {
    // Update local state
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        gameOutcomes: state.whatIf.gameOutcomes.filter(
          (o) => !(o.winner === winner && o.loser === loser)
        ),
      },
    }));
    // Persist to backend
    analysisApi.removeWhatIfGameOutcome(winner, loser).catch((e) =>
      console.error('Failed to remove game outcome:', e)
    );
  },

  setGameOutcomes: (outcomes) =>
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        gameOutcomes: outcomes,
      },
    })),

  setRatingAdjustment: (team, delta) => {
    // Update local state
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        ratingAdjustments: {
          ...state.whatIf.ratingAdjustments,
          [team]: delta,
        },
      },
    }));
    // Persist to backend
    analysisApi.setWhatIfRatingAdjustment(team, delta).catch((e) =>
      console.error('Failed to persist rating adjustment:', e)
    );
  },

  removeRatingAdjustment: (team) => {
    // Update local state
    set((state) => {
      const { [team]: _, ...rest } = state.whatIf.ratingAdjustments;
      return {
        monteCarloStale: true,
        whatIf: {
          ...state.whatIf,
          ratingAdjustments: rest,
        },
      };
    });
    // Persist to backend
    analysisApi.removeWhatIfRatingAdjustment(team).catch((e) =>
      console.error('Failed to remove rating adjustment:', e)
    );
  },

  clearWhatIf: () => {
    // Update local state
    set({
      monteCarloStale: false,
      whatIf: {
        gameOutcomes: [],
        ratingAdjustments: {},
      },
    });
    // Persist to backend
    analysisApi.clearWhatIfState().catch((e) =>
      console.error('Failed to clear what-if state:', e)
    );
  },

  openMetaTeamModal: (round, position) =>
    set({ metaTeamModal: { round, position } }),

  closeMetaTeamModal: () =>
    set({ metaTeamModal: null }),

  markMonteCarloStale: () =>
    set({ monteCarloStale: true }),

  clearMonteCarloStale: () =>
    set({ monteCarloStale: false }),

  // View mode actions
  setViewMode: (mode) => set({ viewMode: mode }),

  // Detailed view actions
  setDetailedViewTeam: (team) => set({ detailedViewTeam: team }),

  navigateToDetailedView: (team) =>
    set({ viewMode: 'teamdetail', detailedViewTeam: team, selectedTeam: null, selectedGame: null }),

  // Hypothetical trade actions
  setHypotheticalTrade: (trade) => set({ hypotheticalTrade: trade }),

  updateHypotheticalTrade: (updates) =>
    set((state) => ({
      hypotheticalTrade: state.hypotheticalTrade
        ? { ...state.hypotheticalTrade, ...updates }
        : null,
    })),

  clearHypotheticalTrade: () => set({ hypotheticalTrade: null }),
}));
