import { create } from 'zustand';
import type { WhatIfGameOutcome, WhatIfState, ViewMode, Scenario } from '../types';
import { analysisApi } from '../api/analysis';

interface SelectedGame {
  team1: string;
  team2: string;
  bothConfirmedFromCompleted?: boolean;  // True if both teams reached this matchup via completed games
}

interface MetaTeamModal {
  nodeId: string;
}

interface UIState {
  selectedTeam: string | null;
  selectedGame: SelectedGame | null;
  bracketZoom: number;
  whatIf: WhatIfState;
  whatIfLoaded: boolean;
  scenarios: Scenario[];
  scenariosLoaded: boolean;
  metaTeamModal: MetaTeamModal | null;
  monteCarloStale: boolean;
  // View mode for Dashboard tabs (moved from Dashboard local state)
  viewMode: ViewMode;
  // Team selected for detailed view (separate from sidebar selectedTeam)
  detailedViewTeam: string | null;

  // Actions
  selectTeam: (team: string | null) => void;
  selectGame: (game: SelectedGame | null) => void;
  setBracketZoom: (zoom: number) => void;
  initWhatIf: () => Promise<void>;
  loadScenarios: () => Promise<void>;
  createScenario: (name: string, description?: string) => Promise<Scenario | null>;
  deleteScenario: (scenarioId: number) => Promise<void>;
  setActiveScenario: (scenarioId: number | null) => Promise<void>;
  setGameOutcome: (team1: string, team2: string, probability: number, isPermanent?: boolean) => void;
  removeGameOutcome: (team1: string, team2: string, isPermanent: boolean) => void;
  setGameOutcomes: (outcomes: WhatIfGameOutcome[], isPermanent: boolean) => void;
  setRatingAdjustment: (team: string, delta: number, isPermanent?: boolean) => void;
  removeRatingAdjustment: (team: string, isPermanent: boolean) => void;
  clearTemporaryOverrides: () => void;
  clearWhatIf: () => void;
  promoteGameOutcome: (team1: string, team2: string) => Promise<void>;
  promoteRatingAdjustment: (team: string) => Promise<void>;
  openMetaTeamModal: (nodeId: string) => void;
  closeMetaTeamModal: () => void;
  markMonteCarloStale: () => void;
  clearMonteCarloStale: () => void;
  // View mode actions
  setViewMode: (mode: ViewMode) => void;
  // Detailed view actions
  setDetailedViewTeam: (team: string | null) => void;
  navigateToDetailedView: (team: string) => void;
}

const emptyWhatIfState: WhatIfState = {
  permanentGameOutcomes: [],
  permanentRatingAdjustments: {},
  scenarioGameOutcomes: [],
  scenarioRatingAdjustments: {},
  activeScenarioId: null,
  activeScenarioName: null,
};

