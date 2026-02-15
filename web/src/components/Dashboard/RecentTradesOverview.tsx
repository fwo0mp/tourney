import { useMemo, useState } from 'react';
import { useExecutions } from '../../hooks/useMarket';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { ExecutionRecord } from '../../types';

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 336;
const RECENT_TRADE_LIMIT = 25;
const TOP_MOVERS_LIMIT = 20;

interface TeamMover {
  team: string;
  tradeCount: number;
  positionChange: number;
  estimatedDeltaChange: number;
  currentPosition: number;
  currentDelta: number;
  lastTradeTime: string;
  lastTradeMs: number;
  magnitude: number;
}

function parseTradeTimestamp(value: string): number {
  if (!value) return 0;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sideSign(side: string): number {
  const normalized = side.toLowerCase();
  if (normalized === 'sell' || normalized === 'ask') {
    return -1;
  }
  return 1;
}

function sideLabel(side: string): string {
  const normalized = side.toLowerCase();
  if (normalized === 'buy' || normalized === 'bid') return 'BUY';
  if (normalized === 'sell' || normalized === 'ask') return 'SELL';
  return side ? side.toUpperCase() : 'BUY';
}

function valueColorClass(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-400';
}

function formatSigned(value: number, digits = 2): string {
  if (Math.abs(value) < 1e-9) return '-';
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function formatTime(value: string): string {
  const ms = parseTradeTimestamp(value);
  if (!ms) return value;
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RecentTradesOverview() {
  const [lookbackInput, setLookbackInput] = useState(String(DEFAULT_LOOKBACK_HOURS));
  const lookbackHours = useMemo(() => {
    const parsed = Number(lookbackInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_LOOKBACK_HOURS;
    }
    return Math.min(parsed, MAX_LOOKBACK_HOURS);
  }, [lookbackInput]);

  const { data: executionsResponse, isLoading: executionsLoading } = useExecutions(600, true);
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);

  const teamsByName = useMemo(
    () => new Map((teams || []).map((team) => [team.name, team])),
    [teams]
  );

  const executions = useMemo(() => {
    const rows = executionsResponse?.executions || [];
    return [...rows].sort((a, b) => parseTradeTimestamp(b.time) - parseTradeTimestamp(a.time));
  }, [executionsResponse]);

  const recentTrades = useMemo(
    () => executions.slice(0, RECENT_TRADE_LIMIT),
    [executions]
  );

  const lookbackCutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000;

  const lookbackTrades = useMemo(
    () => executions.filter((trade) => parseTradeTimestamp(trade.time) >= lookbackCutoffMs),
    [executions, lookbackCutoffMs]
  );

  const topMovers = useMemo(() => {
    const teamMap = new Map<string, TeamMover>();

    for (const trade of lookbackTrades) {
      const teamName = trade.team || 'Unknown';
      const tradeMs = parseTradeTimestamp(trade.time);
      const quantity = Math.abs(trade.quantity);
      const netChange = sideSign(trade.side) * quantity;
      const existing = teamMap.get(teamName);

      if (existing) {
        existing.tradeCount += 1;
        existing.positionChange += netChange;
        if (tradeMs > existing.lastTradeMs) {
          existing.lastTradeMs = tradeMs;
          existing.lastTradeTime = trade.time;
        }
        continue;
      }

      teamMap.set(teamName, {
        team: teamName,
        tradeCount: 1,
        positionChange: netChange,
        estimatedDeltaChange: 0,
        currentPosition: 0,
        currentDelta: 0,
        lastTradeTime: trade.time,
        lastTradeMs: tradeMs,
        magnitude: 0,
      });
    }

    const movers = Array.from(teamMap.values()).map((mover) => {
      const team = teamsByName.get(mover.team);
      const currentPosition = team?.position ?? 0;
      const currentDelta = team?.delta ?? 0;
      const deltaPerShare =
        Math.abs(currentPosition) > 1e-9 ? currentDelta / currentPosition : 0;
      const estimatedDeltaChange = deltaPerShare * mover.positionChange;
      const magnitude = Math.abs(mover.positionChange) + Math.abs(estimatedDeltaChange);

      return {
        ...mover,
        currentPosition,
        currentDelta,
        estimatedDeltaChange,
        magnitude,
      };
    });

    return movers
      .sort((a, b) => {
        if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
        return b.lastTradeMs - a.lastTradeMs;
      })
      .slice(0, TOP_MOVERS_LIMIT);
  }, [lookbackTrades, teamsByName]);

  const isLoading = executionsLoading || teamsLoading;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow p-6 flex flex-col h-[460px]">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Recent Trades</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{recentTrades.length} most recent</span>
            {executionsResponse?.is_mock && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                Mock Data
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        ) : recentTrades.length === 0 ? (
          <p className="text-sm text-gray-500">No recent trades available.</p>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="py-2 text-left text-xs font-medium text-gray-500">Team</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Side</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Price</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Position</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Delta</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade: ExecutionRecord, idx: number) => {
                  const team = teamsByName.get(trade.team);
                  const currentPosition = team?.position ?? 0;
                  const currentDelta = team?.delta ?? 0;
                  const label = sideLabel(trade.side);
                  const sideClass = label === 'BUY' ? 'text-green-600' : 'text-red-600';
                  return (
                    <tr key={`${trade.time}-${trade.team}-${idx}`} className="border-b border-gray-100">
                      <td className="py-2 text-gray-600 whitespace-nowrap">{formatTime(trade.time)}</td>
                      <td className="py-2">
                        <button
                          onClick={() => navigateToDetailedView(trade.team)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {trade.team}
                        </button>
                      </td>
                      <td className={`py-2 text-right font-medium ${sideClass}`}>{label}</td>
                      <td className="py-2 text-right text-gray-700">{trade.quantity.toFixed(1)}</td>
                      <td className="py-2 text-right text-gray-700">${trade.price.toFixed(2)}</td>
                      <td className={`py-2 text-right font-medium ${valueColorClass(currentPosition)}`}>
                        {formatSigned(currentPosition, 1)}
                      </td>
                      <td className={`py-2 text-right font-medium ${valueColorClass(currentDelta)}`}>
                        {formatSigned(currentDelta, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 flex flex-col h-[460px]">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Largest Recent Changes</h2>
            <p className="text-xs text-gray-500">
              Teams ranked by combined |position change| + |estimated delta change|
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="lookback-hours" className="text-xs text-gray-600 whitespace-nowrap">
              Lookback (hrs)
            </label>
            <input
              id="lookback-hours"
              type="number"
              min={1}
              max={MAX_LOOKBACK_HOURS}
              step={1}
              value={lookbackInput}
              onChange={(e) => {
                const next = e.target.value;
                if (/^\d*$/.test(next)) {
                  setLookbackInput(next);
                }
              }}
              onBlur={() => {
                const parsed = Number(lookbackInput);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  setLookbackInput(String(DEFAULT_LOOKBACK_HOURS));
                  return;
                }
                setLookbackInput(String(Math.min(parsed, MAX_LOOKBACK_HOURS)));
              }}
              className="w-20 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        ) : topMovers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No position changes in the last {lookbackHours} hour{lookbackHours === 1 ? '' : 's'}.
          </p>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left text-xs font-medium text-gray-500">Team</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Trades</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Pos Δ</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Delta Δ</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Position</th>
                  <th className="py-2 text-right text-xs font-medium text-gray-500">Delta</th>
                </tr>
              </thead>
              <tbody>
                {topMovers.map((mover) => (
                  <tr key={mover.team} className="border-b border-gray-100">
                    <td className="py-2">
                      <button
                        onClick={() => navigateToDetailedView(mover.team)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {mover.team}
                      </button>
                    </td>
                    <td className="py-2 text-right text-gray-700">{mover.tradeCount}</td>
                    <td className={`py-2 text-right font-medium ${valueColorClass(mover.positionChange)}`}>
                      {formatSigned(mover.positionChange, 1)}
                    </td>
                    <td className={`py-2 text-right font-medium ${valueColorClass(mover.estimatedDeltaChange)}`}>
                      {formatSigned(mover.estimatedDeltaChange, 2)}
                    </td>
                    <td className={`py-2 text-right font-medium ${valueColorClass(mover.currentPosition)}`}>
                      {formatSigned(mover.currentPosition, 1)}
                    </td>
                    <td className={`py-2 text-right font-medium ${valueColorClass(mover.currentDelta)}`}>
                      {formatSigned(mover.currentDelta, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
