import { useMemo, useState } from 'react';
import { useTeams } from '../../hooks/useTournament';
import { useMarketOverview } from '../../hooks/useMarket';
import { useUIStore } from '../../store/uiStore';
import { TeamsTable } from './TeamsTable';
import { SortHeader, StaticHeader, sortData, useSortState } from '../common';

type CrossingSide = 'bid' | 'ask';

interface CrossingOrder {
  side: CrossingSide;
  price: number;
  size: number | null;
  edge: number;
}

interface CrossingRow {
  team: string;
  ev: number;
  bid: number | null;
  bidSize: number | null;
  ask: number | null;
  askSize: number | null;
  otherOrders: CrossingOrder[];
  ourOrders: CrossingOrder[];
  maxEdge: number;
}

interface MarketsTableProps {
  title: string;
  rows: Array<CrossingRow & { orders: CrossingOrder[] }>;
  emptyMessage: string;
  onSelectTeam: (team: string) => void;
  onNavigateToDetail: (team: string) => void;
}

type MarketsSortColumn = 'team' | 'ev' | 'bid' | 'ask' | 'crossing_amount';

function formatPrice(value: number | null): string {
  return value === null ? '-' : value.toFixed(2);
}

function formatSize(value: number | null): string {
  return value === null ? '-' : value.toString();
}

function getCrossingAmountPercent(row: CrossingRow & { orders: CrossingOrder[] }): number {
  if (row.ev <= 0) {
    return 0;
  }
  return Math.max(...row.orders.map((order) => order.edge / row.ev), 0);
}

