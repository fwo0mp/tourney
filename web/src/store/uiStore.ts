import { create } from 'zustand';
import type { WhatIfGameOutcome } from '../types';

interface WhatIfState {
  gameOutcomes: WhatIfGameOutcome[];
  ratingAdjustments: Record<string, number>;
}

interface SelectedGame {
  team1: string;
  team2: string;
}

interface UIState {
  selectedTeam: string | null;
  selectedGame: SelectedGame | null;
  bracketZoom: number;
  whatIf: WhatIfState;

  // Actions
  selectTeam: (team: string | null) => void;
  selectGame: (game: SelectedGame | null) => void;
  setBracketZoom: (zoom: number) => void;
  setGameOutcome: (winner: string, loser: string) => void;
  removeGameOutcome: (winner: string, loser: string) => void;
  setRatingAdjustment: (team: string, delta: number) => void;
  removeRatingAdjustment: (team: string) => void;
  clearWhatIf: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTeam: null,
  selectedGame: null,
  bracketZoom: 1,
  whatIf: {
    gameOutcomes: [],
    ratingAdjustments: {},
  },

  selectTeam: (team) => set({ selectedTeam: team, selectedGame: null }),

  selectGame: (game) => set({ selectedGame: game, selectedTeam: null }),

  setBracketZoom: (zoom) => set({ bracketZoom: zoom }),

  setGameOutcome: (winner, loser) =>
    set((state) => ({
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
      whatIf: {
        ...state.whatIf,
        gameOutcomes: state.whatIf.gameOutcomes.filter(
          (o) => !(o.winner === winner && o.loser === loser)
        ),
      },
    })),

  setRatingAdjustment: (team, delta) =>
    set((state) => ({
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
        whatIf: {
          ...state.whatIf,
          ratingAdjustments: rest,
        },
      };
    }),

  clearWhatIf: () =>
    set({
      whatIf: {
        gameOutcomes: [],
        ratingAdjustments: {},
      },
    }),
}));