// Re-fetch authoritative what-if state from the server.
// Used as error recovery instead of rolling back to a potentially stale snapshot.
async function refetchWhatIfState(set: (partial: Partial<UIState>) => void) {
  try {
    const state = await analysisApi.getWhatIfState();
    set({ whatIf: state });
  } catch (refetchError) {
    console.error('Failed to re-fetch what-if state after error:', refetchError);
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  selectedTeam: null,
  selectedGame: null,
  bracketZoom: 1,
  whatIf: emptyWhatIfState,
  whatIfLoaded: false,
  scenarios: [],
  scenariosLoaded: false,
  metaTeamModal: null,
  monteCarloStale: false,
  viewMode: 'overview',
  detailedViewTeam: null,

  selectTeam: (team) => set({ selectedTeam: team, selectedGame: null }),

  selectGame: (game) => set({ selectedGame: game, selectedTeam: null }),

  setBracketZoom: (zoom) => set({ bracketZoom: zoom }),

  initWhatIf: async () => {
    try {
      const state = await analysisApi.getWhatIfState();
      set({
        whatIfLoaded: true,
        whatIf: state,
      });
    } catch (e) {
      console.error('Failed to load what-if state:', e);
      set({ whatIfLoaded: true });
    }
  },

  loadScenarios: async () => {
    try {
      const scenarios = await analysisApi.getScenarios();
      set({ scenarios, scenariosLoaded: true });
    } catch (e) {
      console.error('Failed to load scenarios:', e);
      set({ scenariosLoaded: true });
    }
  },

  createScenario: async (name, description) => {
    try {
      const scenario = await analysisApi.createScenario(name, description);
      set((state) => ({
        scenarios: [...state.scenarios, scenario].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      return scenario;
    } catch (e) {
      console.error('Failed to create scenario:', e);
      return null;
    }
  },

  deleteScenario: async (scenarioId) => {
    try {
      await analysisApi.deleteScenario(scenarioId);
      const currentState = get();
      // If deleted scenario was active, clear scenario overrides
      const wasActive = currentState.whatIf.activeScenarioId === scenarioId;
      set((state) => ({
        scenarios: state.scenarios.filter((s) => s.id !== scenarioId),
        whatIf: wasActive
          ? {
              ...state.whatIf,
              activeScenarioId: null,
              activeScenarioName: null,
              scenarioGameOutcomes: [],
              scenarioRatingAdjustments: {},
            }
          : state.whatIf,
      }));
    } catch (e) {
      console.error('Failed to delete scenario:', e);
    }
  },

  setActiveScenario: async (scenarioId) => {
    try {
      await analysisApi.setActiveScenario(scenarioId);
      // Reload what-if state to get the new scenario's overrides
      const state = await analysisApi.getWhatIfState();
      set({
        whatIf: state,
        monteCarloStale: true,
      });
    } catch (e) {
      console.error('Failed to set active scenario:', e);
    }
  },

  setGameOutcome: (team1, team2, probability, isPermanent = false) => {
    // Normalize to lexicographic order for consistent storage
    const [t1, t2, prob] = team1 < team2
      ? [team1, team2, probability]
      : [team2, team1, 1.0 - probability];

    // Optimistic update
    set((state) => {
      const key = isPermanent ? 'permanentGameOutcomes' : 'scenarioGameOutcomes';
      return {
        monteCarloStale: true,
        whatIf: {
          ...state.whatIf,
          [key]: [
            ...state.whatIf[key].filter(
              (o) => !((o.team1 === t1 && o.team2 === t2) || (o.team1 === t2 && o.team2 === t1))
            ),
            { team1: t1, team2: t2, probability: prob },
          ],
        },
      };
    });

    // Persist to backend, re-fetch server state on failure
    analysisApi.setWhatIfGameOutcome(t1, t2, prob, isPermanent).catch((e) => {
      console.error('Failed to persist game outcome, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  removeGameOutcome: (team1, team2, isPermanent) => {
    // Normalize to lexicographic order
    const [t1, t2] = team1 < team2 ? [team1, team2] : [team2, team1];

    set((state) => {
      const key = isPermanent ? 'permanentGameOutcomes' : 'scenarioGameOutcomes';
      return {
        monteCarloStale: true,
        whatIf: {
          ...state.whatIf,
          [key]: state.whatIf[key].filter(
            (o) => !(o.team1 === t1 && o.team2 === t2)
          ),
        },
      };
    });

    analysisApi.removeWhatIfGameOutcome(t1, t2, isPermanent).catch((e) => {
      console.error('Failed to remove game outcome, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  setGameOutcomes: (outcomes, isPermanent) => {
    const prevWhatIf = get().whatIf;
    const oldOutcomes = isPermanent
      ? prevWhatIf.permanentGameOutcomes
      : prevWhatIf.scenarioGameOutcomes;

    set((state) => ({
      monteCarloStale: true,
      whatIf: isPermanent
        ? { ...state.whatIf, permanentGameOutcomes: outcomes }
        : { ...state.whatIf, scenarioGameOutcomes: outcomes },
    }));

    // Diff old vs new to find removed outcomes
    const newKeys = new Set(outcomes.map((o) => `${o.team1}|${o.team2}`));
    const removedOutcomes = oldOutcomes.filter(
      (o) => !newKeys.has(`${o.team1}|${o.team2}`)
    );

    // Persist additions/updates and removals, re-fetch on failure
    Promise.all([
      ...outcomes.map((o) =>
        analysisApi.setWhatIfGameOutcome(o.team1, o.team2, o.probability, isPermanent)
      ),
      ...removedOutcomes.map((o) =>
        analysisApi.removeWhatIfGameOutcome(o.team1, o.team2, isPermanent)
      ),
    ]).catch((e) => {
      console.error('Failed to persist game outcomes, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  setRatingAdjustment: (team, delta, isPermanent = false) => {
    set((state) => {
      const key = isPermanent ? 'permanentRatingAdjustments' : 'scenarioRatingAdjustments';
      return {
        monteCarloStale: true,
        whatIf: {
          ...state.whatIf,
          [key]: { ...state.whatIf[key], [team]: delta },
        },
      };
    });

    analysisApi.setWhatIfRatingAdjustment(team, delta, isPermanent).catch((e) => {
      console.error('Failed to persist rating adjustment, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  removeRatingAdjustment: (team, isPermanent) => {
    set((state) => {
      const key = isPermanent ? 'permanentRatingAdjustments' : 'scenarioRatingAdjustments';
      const filtered = Object.fromEntries(
        Object.entries(state.whatIf[key]).filter(([k]) => k !== team)
      );
      return {
        monteCarloStale: true,
        whatIf: { ...state.whatIf, [key]: filtered },
      };
    });

    analysisApi.removeWhatIfRatingAdjustment(team, isPermanent).catch((e) => {
      console.error('Failed to remove rating adjustment, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  clearTemporaryOverrides: () => {
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        scenarioGameOutcomes: [],
        scenarioRatingAdjustments: {},
      },
    }));

    analysisApi.clearTemporaryOverrides().catch((e) => {
      console.error('Failed to clear temporary overrides, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  clearWhatIf: () => {
    set((state) => ({
      monteCarloStale: false,
      whatIf: {
        ...state.whatIf,
        permanentGameOutcomes: [],
        permanentRatingAdjustments: {},
        scenarioGameOutcomes: [],
        scenarioRatingAdjustments: {},
      },
    }));

    analysisApi.clearWhatIfState().catch((e) => {
      console.error('Failed to clear what-if state, re-fetching state:', e);
      refetchWhatIfState(set);
    });
  },

  promoteGameOutcome: async (team1, team2) => {
    // Normalize to lexicographic order
    const [t1, t2] = team1 < team2 ? [team1, team2] : [team2, team1];

    try {
      await analysisApi.promoteGameOutcome(t1, t2);
      // Move from scenario to permanent in local state
      set((state) => {
        const outcome = state.whatIf.scenarioGameOutcomes.find(
          (o) => o.team1 === t1 && o.team2 === t2
        );
        if (!outcome) return state;

        return {
          whatIf: {
            ...state.whatIf,
            scenarioGameOutcomes: state.whatIf.scenarioGameOutcomes.filter(
              (o) => !(o.team1 === t1 && o.team2 === t2)
            ),
            permanentGameOutcomes: [
              ...state.whatIf.permanentGameOutcomes.filter(
                (o) => !(o.team1 === t1 && o.team2 === t2)
              ),
              outcome,
            ],
          },
        };
      });
    } catch (e) {
      console.error('Failed to promote game outcome:', e);
    }
  },

  promoteRatingAdjustment: async (team) => {
    try {
      await analysisApi.promoteRatingAdjustment(team);
      // Move from scenario to permanent in local state
      set((state) => {
        const adjustment = state.whatIf.scenarioRatingAdjustments[team];
        if (adjustment === undefined) return state;

        const filteredScenario = Object.fromEntries(
          Object.entries(state.whatIf.scenarioRatingAdjustments).filter(([k]) => k !== team)
        );
        return {
          whatIf: {
            ...state.whatIf,
            scenarioRatingAdjustments: filteredScenario,
            permanentRatingAdjustments: {
              ...state.whatIf.permanentRatingAdjustments,
              [team]: adjustment,
            },
          },
        };
      });
    } catch (e) {
      console.error('Failed to promote rating adjustment:', e);
    }
  },

  openMetaTeamModal: (nodeId) =>
    set({ metaTeamModal: { nodeId } }),

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
}));
