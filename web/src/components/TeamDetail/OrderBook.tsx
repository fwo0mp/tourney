import { useOrderbook, useMyMarkets } from '../../hooks/useMarket';
import type { OrderbookLevel } from '../../types';

interface OrderBookProps {
  team: string;
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function LevelRow({
  level,
  side,
  isMine,
  rowTestId,
}: {
  level: OrderbookLevel;
  side: 'bid' | 'ask';
  isMine: boolean;
  rowTestId?: string;
}) {
  const isBid = side === 'bid';
  const mineRowClass = isBid
    ? 'bg-green-50 border-green-100'
    : 'bg-red-50 border-red-100';

  return (
    <tr
      className={`border-b ${isMine ? mineRowClass : 'border-gray-50'}`}
      data-testid={rowTestId}
    >
      {isBid ? (
        <>
          <td className={`py-1.5 px-2 text-xs text-left ${isMine ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
            {level.entry ?? (isMine ? 'you' : '')}
          </td>
          <td className={`py-1.5 px-2 text-xs text-right ${isMine ? 'text-green-800 font-semibold' : 'text-gray-700'}`}>
            {level.size.toLocaleString()}
          </td>
          <td className={`py-1.5 px-2 text-sm text-right font-medium ${isMine ? 'text-green-800' : 'text-green-700'}`}>
            {level.price.toFixed(2)}
          </td>
        </>
      ) : (
        <>
          <td className={`py-1.5 px-2 text-sm text-left font-medium ${isMine ? 'text-red-800' : 'text-red-700'}`}>
            {level.price.toFixed(2)}
          </td>
          <td className={`py-1.5 px-2 text-xs text-left ${isMine ? 'text-red-800 font-semibold' : 'text-gray-700'}`}>
            {level.size.toLocaleString()}
          </td>
          <td className={`py-1.5 px-2 text-xs text-right ${isMine ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
            {level.entry ?? (isMine ? 'you' : '')}
          </td>
        </>
      )}
    </tr>
  );
}

export function OrderBook({ team }: OrderBookProps) {
  const { data: orderbook, isLoading, error } = useOrderbook(team);
  const { data: myMarkets } = useMyMarkets();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Book</h2>
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Book</h2>
        <p className="text-red-500 text-sm">Failed to load orderbook</p>
      </div>
    );
  }

  const bids = orderbook?.bids ?? [];
  const asks = orderbook?.asks ?? [];
  const topBid = bids.length > 0 ? bids[0].price : null;
  const topAsk = asks.length > 0 ? asks[0].price : null;
  const spread = topBid !== null && topAsk !== null ? topAsk - topBid : null;

  // Pad to 5 rows for consistent display
  const maxRows = 5;
  const bidRows = bids.slice(0, maxRows);
  const askRows = asks.slice(0, maxRows);
  const rowCount = Math.max(bidRows.length, askRows.length, 1);
  const myMarket = myMarkets?.markets[team];

  const myBidIndex = bidRows.findIndex((level) => {
    if (myMarket?.bid == null) return false;
    if (!samePrice(level.price, myMarket.bid)) return false;
    if (myMarket.bid_size != null && level.size === myMarket.bid_size) return true;
    return true;
  });

  const myAskIndex = askRows.findIndex((level) => {
    if (myMarket?.ask == null) return false;
    if (!samePrice(level.price, myMarket.ask)) return false;
    if (myMarket.ask_size != null && level.size === myMarket.ask_size) return true;
    return true;
  });

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="teamdetail-orderbook">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Order Book</h2>
        {orderbook?.is_mock && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">Mock</span>
        )}
      </div>

      {spread !== null && (
        <div className="text-center text-xs text-gray-500 mb-3">
          Spread: {spread.toFixed(2)} ({topBid !== null && topAsk !== null
            ? ((spread / ((topBid + topAsk) / 2)) * 100).toFixed(1)
            : '?'}%)
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Bids */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1 px-2 text-xs font-medium text-gray-500 text-left">Entry</th>
                <th className="py-1 px-2 text-xs font-medium text-gray-500 text-right">Size</th>
                <th className="py-1 px-2 text-xs font-medium text-green-600 text-right">Bid</th>
              </tr>
            </thead>
            <tbody>
              {bidRows.map((level, i) => (
                <LevelRow
                  key={i}
                  level={level}
                  side="bid"
                  isMine={i === myBidIndex}
                  rowTestId={i === myBidIndex ? 'teamdetail-orderbook-my-bid' : undefined}
                />
              ))}
              {bidRows.length < rowCount &&
                [...Array(rowCount - bidRows.length)].map((_, i) => (
                  <tr key={`empty-bid-${i}`} className="border-b border-gray-50">
                    <td colSpan={3} className="py-1.5 px-2 text-xs text-gray-300 text-center">-</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Asks */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1 px-2 text-xs font-medium text-red-600 text-left">Ask</th>
                <th className="py-1 px-2 text-xs font-medium text-gray-500 text-left">Size</th>
                <th className="py-1 px-2 text-xs font-medium text-gray-500 text-right">Entry</th>
              </tr>
            </thead>
            <tbody>
              {askRows.map((level, i) => (
                <LevelRow
                  key={i}
                  level={level}
                  side="ask"
                  isMine={i === myAskIndex}
                  rowTestId={i === myAskIndex ? 'teamdetail-orderbook-my-ask' : undefined}
                />
              ))}
              {askRows.length < rowCount &&
                [...Array(rowCount - askRows.length)].map((_, i) => (
                  <tr key={`empty-ask-${i}`} className="border-b border-gray-50">
                    <td colSpan={3} className="py-1.5 px-2 text-xs text-gray-300 text-center">-</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {(myBidIndex >= 0 || myAskIndex >= 0) && (
        <div className="mt-3 text-xs text-gray-500 text-center">
          Highlighted rows indicate your live quotes.
        </div>
      )}
    </div>
  );
}
