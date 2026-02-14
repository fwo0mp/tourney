import { useMemo, useState, useEffect } from 'react';
import { useTeams, useTeam, useScoringConfig } from '../../hooks/useTournament';
import { useTeamImpact, usePositions, useDeltas, useHypotheticalPortfolio } from '../../hooks/usePortfolio';
import { useOrderbook } from '../../hooks/useMarket';
import { useUIStore } from '../../store/uiStore';
import { SortHeader, useSortState, sortData, type SortMode } from '../common';
import { OrderBook } from './OrderBook';
import { MarketMakerControls } from './MarketMakerControls';
import type { HypotheticalValueResponse, MarketMakerQuoteState } from '../../types';

type DeltaRiskSortColumn = 'team' | 'currentDelta' | 'deltaChange' | 'newDelta';

interface DeltaRiskRow {
  teamName: string;
  currentDelta: number;
  deltaChange: number;
  newDelta: number;
}

interface DeltaRiskTableProps {
  title: string;
  subtitle: string;
  rows: DeltaRiskRow[];
  sortColumn: DeltaRiskSortColumn;
  sortMode: SortMode;
  onSort: (column: DeltaRiskSortColumn) => void;
}

interface FillComparisonPanelProps {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  currentPosition: number;
  bidHypotheticalPortfolio?: HypotheticalValueResponse;
  askHypotheticalPortfolio?: HypotheticalValueResponse;
  bidIsLoading: boolean;
  askIsLoading: boolean;
}

function signedNumber(value: number, decimals = 2) {
  return `${value > 0 ? '+' : ''}${value.toFixed(decimals)}`;
}

function signedCurrency(value: number) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function valueColor(value: number | null) {
  if (value === null) return 'text-gray-400';
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
}

