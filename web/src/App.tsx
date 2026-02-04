import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard/Dashboard';
import { TeamPanel } from './components/TeamPanel/TeamPanel';
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className={`max-w-7xl mx-auto px-4 py-4 transition-all ${selectedTeam ? 'mr-96' : ''}`}>
          <h1 className="text-xl font-semibold text-gray-900">
            Tournament Trading Dashboard
          </h1>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto px-4 py-6 transition-all ${selectedTeam ? 'mr-96' : ''}`}>
        <Dashboard />
      </main>

      {selectedTeam && <TeamPanel teamName={selectedTeam} />}
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
