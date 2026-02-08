import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard/Dashboard';
import { TeamPanel } from './components/TeamPanel/TeamPanel';
import { GamePanel } from './components/GamePanel';
import { useUIStore } from './store/uiStore';

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
  const initWhatIf = useUIStore((state) => state.initWhatIf);
  const whatIfLoaded = useUIStore((state) => state.whatIfLoaded);

  // Load persisted what-if state on startup
  useEffect(() => {
    if (!whatIfLoaded) {
      initWhatIf();
    }
  }, [initWhatIf, whatIfLoaded]);

  const hasSidebar = selectedTeam || selectedGame;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className={`max-w-7xl mx-auto px-4 py-4 transition-all duration-300 ${hasSidebar ? 'mr-96' : ''}`}>
          <h1 className="text-xl font-semibold text-gray-900">
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