function FillComparisonPanel({
  bidPrice,
  bidSize,
  askPrice,
  askSize,
  currentPosition,
  bidHypotheticalPortfolio,
  askHypotheticalPortfolio,
  bidIsLoading,
  askIsLoading,
}: FillComparisonPanelProps) {
  const bidCashFlow = bidPrice * bidSize;
  const askCashFlow = askPrice * askSize;
  const baseline = bidHypotheticalPortfolio ?? askHypotheticalPortfolio;
  const currentEV = baseline?.current_value ?? null;
  const currentCash = baseline?.current_cash ?? null;
  const currentTotal = baseline?.current_total ?? null;

  const bidPosition = currentPosition + bidSize;
  const askPosition = currentPosition - askSize;

  const bidEV = bidHypotheticalPortfolio?.hypothetical_value ?? null;
  const askEV = askHypotheticalPortfolio?.hypothetical_value ?? null;

  const bidEVChange = bidHypotheticalPortfolio?.delta ?? null;
  const askEVChange = askHypotheticalPortfolio?.delta ?? null;

  const bidCashAfterFill = bidHypotheticalPortfolio ? bidHypotheticalPortfolio.current_cash - bidCashFlow : null;
  const askCashAfterFill = askHypotheticalPortfolio ? askHypotheticalPortfolio.current_cash + askCashFlow : null;

  const bidTotal = bidHypotheticalPortfolio && bidCashAfterFill !== null
    ? bidHypotheticalPortfolio.hypothetical_value + bidCashAfterFill
    : null;
  const askTotal = askHypotheticalPortfolio && askCashAfterFill !== null
    ? askHypotheticalPortfolio.hypothetical_value + askCashAfterFill
    : null;

  const bidNetImpact = bidHypotheticalPortfolio ? bidHypotheticalPortfolio.delta - bidCashFlow : null;
  const askNetImpact = askHypotheticalPortfolio ? askHypotheticalPortfolio.delta + askCashFlow : null;

  const askFillDescription = `-${askSize.toLocaleString()} shares @ ${askPrice.toFixed(2)}`;
  const bidFillDescription = `+${bidSize.toLocaleString()} shares @ ${bidPrice.toFixed(2)}`;

  const renderValue = (value: string | null, isLoading: boolean, className = '') => {
    if (isLoading) {
      return <span className="text-gray-400 animate-pulse">...</span>;
    }
    if (value === null) {
      return <span className="text-gray-400">--</span>;
    }
    return <span className={className}>{value}</span>;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Fill Scenario Comparison</h2>
      <p className="text-sm text-gray-500 mb-4">
        Compare full ask fill and full bid fill outcomes against current portfolio state.
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 text-left text-xs font-medium text-gray-500">Metric</th>
              <th className="py-2 text-right text-xs font-medium text-red-700">Ask Fill</th>
              <th className="py-2 text-right text-xs font-medium text-gray-600">Current</th>
              <th className="py-2 text-right text-xs font-medium text-green-700">Bid Fill</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Fill Assumption</td>
              <td className="py-2 text-right text-red-700">{askFillDescription}</td>
              <td className="py-2 text-right text-gray-500">No fill</td>
              <td className="py-2 text-right text-green-700">{bidFillDescription}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Position (shares)</td>
              <td className="py-2 text-right text-red-700">{askPosition.toFixed(1)}</td>
              <td className="py-2 text-right text-gray-700">{currentPosition.toFixed(1)}</td>
              <td className="py-2 text-right text-green-700">{bidPosition.toFixed(1)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Cash Flow from Fill</td>
              <td className="py-2 text-right text-green-600">+${askCashFlow.toFixed(2)}</td>
              <td className="py-2 text-right text-gray-700">$0.00</td>
              <td className="py-2 text-right text-red-600">-${bidCashFlow.toFixed(2)}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Portfolio EV</td>
              <td className="py-2 text-right">
                {renderValue(askEV !== null ? askEV.toFixed(2) : null, askIsLoading, valueColor(askEV))}
              </td>
              <td className="py-2 text-right">
                {renderValue(currentEV !== null ? currentEV.toFixed(2) : null, askIsLoading && bidIsLoading, 'text-gray-700')}
              </td>
              <td className="py-2 text-right">
                {renderValue(bidEV !== null ? bidEV.toFixed(2) : null, bidIsLoading, valueColor(bidEV))}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">EV Change</td>
              <td className="py-2 text-right">
                {renderValue(askEVChange !== null ? signedNumber(askEVChange) : null, askIsLoading, valueColor(askEVChange))}
              </td>
              <td className="py-2 text-right text-gray-700">0.00</td>
              <td className="py-2 text-right">
                {renderValue(bidEVChange !== null ? signedNumber(bidEVChange) : null, bidIsLoading, valueColor(bidEVChange))}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Portfolio Cash</td>
              <td className="py-2 text-right">
                {renderValue(askCashAfterFill !== null ? `$${askCashAfterFill.toFixed(2)}` : null, askIsLoading, 'text-gray-700')}
              </td>
              <td className="py-2 text-right">
                {renderValue(currentCash !== null ? `$${currentCash.toFixed(2)}` : null, askIsLoading && bidIsLoading, 'text-gray-700')}
              </td>
              <td className="py-2 text-right">
                {renderValue(bidCashAfterFill !== null ? `$${bidCashAfterFill.toFixed(2)}` : null, bidIsLoading, 'text-gray-700')}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-2 text-gray-700">Portfolio Total (EV + Cash)</td>
              <td className="py-2 text-right">
                {renderValue(askTotal !== null ? `$${askTotal.toFixed(2)}` : null, askIsLoading, valueColor(askNetImpact))}
              </td>
              <td className="py-2 text-right">
                {renderValue(currentTotal !== null ? `$${currentTotal.toFixed(2)}` : null, askIsLoading && bidIsLoading, 'text-gray-700')}
              </td>
              <td className="py-2 text-right">
                {renderValue(bidTotal !== null ? `$${bidTotal.toFixed(2)}` : null, bidIsLoading, valueColor(bidNetImpact))}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-gray-700 font-medium">Net Impact vs Current</td>
              <td className="py-2 text-right font-medium">
                {renderValue(askNetImpact !== null ? signedCurrency(askNetImpact) : null, askIsLoading, valueColor(askNetImpact))}
              </td>
              <td className="py-2 text-right text-gray-700 font-medium">$0.00</td>
              <td className="py-2 text-right font-medium">
                {renderValue(bidNetImpact !== null ? signedCurrency(bidNetImpact) : null, bidIsLoading, valueColor(bidNetImpact))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Net Impact = EV Change plus cash flow from the fill.
      </div>
    </div>
  );
}

function DeltaRiskTable({
  title,
  subtitle,
  rows,
  sortColumn,
  sortMode,
  onSort,
}: DeltaRiskTableProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No delta changes for this scenario.</p>
      ) : (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <SortHeader
                  label="Team"
                  column="team"
                  currentColumn={sortColumn}
                  sortMode={sortMode}
                  onSort={onSort}
                  align="left"
                />
                <SortHeader
                  label="Current"
                  column="currentDelta"
                  currentColumn={sortColumn}
                  sortMode={sortMode}
                  onSort={onSort}
                />
                <SortHeader
                  label="Change"
                  column="deltaChange"
                  currentColumn={sortColumn}
                  sortMode={sortMode}
                  onSort={onSort}
                />
                <SortHeader
                  label="New Delta"
                  column="newDelta"
                  currentColumn={sortColumn}
                  sortMode={sortMode}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ teamName, currentDelta, deltaChange, newDelta }) => (
                <tr key={teamName} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{teamName}</td>
                  <td className={`py-2 text-right ${currentDelta > 0 ? 'text-green-600' : currentDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {currentDelta !== 0 ? (currentDelta > 0 ? '+' : '') + currentDelta.toFixed(2) : '-'}
                  </td>
                  <td className={`py-2 text-right font-medium ${deltaChange > 0 ? 'text-green-600' : deltaChange < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {Math.abs(deltaChange) > 0.001 ? (deltaChange > 0 ? '+' : '') + deltaChange.toFixed(2) : '-'}
                  </td>
                  <td className={`py-2 text-right font-bold ${newDelta > 0 ? 'text-green-600' : newDelta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {newDelta !== 0 ? (newDelta > 0 ? '+' : '') + newDelta.toFixed(2) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Delta = portfolio value change per +1 point rating adjustment to that team.
      </p>
    </div>
  );
}

export function TeamDetailView() {
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const detailedViewTeam = useUIStore((state) => state.detailedViewTeam);
  const setDetailedViewTeam = useUIStore((state) => state.setDetailedViewTeam);
  const [marketQuote, setMarketQuote] = useState<MarketMakerQuoteState | null>(null);

  // Fetch data for the selected team
  const { data: team, isLoading: teamLoading } = useTeam(detailedViewTeam ?? '');
  const { data: impact, isLoading: impactLoading } = useTeamImpact(detailedViewTeam);
  const { data: positions } = usePositions();
  const { data: deltas } = useDeltas();
  const { data: scoringConfig } = useScoringConfig();
  const { data: orderbook } = useOrderbook(detailedViewTeam);

  // Sort state for the delta risk tables
  const {
    sortColumn: deltaRiskSortColumn,
    sortMode: deltaRiskSortMode,
    handleSort: handleDeltaRiskSort,
  } = useSortState<DeltaRiskSortColumn>('newDelta');

  // Max price is the maximum possible score (sum of round points)
  const maxPrice = scoringConfig?.max_score ?? 11; // Default to 11 (sum of [1,1,2,2,2,3])

  // Fair value for the selected team (used as default price)
  const fairValue = team?.expected_score ?? maxPrice / 2;

  const bidPrice = marketQuote?.bid ?? 0;
  const askPrice = marketQuote?.ask ?? 0;
  const bidSize = marketQuote?.bidSize ?? 0;
  const askSize = marketQuote?.askSize ?? 0;
  const isValidQuote = marketQuote?.isValid ?? false;

  const bidPositionChange = isValidQuote ? bidSize : 0;
  const askPositionChange = isValidQuote ? -askSize : 0;

  const bidPositionChangesMap = useMemo(() => {
    if (!detailedViewTeam || bidPositionChange === 0) return null;
    return { [detailedViewTeam]: bidPositionChange };
  }, [detailedViewTeam, bidPositionChange]);

  const askPositionChangesMap = useMemo(() => {
    if (!detailedViewTeam || askPositionChange === 0) return null;
    return { [detailedViewTeam]: askPositionChange };
  }, [detailedViewTeam, askPositionChange]);

  const { data: bidHypotheticalPortfolio, isLoading: bidHypotheticalLoading } = useHypotheticalPortfolio(bidPositionChangesMap);
  const { data: askHypotheticalPortfolio, isLoading: askHypotheticalLoading } = useHypotheticalPortfolio(askPositionChangesMap);

  const bidDeltaChangesData = useMemo(() => {
    if (!deltas || !detailedViewTeam || bidPositionChange === 0) {
      return [];
    }
    return Object.entries(deltas.deltas)
      .map(([teamName, currentDelta]) => {
        const pairwiseForTeam = deltas.pairwise[teamName] || {};
        const evDeltaPerShare = pairwiseForTeam[detailedViewTeam] || 0;
        const deltaChange = bidPositionChange * evDeltaPerShare;
        const newDelta = currentDelta + deltaChange;
        return {
          teamName,
          currentDelta,
          deltaChange,
          newDelta,
        };
      })
      .filter((row) => Math.abs(row.currentDelta) > 0.01 || Math.abs(row.deltaChange) > 0.001);
  }, [deltas, detailedViewTeam, bidPositionChange]);

  const askDeltaChangesData = useMemo(() => {
    if (!deltas || !detailedViewTeam || askPositionChange === 0) {
      return [];
    }
    return Object.entries(deltas.deltas)
      .map(([teamName, currentDelta]) => {
        const pairwiseForTeam = deltas.pairwise[teamName] || {};
        const evDeltaPerShare = pairwiseForTeam[detailedViewTeam] || 0;
        const deltaChange = askPositionChange * evDeltaPerShare;
        const newDelta = currentDelta + deltaChange;
        return {
          teamName,
          currentDelta,
          deltaChange,
          newDelta,
        };
      })
      .filter((row) => Math.abs(row.currentDelta) > 0.01 || Math.abs(row.deltaChange) > 0.001);
  }, [deltas, detailedViewTeam, askPositionChange]);

  const sortedBidDeltaChanges = useMemo(() => {
    return sortData(bidDeltaChangesData, deltaRiskSortColumn, deltaRiskSortMode, (row, column) => {
      switch (column) {
        case 'team': return row.teamName;
        case 'currentDelta': return row.currentDelta;
        case 'deltaChange': return row.deltaChange;
        case 'newDelta': return row.newDelta;
        default: return 0;
      }
    });
  }, [bidDeltaChangesData, deltaRiskSortColumn, deltaRiskSortMode]);

  const sortedAskDeltaChanges = useMemo(() => {
    return sortData(askDeltaChangesData, deltaRiskSortColumn, deltaRiskSortMode, (row, column) => {
      switch (column) {
        case 'team': return row.teamName;
        case 'currentDelta': return row.currentDelta;
        case 'deltaChange': return row.deltaChange;
        case 'newDelta': return row.newDelta;
        default: return 0;
      }
    });
  }, [askDeltaChangesData, deltaRiskSortColumn, deltaRiskSortMode]);

  const currentPosition = detailedViewTeam && positions?.positions
    ? positions.positions[detailedViewTeam] ?? 0
    : 0;

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamName = e.target.value || null;
    setDetailedViewTeam(teamName);
  };

  useEffect(() => {
    setMarketQuote(null);
  }, [detailedViewTeam]);

  return (
    <div className="space-y-6">
      {/* Team Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <label htmlFor="team-select" className="text-lg font-semibold text-gray-900">
            Team:
          </label>
          <select
            id="team-select"
            value={detailedViewTeam ?? ''}
            onChange={handleTeamChange}
            data-testid="teamdetail-team-select"
            className="flex-1 max-w-md px-4 py-2 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={teamsLoading}
          >
            <option value="">Select a team...</option>
            {teams?.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} {t.seed ? `(${t.seed})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!detailedViewTeam ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500 text-lg">
            Select a team above to view detailed analysis and configure market-maker scenarios.
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Tip: Double-click on a team anywhere in the app to jump directly here.
          </p>
        </div>
      ) : teamLoading || impactLoading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      ) : team ? (
        <>
          {/* Top summary focused on EV + delta */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">
                  {team.expected_score.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Team EV</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className={`text-2xl font-bold ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Portfolio Delta</div>
                <p className="text-xs text-gray-400 mt-1">
                  Portfolio value change per +1 point rating adjustment
                </p>
              </div>
            </div>
          </div>

          {/* Market-focused controls */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <OrderBook team={detailedViewTeam} />
            <MarketMakerControls
              team={detailedViewTeam}
              fairValue={fairValue}
              maxPrice={maxPrice}
              onQuoteChange={setMarketQuote}
            />
          </div>

          {isValidQuote ? (
            <>
              {/* Fill impact comparison */}
              <FillComparisonPanel
                bidPrice={bidPrice}
                bidSize={bidSize}
                askPrice={askPrice}
                askSize={askSize}
                currentPosition={currentPosition}
                bidHypotheticalPortfolio={bidHypotheticalPortfolio}
                askHypotheticalPortfolio={askHypotheticalPortfolio}
                bidIsLoading={bidHypotheticalLoading}
                askIsLoading={askHypotheticalLoading}
              />

              {/* Per-team delta risk for each fill side */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <DeltaRiskTable
                  title="Bid Fill Delta Risk"
                  subtitle={`How team deltas change if your bid fully fills (+${bidSize.toLocaleString()} shares).`}
                  rows={sortedBidDeltaChanges}
                  sortColumn={deltaRiskSortColumn}
                  sortMode={deltaRiskSortMode}
                  onSort={handleDeltaRiskSort}
                />
                <DeltaRiskTable
                  title="Ask Fill Delta Risk"
                  subtitle={`How team deltas change if your ask fully fills (-${askSize.toLocaleString()} shares).`}
                  rows={sortedAskDeltaChanges}
                  sortColumn={deltaRiskSortColumn}
                  sortMode={deltaRiskSortMode}
                  onSort={handleDeltaRiskSort}
                />
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-500">
                Configure a valid market quote above to see bid-fill and ask-fill EV/risk impact.
              </p>
            </div>
          )}

          {/* Delta Breakdown (reused from TeamPanel) */}
          {impact && impact.breakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Delta Breakdown</h2>
              <p className="text-sm text-gray-500 mb-4">
                How a +1 point rating adjustment to {detailedViewTeam} affects your portfolio
              </p>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-xs font-medium text-gray-500">Holding</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-500">Position</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-500">EV Delta</th>
                      <th className="text-right py-2 text-xs font-medium text-gray-500">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.breakdown
                      .filter((item) => item.position !== 0 && Math.abs(item.portfolio_impact) > 0.001)
                      .sort((a, b) => Math.abs(b.portfolio_impact) - Math.abs(a.portfolio_impact))
                      .map(({ holding, position, ev_delta, portfolio_impact }) => (
                        <tr key={holding} className="border-b border-gray-100">
                          <td className="py-2 text-gray-700">{holding}</td>
                          <td className={`py-2 text-right ${position > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {position > 0 ? '+' : ''}{position.toFixed(1)}
                          </td>
                          <td className={`py-2 text-right ${ev_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {ev_delta > 0 ? '+' : ''}{ev_delta.toFixed(2)}
                          </td>
                          <td className={`py-2 text-right font-medium ${portfolio_impact > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {portfolio_impact > 0 ? '+' : ''}{portfolio_impact.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t border-gray-200">
                      <td colSpan={3} className="py-2 font-medium text-gray-700">Total</td>
                      <td className={`py-2 text-right font-bold ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Collapsible details: secondary team stats */}
          <details className="bg-white rounded-lg shadow p-6">
            <summary className="cursor-pointer text-lg font-semibold text-gray-900">
              Additional Team Stats
            </summary>
            <div className="mt-4 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className={`text-2xl font-bold ${currentPosition > 0 ? 'text-green-600' : currentPosition < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {currentPosition !== 0 ? (currentPosition > 0 ? '+' : '') + currentPosition.toFixed(1) : '-'}
                  </div>
                  <div className="text-xs text-gray-500">Current Position</div>
                </div>
                {orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0) && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm text-gray-500">Bid: </span>
                        <span className="text-sm font-bold text-green-700">
                          {orderbook.bids.length > 0 ? orderbook.bids[0].price.toFixed(2) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Ask: </span>
                        <span className="text-sm font-bold text-red-700">
                          {orderbook.asks.length > 0 ? orderbook.asks[0].price.toFixed(2) : '-'}
                        </span>
                      </div>
                      {orderbook.bids.length > 0 && orderbook.asks.length > 0 && (
                        <div className="text-xs text-gray-500">
                          Spread: {(orderbook.asks[0].price - orderbook.bids[0].price).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Top of Book</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">
                    {(team.offense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Offense</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">
                    {(team.defense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Defense</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-900">
                    {team.tempo.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Tempo</div>
                </div>
              </div>
            </div>
          </details>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500">Team not found</p>
        </div>
      )}
    </div>
  );
}
