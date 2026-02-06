import type { WhatIfGameOutcome } from '../../types';
import { useUIStore } from '../../store/uiStore';

interface OverridesListProps {
  title: string;
  gameOutcomes: WhatIfGameOutcome[];
  ratingAdjustments: Record<string, number>;
  isPermanent: boolean;
  showPromote?: boolean;
  emptyMessage?: string;
}

export function OverridesList({
  title,
  gameOutcomes,
  ratingAdjustments,
  isPermanent,
  showPromote = false,
  emptyMessage = 'No overrides',
}: OverridesListProps) {
  const {
    removeGameOutcome,
    removeRatingAdjustment,
    promoteGameOutcome,
    promoteRatingAdjustment,
  } = useUIStore();

  const adjustmentEntries = Object.entries(ratingAdjustments);
  const isEmpty = gameOutcomes.length === 0 && adjustmentEntries.length === 0;

  const formatOutcome = (outcome: WhatIfGameOutcome) => {
    const prob = outcome.probability;
    if (prob === 1.0) {
      return `${outcome.team1} beats ${outcome.team2}`;
    } else if (prob === 0.0) {
      return `${outcome.team2} beats ${outcome.team1}`;
    } else {
      // Show the higher probability team first
      if (prob > 0.5) {
        return `${outcome.team1} beats ${outcome.team2} (${(prob * 100).toFixed(0)}%)`;
      } else {
        return `${outcome.team2} beats ${outcome.team1} (${((1 - prob) * 100).toFixed(0)}%)`;
      }
    }
  };

  const formatAdjustment = (team: string, delta: number) => {
    const sign = delta >= 0 ? '+' : '';
    return `${team} ${sign}${delta.toFixed(1)} pts`;
  };

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <h4 className={`text-sm font-medium mb-2 ${isPermanent ? 'text-purple-400' : 'text-blue-400'}`}>
        {title}
      </h4>

      {isEmpty ? (
        <p className="text-xs text-zinc-500 italic">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {/* Game Outcomes */}
          {gameOutcomes.map((outcome) => (
            <div
              key={`${outcome.team1}-${outcome.team2}`}
              className="flex items-center justify-between text-sm bg-zinc-900/50 rounded px-2 py-1"
            >
              <span className="text-zinc-300 truncate flex-1">{formatOutcome(outcome)}</span>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {showPromote && (
                  <button
                    onClick={() => promoteGameOutcome(outcome.team1, outcome.team2)}
                    className="p-1 rounded hover:bg-zinc-700 text-purple-400 hover:text-purple-300"
                    title="Promote to permanent"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => removeGameOutcome(outcome.team1, outcome.team2, isPermanent)}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400"
                  title="Remove override"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Rating Adjustments */}
          {adjustmentEntries.map(([team, delta]) => (
            <div
              key={team}
              className="flex items-center justify-between text-sm bg-zinc-900/50 rounded px-2 py-1"
            >
              <span className="text-zinc-300 truncate flex-1">{formatAdjustment(team, delta)}</span>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {showPromote && (
                  <button
                    onClick={() => promoteRatingAdjustment(team)}
                    className="p-1 rounded hover:bg-zinc-700 text-purple-400 hover:text-purple-300"
                    title="Promote to permanent"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => removeRatingAdjustment(team, isPermanent)}
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-red-400"
                  title="Remove override"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
