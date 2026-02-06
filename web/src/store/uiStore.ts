import { create } from 'zustand';
import type { WhatIfGameOutcome, WhatIfState, ViewMode, HypotheticalTrade, Scenario } from '../types';
import { analysisApi } from '../api/analysis';

interface SelectedGame {
  team1: string;
  team2: string;
  bothConfirmedFromCompleted?: boolean;  // True if both teams reached this matchup via completed games
}

interface MetaTeamModal {
  nodeId: string;
  // Deprecated: kept for backward compatibility during migration
  round?: number;
  position?: number;
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
  // Hypothetical trade for exploration (not persisted)
  hypotheticalTrade: HypotheticalTrade | null;

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
  // Deprecated: use openMetaTeamModal with nodeId instead
  openMetaTeamModalLegacy: (round: number, position: number) => void;
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

const emptyWhatIfState: WhatIfState = {
  permanentGameOutcomes: [],
  permanentRatingAdjustments: {},
  scenarioGameOutcomes: [],
  scenarioRatingAdjustments: {},
  activeScenarioId: null,
  activeScenarioName: null,
};

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
  hypotheticalTrade: null,

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

    // Update local state
    set((state) => {
      if (isPermanent) {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            permanentGameOutcomes: [
              ...state.whatIf.permanentGameOutcomes.filter(
                (o) => !((o.team1 === t1 && o.team2 === t2) || (o.team1 === t2 && o.team2 === t1))
              ),
              { team1: t1, team2: t2, probability: prob },
            ],
          },
        };
      } else {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            scenarioGameOutcomes: [
              ...state.whatIf.scenarioGameOutcomes.filter(
                (o) => !((o.team1 === t1 && o.team2 === t2) || (o.team1 === t2 && o.team2 === t1))
              ),
              { team1: t1, team2: t2, probability: prob },
            ],
          },
        };
      }
    });
    // Persist to backend
    analysisApi.setWhatIfGameOutcome(t1, t2, prob, isPermanent).catch((e) =>
      console.error('Failed to persist game outcome:', e)
    );
  },

  removeGameOutcome: (team1, team2, isPermanent) => {
    // Normalize to lexicographic order
    const [t1, t2] = team1 < team2 ? [team1, team2] : [team2, team1];

    // Update local state
    set((state) => {
      if (isPermanent) {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            permanentGameOutcomes: state.whatIf.permanentGameOutcomes.filter(
              (o) => !(o.team1 === t1 && o.team2 === t2)
            ),
          },
        };
      } else {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            scenarioGameOutcomes: state.whatIf.scenarioGameOutcomes.filter(
              (o) => !(o.team1 === t1 && o.team2 === t2)
            ),
          },
        };
      }
    });
    // Persist to backend
    analysisApi.removeWhatIfGameOutcome(t1, t2, isPermanent).catch((e) =>
      console.error('Failed to remove game outcome:', e)
    );
  },

  setGameOutcomes: (outcomes, isPermanent) => {
    // Update local state
    set((state) => ({
      monteCarloStale: true,
      whatIf: isPermanent
        ? { ...state.whatIf, permanentGameOutcomes: outcomes }
        : { ...state.whatIf, scenarioGameOutcomes: outcomes },
    }));
    // Persist each outcome to backend
    for (const outcome of outcomes) {
      analysisApi.setWhatIfGameOutcome(outcome.team1, outcome.team2, outcome.probability, isPermanent).catch((e) =>
        console.error('Failed to persist game outcome:', e)
      );
    }
  },

  setRatingAdjustment: (team, delta, isPermanent = false) => {
    // Update local state
    set((state) => {
      if (isPermanent) {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            permanentRatingAdjustments: {
              ...state.whatIf.permanentRatingAdjustments,
              [team]: delta,
            },
          },
        };
      } else {
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            scenarioRatingAdjustments: {
              ...state.whatIf.scenarioRatingAdjustments,
              [team]: delta,
            },
          },
        };
      }
    });
    // Persist to backend
    analysisApi.setWhatIfRatingAdjustment(team, delta, isPermanent).catch((e) =>
      console.error('Failed to persist rating adjustment:', e)
    );
  },

  removeRatingAdjustment: (team, isPermanent) => {
    // Update local state
    set((state) => {
      if (isPermanent) {
        const { [team]: _, ...rest } = state.whatIf.permanentRatingAdjustments;
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            permanentRatingAdjustments: rest,
          },
        };
      } else {
        const { [team]: _, ...rest } = state.whatIf.scenarioRatingAdjustments;
        return {
          monteCarloStale: true,
          whatIf: {
            ...state.whatIf,
            scenarioRatingAdjustments: rest,
          },
        };
      }
    });
    // Persist to backend
    analysisApi.removeWhatIfRatingAdjustment(team, isPermanent).catch((e) =>
      console.error('Failed to remove rating adjustment:', e)
    );
  },

  clearTemporaryOverrides: () => {
    // Update local state - only clear scenario overrides
    set((state) => ({
      monteCarloStale: true,
      whatIf: {
        ...state.whatIf,
        scenarioGameOutcomes: [],
        scenarioRatingAdjustments: {},
      },
    }));
    // Persist to backend
    analysisApi.clearTemporaryOverrides().catch((e) =>
      console.error('Failed to clear temporary overrides:', e)
    );
  },

  clearWhatIf: () => {
    // Update local state - clear everything
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
    // Persist to backend
    analysisApi.clearWhatIfState().catch((e) =>
      console.error('Failed to clear what-if state:', e)
    );
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

        const { [team]: _, ...restScenario } = state.whatIf.scenarioRatingAdjustments;
        return {
          whatIf: {
            ...state.whatIf,
            scenarioRatingAdjustments: restScenario,
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

  // Deprecated: use openMetaTeamModal with nodeId instead
  openMetaTeamModalLegacy: (round, position) =>
    set({ metaTeamModal: { nodeId: `R${round}-P${position}`, round, position } }),

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
