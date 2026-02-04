import { usePortfolioDistribution, usePositions } from '../../hooks/usePortfolio';

export function PortfolioSummary() {
  const { data: positions, isLoading: posLoading } = usePositions();
  const { data: distribution, isLoading: distLoading } = usePortfolioDistribution(10000);

  if (posLoading || distLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Summary</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!distribution) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Summary</h2>
        <p className="text-gray-500">Failed to load portfolio data</p>
      </div>
    );
  }

  const formatValue = (value: number) => value.toFixed(2);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Portfolio Summary</h2>
        {positions?.is_mock && (
          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
            Mock Data
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-3xl font-bold text-gray-900">
            {formatValue(distribution.expected_value)}
          </div>
          <div className="text-sm text-gray-500">Expected Value</div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
          <div>
            <div className="text-sm font-medium text-red-600">
              {formatValue(distribution.p1)}
            </div>
            <div className="text-xs text-gray-500">1st Percentile (Worst)</div>
          </div>
          <div>
            <div className="text-sm font-medium text-green-600">
              {formatValue(distribution.p99)}
            </div>
            <div className="text-xs text-gray-500">99th Percentile (Best)</div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <div className="text-sm font-medium text-gray-900 mb-2">Value Range</div>
          <div className="relative h-2 bg-gray-200 rounded">
            <div
              className="absolute h-full bg-blue-500 rounded"
              style={{
                left: `${((distribution.p10 - distribution.min_value) / (distribution.max_value - distribution.min_value)) * 100}%`,
                right: `${100 - ((distribution.p90 - distribution.min_value) / (distribution.max_value - distribution.min_value)) * 100}%`,
              }}
            />
            <div
              className="absolute w-1 h-4 -mt-1 bg-gray-800 rounded"
              style={{
                left: `${((distribution.p50 - distribution.min_value) / (distribution.max_value - distribution.min_value)) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatValue(distribution.min_value)}</span>
            <span>p50: {formatValue(distribution.p50)}</span>
            <span>{formatValue(distribution.max_value)}</span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-medium text-gray-900">{formatValue(distribution.p25)}</div>
            <div className="text-xs text-gray-500">p25</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{formatValue(distribution.p50)}</div>
            <div className="text-xs text-gray-500">Median</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{formatValue(distribution.p75)}</div>
            <div className="text-xs text-gray-500">p75</div>
          </div>
        </div>
      </div>
    </div>
  );
}
