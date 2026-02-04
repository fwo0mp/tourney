import { create } from 'zustand';
import type { WhatIfGameOutcome, WhatIfState } from '../types';

interface SelectedGame {
  team1: string;
  team2: string;
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
  metaTeamModal: MetaTeamModal | null;
  monteCarloStale: boolean;

  // Actions
  selectTeam: (team: string | null) => void;
  selectGame: (game: SelectedGame | null) => void;
  setBracketZoom: (zoom: number) => void;
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
}

export const useUIStore = create<UIState>((set) => ({
  selectedTeam: null,
  selectedGame: null,
  bracketZoom: 1,
  whatIf: {
    gameOutcomes: [],
    ratingAdjustments: {},
  },
  metaTeamModal: null,
  monteCarloStale: false,

  selectTeam: (team) => set({ selectedTeam: team, selectedGame: null }),

  selectGame: (game) => set({ selectedGame: game, selectedTeam: null }),

  setBracketZoom: (zoom) => set({ bracketZoom: zoom }),

  setGameOutcome: (winner, loser) =>
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
    })),

  removeGameOutcome: (winner, loser) =>
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        gameOutcomes: state.whatIf.gameOutcomes.filter(
          (o) => !(o.winner === winner && o.loser === loser)
        ),
      },
    })),

  setGameOutcomes: (outcomes) =>
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        gameOutcomes: outcomes,
      },
    })),

  setRatingAdjustment: (team, delta) =>
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        ratingAdjustments: {
          ...state.whatIf.ratingAdjustments,
          [team]: delta,
        },
      },
    })),

  removeRatingAdjustment: (team) =>
    set((state) => {
      const { [team]: _, ...rest } = state.whatIf.ratingAdjustments;
      return {
        monteCarloStale: true,
        whatIf: {
          ...state.whatIf,
          ratingAdjustments: rest,
        },
      };
    }),

  clearWhatIf: () =>
    set({
      monteCarloStale: false,
      whatIf: {
        gameOutcomes: [],
        ratingAdjustments: {},
      },
    }),

  openMetaTeamModal: (round, position) =>
    set({ metaTeamModal: { round, position } }),

  closeMetaTeamModal: () =>
    set({ metaTeamModal: null }),

  markMonteCarloStale: () =>
    set({ monteCarloStale: true }),

  clearMonteCarloStale: () =>
    set({ monteCarloStale: false }),
}));
