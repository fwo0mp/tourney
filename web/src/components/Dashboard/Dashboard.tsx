import { useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { LargestPositions } from './LargestPositions';
import { LargestDeltas } from './LargestDeltas';
import { BracketPreview } from '../Bracket/BracketPreview';
import { BracketView } from '../Bracket/BracketView';
import { WhatIfTool } from '../WhatIf';

type ViewMode = 'overview' | 'bracket' | 'whatif';

export function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setViewMode('bracket')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'bracket'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Full Bracket
        </button>
        <button
          onClick={() => setViewMode('whatif')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'whatif'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          What-If
        </button>
      </div>

      {viewMode === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <PortfolioSummary />
            </div>
            <div className="lg:col-span-2">
              <BracketPreview />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LargestPositions />
            <LargestDeltas />
          </div>
        </>
      )}

      {viewMode === 'bracket' && <BracketView />}

      {viewMode === 'whatif' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WhatIfTool />
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <h3 className="font-medium text-gray-700">Set Game Winners</h3>
                <p>Select hypothetical game outcomes to see how they would affect your portfolio value. Choose a winner and loser for upcoming matchups.</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-700">Adjust Team Ratings</h3>
                <p>Modify team ratings by adding or subtracting points. This simulates rating changes and shows the portfolio impact.</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-700">Analyze Scenario</h3>
                <p>Click "Analyze Scenario" to run simulations with your hypothetical changes and see the expected portfolio value change.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
