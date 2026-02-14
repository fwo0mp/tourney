import { useMemo } from 'react';
import { useTeams, useTeam, useScoringConfig } from '../../hooks/useTournament';
import { useTeamImpact, usePositions, useDeltas, useHypotheticalPortfolio } from '../../hooks/usePortfolio';
import { useOrderbook } from '../../hooks/useMarket';
import { useUIStore } from '../../store/uiStore';
import { SortHeader, useSortState, sortData } from '../common';
import { OrderBook } from './OrderBook';
import { MarketMakerControls } from './MarketMakerControls';

type DeltaRiskSortColumn = 'team' | 'currentDelta' | 'deltaChange' | 'newDelta';

export function TeamDetailView() {
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const detailedViewTeam = useUIStore((state) => state.detailedViewTeam);
  const setDetailedViewTeam = useUIStore((state) => state.setDetailedViewTeam);
  const hypotheticalTrade = useUIStore((state) => state.hypotheticalTrade);
  const setHypotheticalTrade = useUIStore((state) => state.setHypotheticalTrade);
  const clearHypotheticalTrade = useUIStore((state) => state.clearHypotheticalTrade);

  // Fetch data for the selected team
  const { data: team, isLoading: teamLoading } = useTeam(detailedViewTeam ?? '');
  const { data: impact, isLoading: impactLoading } = useTeamImpact(detailedViewTeam);
  const { data: positions } = usePositions();
  const { data: deltas } = useDeltas();
  const { data: scoringConfig } = useScoringConfig();
  const { data: orderbook } = useOrderbook(detailedViewTeam);

  // Sort state for the delta risk table
  const {
    sortColumn: deltaRiskSortColumn,
    sortMode: deltaRiskSortMode,
    handleSort: handleDeltaRiskSort,
  } = useSortState<DeltaRiskSortColumn>('newDelta');

  // Max price is the maximum possible score (sum of round points)
  const maxPrice = scoringConfig?.max_score ?? 11;  // Default to 11 (sum of [1,1,2,2,2,3])

  // Fair value for the selected team (used as default price)
  const fairValue = team?.expected_score ?? maxPrice / 2;

  // Calculate hypothetical position changes
  const positionChange = hypotheticalTrade
    ? (hypotheticalTrade.direction === 'buy' ? 1 : -1) * hypotheticalTrade.quantity
    : 0;

  // Build position changes map for API call
  const positionChangesMap = hypotheticalTrade && hypotheticalTrade.quantity > 0
    ? { [hypotheticalTrade.team]: positionChange }
    : null;

  // Fetch hypothetical portfolio value
  const { data: hypotheticalPortfolio, isLoading: hypotheticalLoading } = useHypotheticalPortfolio(positionChangesMap);

  // Compute delta changes for the risk table
  const deltaChangesData = useMemo(() => {
    if (!deltas || !detailedViewTeam || !hypotheticalTrade || hypotheticalTrade.quantity <= 0) {
      return [];
    }
    return Object.entries(deltas.deltas)
      .map(([teamName, currentDelta]) => {
        const pairwiseForTeam = deltas.pairwise[teamName] || {};
        const evDeltaPerShare = pairwiseForTeam[detailedViewTeam] || 0;
        const deltaChange = positionChange * evDeltaPerShare;
        const newDelta = currentDelta + deltaChange;
        return {
          teamName,
          currentDelta,
          deltaChange,
          newDelta,
        };
      })
      .filter((row) => Math.abs(row.currentDelta) > 0.01 || Math.abs(row.deltaChange) > 0.001);
  }, [deltas, detailedViewTeam, hypotheticalTrade, positionChange]);

  // Sort the delta changes data
  const sortedDeltaChanges = useMemo(() => {
    return sortData(deltaChangesData, deltaRiskSortColumn, deltaRiskSortMode, (row, column) => {
      switch (column) {
        case 'team': return row.teamName;
        case 'currentDelta': return row.currentDelta;
        case 'deltaChange': return row.deltaChange;
        case 'newDelta': return row.newDelta;
        default: return 0;
      }
    });
  }, [deltaChangesData, deltaRiskSortColumn, deltaRiskSortMode]);

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamName = e.target.value || null;
    setDetailedViewTeam(teamName);
    // Clear hypothetical trade when switching teams
    if (teamName !== hypotheticalTrade?.team) {
      clearHypotheticalTrade();
    }
  };

  const handleDirectionChange = (direction: 'buy' | 'sell') => {
    if (!detailedViewTeam) return;
    setHypotheticalTrade({
      team: detailedViewTeam,
      direction,
      quantity: hypotheticalTrade?.quantity ?? 0,
      price: hypotheticalTrade?.price ?? fairValue,
    });
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailedViewTeam) return;
    const quantity = parseFloat(e.target.value) || 0;
    setHypotheticalTrade({
      team: detailedViewTeam,
      direction: hypotheticalTrade?.direction ?? 'buy',
      quantity,
      price: hypotheticalTrade?.price ?? fairValue,
    });
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailedViewTeam) return;
    const price = parseFloat(e.target.value) || 0;
    setHypotheticalTrade({
      team: detailedViewTeam,
      direction: hypotheticalTrade?.direction ?? 'buy',
      quantity: hypotheticalTrade?.quantity ?? 0,
      price,
    });
  };

  // Calculate current position for selected team
  const currentPosition = detailedViewTeam && positions?.positions
    ? positions.positions[detailedViewTeam] ?? 0
    : 0;

  const hypotheticalPosition = currentPosition + positionChange;

  // Calculate trade cost
  const tradeCost = hypotheticalTrade
    ? hypotheticalTrade.quantity * hypotheticalTrade.price
    : 0;

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
            Select a team above to view detailed analysis and explore hypothetical trades.
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
          {/* Two-column layout: Team Stats + Hypothetical Trade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Stats</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {team.expected_score.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">Expected Score</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className={`text-2xl font-bold ${currentPosition > 0 ? 'text-green-600' : currentPosition < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {currentPosition !== 0 ? (currentPosition > 0 ? '+' : '') + currentPosition.toFixed(1) : '-'}
                  </div>
                  <div className="text-xs text-gray-500">Current Position</div>
                </div>
              </div>

              {/* Top Bid / Ask from orderbook */}
              {orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0) && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
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

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className={`text-xl font-bold ${team.delta > 0 ? 'text-green-600' : team.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {team.delta > 0 ? '+' : ''}{team.delta.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Portfolio Delta</div>
                <p className="text-xs text-gray-400 mt-1">
                  Portfolio value change per +1 point rating adjustment
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {(team.offense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Offense</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {(team.defense * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-gray-500">Defense</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {team.tempo.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Tempo</div>
                </div>
              </div>
            </div>

            {/* Hypothetical Trade Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Hypothetical Trade</h2>

              {/* Direction Toggle */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Direction</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDirectionChange('buy')}
                    data-testid="teamdetail-direction-buy"
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg ${
                      hypotheticalTrade?.direction === 'buy'
                        ? 'bg-green-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => handleDirectionChange('sell')}
                    data-testid="teamdetail-direction-sell"
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg ${
                      hypotheticalTrade?.direction === 'sell'
                        ? 'bg-red-600 text-white'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Sell
                  </button>
                </div>
              </div>

              {/* Quantity Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity (shares)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={hypotheticalTrade?.quantity ?? ''}
                  onChange={handleQuantityChange}
                  placeholder="0"
                  data-testid="teamdetail-quantity-input"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Price Input with Slider */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price per share
                  <span className="text-gray-500 font-normal ml-2">(Fair value: {fairValue.toFixed(2)})</span>
                </label>
                <div className="flex gap-4 items-center">
                  {/* Slider with fair value notch */}
                  <div className="flex-1 relative">
                    <input
                      type="range"
                      min="0"
                      max={maxPrice}
                      step="0.1"
                      value={hypotheticalTrade?.price ?? fairValue}
                      onChange={handlePriceChange}
                      className="w-full"
                    />
                    {/* Fair value marker */}
                    <div
                      className="absolute top-0 h-5 w-0.5 bg-blue-500 pointer-events-none"
                      style={{ left: `calc(${(fairValue / maxPrice) * 100}% - 1px)` }}
                      title={`Fair value: ${fairValue.toFixed(2)}`}
                    />
                    {/* Fair value label below */}
                    <div
                      className="absolute top-5 text-xs text-blue-600 font-medium pointer-events-none whitespace-nowrap"
                      style={{
                        left: `${(fairValue / maxPrice) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      FV {fairValue.toFixed(2)}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={maxPrice}
                    step="0.01"
                    value={hypotheticalTrade?.price ?? ''}
                    onChange={handlePriceChange}
                    placeholder={fairValue.toFixed(2)}
                    data-testid="teamdetail-price-input"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>Max: {maxPrice}</span>
                </div>
              </div>

              {/* Clear Button */}
              <button
                onClick={clearHypotheticalTrade}
                disabled={!hypotheticalTrade}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear Trade
              </button>
            </div>
          </div>

          {/* Order Book + Market Maker Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OrderBook team={detailedViewTeam} />
            <MarketMakerControls team={detailedViewTeam} fairValue={fairValue} maxPrice={maxPrice} />
          </div>

          {/* Portfolio Impact */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Impact</h2>

            {hypotheticalTrade && hypotheticalTrade.quantity > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                  <div data-testid="teamdetail-position-change-card" className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500 mb-1">Position Change</div>
                    <div className={`text-2xl font-bold ${positionChange > 0 ? 'text-green-600' : positionChange < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {currentPosition.toFixed(1)} → {hypotheticalPosition.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-500">
                      ({positionChange > 0 ? '+' : ''}{positionChange.toFixed(1)} shares)
                    </div>
                  </div>
                  <div data-testid="teamdetail-ev-change-card" className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500 mb-1">EV Change</div>
                    {hypotheticalLoading ? (
                      <div className="text-2xl font-bold text-gray-400 animate-pulse">...</div>
                    ) : hypotheticalPortfolio ? (
                      <>
                        <div className={`text-2xl font-bold ${hypotheticalPortfolio.delta > 0 ? 'text-green-600' : hypotheticalPortfolio.delta < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {hypotheticalPortfolio.delta > 0 ? '+' : ''}{hypotheticalPortfolio.delta.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {hypotheticalPortfolio.current_value.toFixed(2)} → {hypotheticalPortfolio.hypothetical_value.toFixed(2)}
                        </div>
                      </>
                    ) : (
                      <div className="text-2xl font-bold text-gray-400">--</div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500 mb-1">{hypotheticalTrade.direction === 'buy' ? 'Trade Cost' : 'Proceeds'}</div>
                    <div className={`text-2xl font-bold ${hypotheticalTrade.direction === 'buy' ? 'text-red-600' : 'text-green-600'}`}>
                      {hypotheticalTrade.direction === 'buy' ? '-' : '+'}${tradeCost.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {hypotheticalTrade.quantity} shares @ ${hypotheticalTrade.price.toFixed(2)}
                    </div>
                  </div>
                  <div data-testid="teamdetail-net-impact-card" className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                    <div className="text-sm text-blue-700 mb-1 font-medium">Net Impact</div>
                    {hypotheticalLoading ? (
                      <div className="text-2xl font-bold text-gray-400 animate-pulse">...</div>
                    ) : hypotheticalPortfolio ? (
                      (() => {
                        // Net = EV change - cost (for buy) or EV change + proceeds (for sell)
                        const netImpact = hypotheticalTrade.direction === 'buy'
                          ? hypotheticalPortfolio.delta - tradeCost
                          : hypotheticalPortfolio.delta + tradeCost;
                        return (
                          <>
                            <div className={`text-2xl font-bold ${netImpact > 0 ? 'text-green-600' : netImpact < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                              {netImpact > 0 ? '+' : ''}{netImpact.toFixed(2)}
                            </div>
                            <div className="text-sm text-blue-500">
                              EV {hypotheticalPortfolio.delta >= 0 ? '+' : ''}{hypotheticalPortfolio.delta.toFixed(2)} {hypotheticalTrade.direction === 'buy' ? '-' : '+'} ${tradeCost.toFixed(2)}
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <div className="text-2xl font-bold text-gray-400">--</div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  Net Impact = EV Change {hypotheticalTrade.direction === 'buy' ? '- Trade Cost' : '+ Sale Proceeds'}.
                  A positive value means the trade is profitable in expectation.
                </p>

                {/* Total Portfolio Summary with Cash */}
                {hypotheticalPortfolio && (
                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3">Total Portfolio Value (with Cash)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Current Total</div>
                        <div className="text-xl font-bold text-gray-900">
                          ${hypotheticalPortfolio.current_total.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          EV ${hypotheticalPortfolio.current_value.toFixed(2)} + Cash ${hypotheticalPortfolio.current_cash.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Post-Trade Total</div>
                        {(() => {
                          const cashChange = hypotheticalTrade.direction === 'buy' ? -tradeCost : tradeCost;
                          const newCash = hypotheticalPortfolio.current_cash + cashChange;
                          const newTotal = hypotheticalPortfolio.hypothetical_value + newCash;
                          return (
                            <>
                              <div className="text-xl font-bold text-gray-900">
                                ${newTotal.toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">
                                EV ${hypotheticalPortfolio.hypothetical_value.toFixed(2)} + Cash ${newCash.toFixed(2)}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                        <div className="text-sm text-blue-700 mb-1 font-medium">Total Change</div>
                        {(() => {
                          const cashChange = hypotheticalTrade.direction === 'buy' ? -tradeCost : tradeCost;
                          const newCash = hypotheticalPortfolio.current_cash + cashChange;
                          const newTotal = hypotheticalPortfolio.hypothetical_value + newCash;
                          const totalChange = newTotal - hypotheticalPortfolio.current_total;
                          return (
                            <>
                              <div className={`text-xl font-bold ${totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                {totalChange > 0 ? '+' : ''}${totalChange.toFixed(2)}
                              </div>
                              <div className="text-xs text-blue-500">
                                Same as Net Impact (EV delta {hypotheticalTrade.direction === 'buy' ? '-' : '+'} cash flow)
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500">
                Configure a hypothetical trade above to see the portfolio impact.
              </p>
            )}
          </div>

          {/* Side-by-side tables: Per-Team Delta Risk and Delta Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per-Team Delta Risk Summary */}
            {sortedDeltaChanges.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Per-Team Delta Risk</h2>
                <p className="text-sm text-gray-500 mb-4">
                  How your exposure to each team's rating changes with this trade
                </p>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200">
                        <SortHeader
                          label="Team"
                          column="team"
                          currentColumn={deltaRiskSortColumn}
                          sortMode={deltaRiskSortMode}
                          onSort={handleDeltaRiskSort}
                          align="left"
                        />
                        <SortHeader
                          label="Current"
                          column="currentDelta"
                          currentColumn={deltaRiskSortColumn}
                          sortMode={deltaRiskSortMode}
                          onSort={handleDeltaRiskSort}
                        />
                        <SortHeader
                          label="Change"
                          column="deltaChange"
                          currentColumn={deltaRiskSortColumn}
                          sortMode={deltaRiskSortMode}
                          onSort={handleDeltaRiskSort}
                        />
                        <SortHeader
                          label="New Delta"
                          column="newDelta"
                          currentColumn={deltaRiskSortColumn}
                          sortMode={deltaRiskSortMode}
                          onSort={handleDeltaRiskSort}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDeltaChanges.map(({ teamName, currentDelta, deltaChange, newDelta }) => (
                        <tr
                          key={teamName}
                          className="border-b border-gray-100"
                        >
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
                <p className="text-xs text-gray-400 mt-3">
                  Delta = portfolio value change per +1 point rating adjustment to that team.
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
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500">Team not found</p>
        </div>
      )}
    </div>
  );
}
