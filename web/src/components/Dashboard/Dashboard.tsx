import { PortfolioSummary } from './PortfolioSummary';
import { RecentTradesOverview } from './RecentTradesOverview';
import { TeamsTable } from './TeamsTable';
import { GameImportanceTable } from './GameImportanceTable';
import { BracketView } from '../Bracket/BracketView';
import { WhatIfTool } from '../WhatIf';
import { CompletedGamesView } from '../CompletedGames';
import { TeamDetailView } from '../TeamDetail';
import { useUIStore } from '../../store/uiStore';

export function Dashboard() {
  const viewMode = useUIStore((state) => state.viewMode);
  const setViewMode = useUIStore((state) => state.setViewMode);

  return (
    <div className="space-y-6">
      {/* Portfolio Summary - always visible */}
      <PortfolioSummary />

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          data-testid="dashboard-tab-teams"
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Teams
        </button>
        <button
          onClick={() => setViewMode('bracket')}
          data-testid="dashboard-tab-bracket"
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'bracket'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Bracket
        </button>
        <button
          onClick={() => setViewMode('whatif')}
          data-testid="dashboard-tab-whatif"
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'whatif'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          What-If
        </button>
        <button
          onClick={() => setViewMode('completed')}
          data-testid="dashboard-tab-completed"
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'completed'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Completed Games
        </button>
        <button
          onClick={() => setViewMode('teamdetail')}
          data-testid="dashboard-tab-teamdetail"
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            viewMode === 'teamdetail'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          }`}
        >
          Team Detail
        </button>
      </div>

      {viewMode === 'overview' && (
        <div className="space-y-6">
          <RecentTradesOverview />
          <TeamsTable />
          <GameImportanceTable />
        </div>
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

      {viewMode === 'completed' && <CompletedGamesView />}

      {viewMode === 'teamdetail' && <TeamDetailView />}
    </div>
  );
}
