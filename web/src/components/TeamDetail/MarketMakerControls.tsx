import { useState, useCallback, useEffect } from 'react';
import { useMyMarkets, useMakeMarket } from '../../hooks/useMarket';

interface MarketMakerControlsProps {
  team: string;
  fairValue: number;
  maxPrice: number;
}

function roundDown(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

function roundUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

function deriveFromMidSpread(midpoint: number, spreadPct: number) {
  const bid = roundDown(midpoint * (1 - spreadPct / 200), 2);
  const ask = roundUp(midpoint * (1 + spreadPct / 200), 2);
  return { bid, ask };
}

function deriveFromBidAsk(bid: number, ask: number) {
  const midpoint = (bid + ask) / 2;
  const spreadPct = midpoint > 0 ? ((ask - bid) / midpoint) * 100 : 0;
  return { midpoint, spreadPct };
}

export function MarketMakerControls({ team, fairValue, maxPrice }: MarketMakerControlsProps) {
  const { data: myMarkets } = useMyMarkets();
  const makeMarket = useMakeMarket();

  const [midpoint, setMidpoint] = useState(fairValue);
  const [spreadPct, setSpreadPct] = useState(5);
  const [bid, setBid] = useState(() => deriveFromMidSpread(fairValue, 5).bid);
  const [ask, setAsk] = useState(() => deriveFromMidSpread(fairValue, 5).ask);
  const [bidSize, setBidSize] = useState(5000);
  const [askSize, setAskSize] = useState(5000);
  const [initialized, setInitialized] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pre-populate from existing orders when myMarkets loads
  useEffect(() => {
    if (initialized || !myMarkets) return;
    const existing = myMarkets.markets[team];
    if (existing && existing.bid != null && existing.ask != null) {
      const b = existing.bid;
      const a = existing.ask;
      setBid(b);
      setAsk(a);
      setBidSize(existing.bid_size ?? 5000);
      setAskSize(existing.ask_size ?? 5000);
      const derived = deriveFromBidAsk(b, a);
      setMidpoint(derived.midpoint);
      setSpreadPct(derived.spreadPct);
    } else {
      // Use defaults
      const derived = deriveFromMidSpread(fairValue, 5);
      setMidpoint(fairValue);
      setSpreadPct(5);
      setBid(derived.bid);
      setAsk(derived.ask);
    }
    setInitialized(true);
  }, [myMarkets, team, fairValue, initialized]);

  // Reset when team changes
  useEffect(() => {
    setInitialized(false);
    setFeedback(null);
  }, [team]);

  const handleMidpointChange = useCallback((value: number) => {
    setMidpoint(value);
    const derived = deriveFromMidSpread(value, spreadPct);
    setBid(derived.bid);
    setAsk(derived.ask);
  }, [spreadPct]);

  const handleSpreadChange = useCallback((value: number) => {
    setSpreadPct(value);
    const derived = deriveFromMidSpread(midpoint, value);
    setBid(derived.bid);
    setAsk(derived.ask);
  }, [midpoint]);

  const handleBidChange = useCallback((value: number) => {
    setBid(value);
    if (value > 0 && ask > value) {
      const derived = deriveFromBidAsk(value, ask);
      setMidpoint(derived.midpoint);
      setSpreadPct(derived.spreadPct);
    }
  }, [ask]);

  const handleAskChange = useCallback((value: number) => {
    setAsk(value);
    if (bid > 0 && value > bid) {
      const derived = deriveFromBidAsk(bid, value);
      setMidpoint(derived.midpoint);
      setSpreadPct(derived.spreadPct);
    }
  }, [bid]);

  const handleSubmit = useCallback(() => {
    setFeedback(null);
    makeMarket.mutate(
      { team, request: { bid, bid_size: bidSize, ask, ask_size: askSize } },
      {
        onSuccess: () => setFeedback({ type: 'success', message: 'Market updated' }),
        onError: (err) => setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update market' }),
      },
    );
  }, [team, bid, bidSize, ask, askSize, makeMarket]);

  const isValid = bid > 0 && ask > 0 && bid < ask && bidSize > 0 && askSize > 0;
  const hasExisting = myMarkets?.markets[team]?.bid != null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Market Maker</h2>
        {myMarkets?.is_mock && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Mock</span>
        )}
      </div>

      {/* Midpoint + Spread controls */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Midpoint</label>
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min={0}
              max={maxPrice}
              step={0.01}
              value={midpoint}
              onChange={(e) => handleMidpointChange(parseFloat(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0}
              max={maxPrice}
              step={0.01}
              value={midpoint.toFixed(2)}
              onChange={(e) => handleMidpointChange(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Spread %</label>
          <div className="flex gap-2 items-center">
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.1}
              value={spreadPct}
              onChange={(e) => handleSpreadChange(parseFloat(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.1}
              value={spreadPct.toFixed(1)}
              onChange={(e) => handleSpreadChange(parseFloat(e.target.value) || 0.5)}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Bid / Ask prices */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-green-700 mb-1">Bid Price</label>
          <input
            type="number"
            min={0}
            max={maxPrice}
            step={0.01}
            value={bid}
            onChange={(e) => handleBidChange(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">Ask Price</label>
          <input
            type="number"
            min={0}
            max={maxPrice}
            step={0.01}
            value={ask}
            onChange={(e) => handleAskChange(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Sizes */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bid Size</label>
          <input
            type="number"
            min={1}
            step={100}
            value={bidSize}
            onChange={(e) => setBidSize(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ask Size</label>
          <input
            type="number"
            min={1}
            step={100}
            value={askSize}
            onChange={(e) => setAskSize(parseInt(e.target.value) || 1)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Summary line */}
      <div className="text-xs text-gray-500 mb-3 text-center">
        {isValid ? (
          <>Quoting <span className="text-green-700 font-medium">{bid.toFixed(2)}</span> / <span className="text-red-700 font-medium">{ask.toFixed(2)}</span> ({(ask - bid).toFixed(2)} wide, {((ask - bid) / ((bid + ask) / 2) * 100).toFixed(1)}%)</>
        ) : (
          <span className="text-yellow-600">Invalid: bid must be less than ask, all values positive</span>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid || makeMarket.isPending}
        className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {makeMarket.isPending ? 'Submitting...' : hasExisting ? 'Update Market' : 'Place Market'}
      </button>

      {/* Feedback */}
      {feedback && (
        <div className={`mt-2 text-sm text-center ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
}
