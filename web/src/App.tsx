import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard/Dashboard';
import { TeamPanel } from './components/TeamPanel/TeamPanel';
import { GamePanel } from './components/GamePanel';
import { useUIStore } from './store/uiStore';
import { buildNavigationSearch, parseNavigationStateFromSearch } from './utils/navigationUrlState';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);
  const viewMode = useUIStore((state) => state.viewMode);
  const bracketView = useUIStore((state) => state.bracketView);
  const detailedViewTeam = useUIStore((state) => state.detailedViewTeam);
  const initWhatIf = useUIStore((state) => state.initWhatIf);
  const whatIfLoaded = useUIStore((state) => state.whatIfLoaded);
  const didInitUrlSyncRef = useRef(false);

  // Load persisted what-if state on startup
  useEffect(() => {
    if (!whatIfLoaded) {
      initWhatIf();
    }
  }, [initWhatIf, whatIfLoaded]);

  // Keep browser history in sync with navigational UI state.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentState = useUIStore.getState();
    const canonicalSearch = buildNavigationSearch(window.location.search, {
      viewMode: currentState.viewMode,
      bracketView: currentState.bracketView,
      selectedTeam: currentState.selectedTeam,
      selectedGame: currentState.selectedGame,
      detailedViewTeam: currentState.detailedViewTeam,
    });

    if (canonicalSearch !== window.location.search) {
      const canonicalUrl = `${window.location.pathname}${canonicalSearch}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', canonicalUrl);
    }

    const handlePopState = () => {
      const nextNavState = parseNavigationStateFromSearch(window.location.search);
      useUIStore.setState({
        viewMode: nextNavState.viewMode,
        bracketView: nextNavState.bracketView,
        selectedTeam: nextNavState.selectedTeam,
        selectedGame: nextNavState.selectedGame,
        detailedViewTeam: nextNavState.detailedViewTeam,
      });
    };

    didInitUrlSyncRef.current = true;
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !didInitUrlSyncRef.current) return;

    const nextSearch = buildNavigationSearch(window.location.search, {
      viewMode,
      bracketView,
      selectedTeam,
      selectedGame,
      detailedViewTeam,
    });

    if (nextSearch === window.location.search) return;
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history.pushState(window.history.state, '', nextUrl);
  }, [
    viewMode,
    bracketView,
    selectedTeam,
    selectedGame?.team1,
    selectedGame?.team2,
    selectedGame?.bothConfirmedFromCompleted,
    detailedViewTeam,
  ]);

  const hasSidebar = selectedTeam || selectedGame;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className={`max-w-7xl mx-auto px-4 py-4 transition-all duration-300 ${hasSidebar ? 'mr-96' : ''}`}>
          <h1 data-testid="app-title" className="text-xl font-semibold text-gray-900">
            Tournament Trading Dashboard
          </h1>
        </div>
      </header>

      <main className={`px-4 py-6 transition-all duration-300 ${hasSidebar ? 'mr-96' : 'max-w-7xl mx-auto'}`}>
        <Dashboard />
      </main>

      {selectedTeam && <TeamPanel teamName={selectedTeam} />}
      {selectedGame && <GamePanel team1={selectedGame.team1} team2={selectedGame.team2} />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
