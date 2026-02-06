import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';

interface ScenarioSelectorProps {
  compact?: boolean;
}

export function ScenarioSelector({ compact = false }: ScenarioSelectorProps) {
  const {
    whatIf,
    scenarios,
    scenariosLoaded,
    loadScenarios,
    createScenario,
    deleteScenario,
    setActiveScenario,
  } = useUIStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load scenarios on mount
  useEffect(() => {
    if (!scenariosLoaded) {
      loadScenarios();
    }
  }, [scenariosLoaded, loadScenarios]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setConfirmDelete(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const scenario = await createScenario(newName.trim());
    if (scenario) {
      setNewName('');
      setIsCreating(false);
      // Optionally activate the new scenario
      await setActiveScenario(scenario.id);
    }
  };

  const handleDelete = async (scenarioId: number) => {
    if (confirmDelete === scenarioId) {
      await deleteScenario(scenarioId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(scenarioId);
    }
  };

  const handleSelect = async (scenarioId: number | null) => {
    await setActiveScenario(scenarioId);
    setIsOpen(false);
  };

  const activeLabel = whatIf.activeScenarioName || 'Default';

  if (compact) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
            whatIf.activeScenarioId
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-zinc-700 text-zinc-300 border border-zinc-600'
          }`}
        >
          <span className="truncate max-w-24">{activeLabel}</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50">
            <div className="py-1">
              <button
                onClick={() => handleSelect(null)}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-700 flex items-center justify-between ${
                  !whatIf.activeScenarioId ? 'text-blue-400' : 'text-zinc-300'
                }`}
              >
                <span>Default (Permanent Only)</span>
                {!whatIf.activeScenarioId && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {scenarios.length > 0 && <div className="border-t border-zinc-700 my-1" />}

              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`flex items-center justify-between px-3 py-1.5 hover:bg-zinc-700 ${
                    whatIf.activeScenarioId === scenario.id ? 'text-blue-400' : 'text-zinc-300'
                  }`}
                >
                  <button
                    onClick={() => handleSelect(scenario.id)}
                    className="flex-1 text-left text-sm truncate"
                  >
                    {scenario.name}
                  </button>
                  {whatIf.activeScenarioId === scenario.id && (
                    <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(scenario.id);
                    }}
                    className={`p-0.5 rounded hover:bg-zinc-600 flex-shrink-0 ${
                      confirmDelete === scenario.id ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={confirmDelete === scenario.id ? 'Click again to confirm' : 'Delete scenario'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              <div className="border-t border-zinc-700 my-1" />

              {isCreating ? (
                <div className="px-2 py-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') {
                        setIsCreating(false);
                        setNewName('');
                      }
                    }}
                    placeholder="Scenario name..."
                    className="w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-600 rounded text-zinc-200 placeholder-zinc-500"
                  />
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim()}
                      className="flex-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setNewName('');
                      }}
                      className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full px-3 py-1.5 text-left text-sm text-blue-400 hover:bg-zinc-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Scenario
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full-size version for WhatIfTool
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 text-sm rounded flex items-center justify-between ${
          whatIf.activeScenarioId
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
        }`}
      >
        <span className="truncate">{activeLabel}</span>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50">
          <div className="py-1">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 flex items-center justify-between ${
                !whatIf.activeScenarioId ? 'text-blue-400' : 'text-zinc-300'
              }`}
            >
              <div>
                <div className="font-medium">Default</div>
                <div className="text-xs text-zinc-500">Permanent overrides only</div>
              </div>
              {!whatIf.activeScenarioId && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {scenarios.length > 0 && <div className="border-t border-zinc-700 my-1" />}

            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className={`flex items-center justify-between px-3 py-2 hover:bg-zinc-700 ${
                  whatIf.activeScenarioId === scenario.id ? 'text-blue-400' : 'text-zinc-300'
                }`}
              >
                <button
                  onClick={() => handleSelect(scenario.id)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium truncate">{scenario.name}</div>
                  {scenario.description && (
                    <div className="text-xs text-zinc-500 truncate">{scenario.description}</div>
                  )}
                </button>
                {whatIf.activeScenarioId === scenario.id && (
                  <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(scenario.id);
                  }}
                  className={`p-1 rounded hover:bg-zinc-600 flex-shrink-0 ${
                    confirmDelete === scenario.id ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title={confirmDelete === scenario.id ? 'Click again to confirm' : 'Delete scenario'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}

            <div className="border-t border-zinc-700 my-1" />

            {isCreating ? (
              <div className="px-3 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewName('');
                    }
                  }}
                  placeholder="Enter scenario name..."
                  className="w-full px-3 py-2 text-sm bg-zinc-900 border border-zinc-600 rounded text-zinc-200 placeholder-zinc-500"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create & Activate
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewName('');
                    }}
                    className="px-3 py-1.5 text-sm bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-zinc-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Scenario
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