function MarketsTable({
  title,
  rows,
  emptyMessage,
  onSelectTeam,
  onNavigateToDetail,
}: MarketsTableProps) {
  const { sortColumn, sortMode, handleSort } = useSortState<MarketsSortColumn>('crossing_amount', 'desc');

  const sortedRows = useMemo(
    () =>
      sortData(rows, sortColumn, sortMode, (row, column) => {
        switch (column) {
          case 'team': return row.team;
          case 'ev': return row.ev;
          case 'bid': return row.bid ?? 0;
          case 'ask': return row.ask ?? 0;
          case 'crossing_amount': return getCrossingAmountPercent(row);
          default: return 0;
        }
      }),
    [rows, sortColumn, sortMode],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{sortedRows.length} teams</span>
      </div>

      {sortedRows.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <SortHeader label="Team" column="team" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} align="left" />
                <SortHeader label="EV" column="ev" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
                <SortHeader label="Best Bid" column="bid" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
                <SortHeader label="Best Ask" column="ask" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
                <SortHeader label="Crossing Amount" column="crossing_amount" currentColumn={sortColumn} sortMode={sortMode} onSort={handleSort} />
                <StaticHeader label="Crossing Orders" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const hasBidCrossing = row.orders.some((order) => order.side === 'bid');
                const hasAskCrossing = row.orders.some((order) => order.side === 'ask');
                const crossingAmountPct = getCrossingAmountPercent(row);

                return (
                  <tr
                    key={row.team}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => onSelectTeam(row.team)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      onNavigateToDetail(row.team);
                    }}
                  >
                    <td className="py-2 text-sm font-medium text-gray-900">{row.team}</td>
                    <td className="py-2 text-sm text-right text-gray-600">{row.ev.toFixed(2)}</td>
                    <td className={`py-2 text-sm text-right ${hasBidCrossing ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {formatPrice(row.bid)} <span className="text-xs text-gray-400">({formatSize(row.bidSize)})</span>
                    </td>
                    <td className={`py-2 text-sm text-right ${hasAskCrossing ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
                      {formatPrice(row.ask)} <span className="text-xs text-gray-400">({formatSize(row.askSize)})</span>
                    </td>
                    <td className="py-2 text-sm text-right font-medium text-blue-600">
                      {(crossingAmountPct * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-sm">
                      <div className="flex flex-wrap justify-end gap-1">
                        {row.orders.map((order) => (
                          <span
                            key={`${row.team}-${order.side}`}
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                              order.side === 'bid'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-green-50 text-green-700 border border-green-200'
                            }`}
                          >
                            {order.side === 'bid' ? 'Bid' : 'Ask'} {order.price.toFixed(2)} ({order.side === 'bid' ? '+' : '-'}{order.edge.toFixed(2)})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MarketsOfInterest() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const {
    data: marketOverview,
    isLoading: marketsLoading,
    error: marketsError,
  } = useMarketOverview();
  const selectTeam = useUIStore((state) => state.selectTeam);
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);

  const rows = useMemo(() => {
    const teamEv = new Map((teams ?? []).map((team) => [team.name, team.expected_score]));
    const marketRows = marketOverview?.markets ?? [];
    const result: CrossingRow[] = [];

    for (const market of marketRows) {
      const ev = teamEv.get(market.team);
      if (ev === undefined) {
        continue;
      }

      const otherOrders: CrossingOrder[] = [];
      const ourOrders: CrossingOrder[] = [];

      if (market.bid !== null && market.bid.price > ev) {
        const order: CrossingOrder = {
          side: 'bid',
          price: market.bid.price,
          size: market.bid.size,
          edge: market.bid.price - ev,
        };
        if (market.bid.is_mine) {
          ourOrders.push(order);
        } else {
          otherOrders.push(order);
        }
      }

      if (market.ask !== null && market.ask.price < ev) {
        const order: CrossingOrder = {
          side: 'ask',
          price: market.ask.price,
          size: market.ask.size,
          edge: ev - market.ask.price,
        };
        if (market.ask.is_mine) {
          ourOrders.push(order);
        } else {
          otherOrders.push(order);
        }
      }

      if (otherOrders.length === 0 && ourOrders.length === 0) {
        continue;
      }

      const maxEdge = Math.max(
        ...otherOrders.map((order) => order.edge),
        ...ourOrders.map((order) => order.edge),
      );

      result.push({
        team: market.team,
        ev,
        bid: market.bid?.price ?? null,
        bidSize: market.bid?.size ?? null,
        ask: market.ask?.price ?? null,
        askSize: market.ask?.size ?? null,
        otherOrders,
        ourOrders,
        maxEdge,
      });
    }

    return result.sort((a, b) => b.maxEdge - a.maxEdge || a.team.localeCompare(b.team));
  }, [teams, marketOverview]);

  const rowsFromOthers = useMemo(
    () =>
      rows
        .filter((row) => row.otherOrders.length > 0)
        .map((row) => ({ ...row, orders: row.otherOrders })),
    [rows],
  );

  const rowsFromUs = useMemo(
    () =>
      rows
        .filter((row) => row.ourOrders.length > 0)
        .map((row) => ({ ...row, orders: row.ourOrders })),
    [rows],
  );

  const totalMatches = rowsFromOthers.length + rowsFromUs.length;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 hover:text-gray-600"
        >
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">Markets of Interest</h2>
        </button>
        <span className="text-xs text-gray-500">{totalMatches} table entries</span>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-6">
          {teamsLoading || marketsLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-gray-200 rounded"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </div>
          ) : marketsError ? (
            <p className="text-sm text-red-600">
              Failed to load market overview: {marketsError.message}
            </p>
          ) : (
            <>
              <MarketsTable
                title="Crossing Orders From Other Users"
                rows={rowsFromOthers}
                emptyMessage="No teams where another user has a best bid/ask crossing EV."
                onSelectTeam={selectTeam}
                onNavigateToDetail={navigateToDetailedView}
              />
              <MarketsTable
                title="Crossing Orders From Us"
                rows={rowsFromUs}
                emptyMessage="No teams where our best bid/ask is crossing EV."
                onSelectTeam={selectTeam}
                onNavigateToDetail={navigateToDetailedView}
              />
            </>
          )}
          <TeamsTable compact />
        </div>
      )}
    </div>
  );
}
