import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePortfolioDistribution, usePortfolioValue, usePositions } from '../../hooks/usePortfolio';
import { useUIStore } from '../../store/uiStore';
import { ScenarioSelector } from '../WhatIf/ScenarioSelector';
import type { PortfolioSummary as PortfolioSummaryType } from '../../types';

const SIMULATION_OPTIONS = [
  { value: 1000, label: '1,000' },
  { value: 10000, label: '10,000' },
  { value: 50000, label: '50,000' },
  { value: 100000, label: '100,000' },
];

const CHART_HEIGHT = 200;
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 50 };

function DistributionChart({ distribution }: { distribution: PortfolioSummaryType }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width changes (e.g. sidebar open/close)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerWidth || !distribution.histogram.length) return;

    const width = containerWidth - CHART_MARGIN.left - CHART_MARGIN.right;
    const height = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', containerWidth)
      .attr('height', CHART_HEIGHT)
      .append('g')
      .attr('transform', `translate(${CHART_MARGIN.left},${CHART_MARGIN.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([distribution.min_value, distribution.max_value])
      .range([0, width]);

    const maxCount = Math.max(...distribution.histogram.map(b => b.count));
    const yScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range([height, 0]);

    // Draw histogram bars
    const barWidth = width / distribution.histogram.length;
    g.selectAll('rect.bar')
      .data(distribution.histogram)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.bin_start))
      .attr('y', d => yScale(d.count))
      .attr('width', Math.max(barWidth - 1, 1))
      .attr('height', d => height - yScale(d.count))
      .attr('fill', '#93c5fd');

    // Percentile lines with labels
    const percentiles = [
      { value: distribution.p1, label: 'p1', color: '#ef4444' },
      { value: distribution.p25, label: 'p25', color: '#f97316' },
      { value: distribution.p50, label: 'p50', color: '#eab308' },
      { value: distribution.p75, label: 'p75', color: '#22c55e' },
      { value: distribution.p99, label: 'p99', color: '#22c55e' },
    ];

    // Draw percentile lines
    percentiles.forEach(({ value, label, color }) => {
      const x = xScale(value);
      g.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2');

      g.append('text')
        .attr('x', x)
        .attr('y', -5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '9px')
        .attr('fill', color)
        .text(label);
    });

    // Expected value line (solid)
    const evX = xScale(distribution.expected_value);
    g.append('line')
      .attr('x1', evX)
      .attr('x2', evX)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2);

    g.append('text')
      .attr('x', evX)
      .attr('y', -5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#3b82f6')
      .text('EV');

    // X-axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => d.toLocaleString(undefined, { maximumFractionDigits: 0 }));

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '10px');

    // Y-axis
    const yAxis = d3.axisLeft(yScale).ticks(4);
    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('font-size', '10px');

  }, [distribution, containerWidth]);

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}

export function PortfolioSummary() {
  const [nSimulations, setNSimulations] = useState(10000);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: positions, isLoading: posLoading } = usePositions();
  // Reactive EV that updates immediately on what-if changes (cheap calculation)
  const { data: liveValue, isLoading: evLoading } = usePortfolioValue();
  // Monte Carlo distribution (expensive) - only updates on explicit resimulate
  const { data: distribution, isLoading: distLoading, refetch } = usePortfolioDistribution(nSimulations);
  const monteCarloStale = useUIStore((state) => state.monteCarloStale);
  const clearMonteCarloStale = useUIStore((state) => state.clearMonteCarloStale);
  const whatIf = useUIStore((state) => state.whatIf);
  const clearTemporaryOverrides = useUIStore((state) => state.clearTemporaryOverrides);
  const loadScenarios = useUIStore((state) => state.loadScenarios);
  const scenariosLoaded = useUIStore((state) => state.scenariosLoaded);

  // Load scenarios on mount
  useEffect(() => {
    if (!scenariosLoaded) {
      loadScenarios();
    }
  }, [scenariosLoaded, loadScenarios]);

  const permanentOverrideCount =
    whatIf.permanentGameOutcomes.length +
    Object.keys(whatIf.permanentRatingAdjustments).length;

  const scenarioOverrideCount =
    whatIf.scenarioGameOutcomes.length +
    Object.keys(whatIf.scenarioRatingAdjustments).length;

  const hasAnyOverrides = permanentOverrideCount > 0 || scenarioOverrideCount > 0;

  // Use live EV from reactive hook, with distribution EV as fallback
  const displayEV = liveValue?.expected_value ?? distribution?.expected_value;

  const handleResimulate = async () => {
    await refetch();
    clearMonteCarloStale();
  };

  const handleSimulationsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNSimulations(Number(e.target.value));
  };

  const formatValue = (value: number) => value.toFixed(2);

  // Show header with EV even while distribution is loading
  if (posLoading || (evLoading && !displayEV)) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Portfolio Summary</h2>
            <div className="text-2xl font-bold text-gray-400">--</div>
          </div>
        </div>
        {!isCollapsed && (
          <div className="animate-pulse space-y-3 mt-4">
            <div className="h-[200px] bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        )}
      </div>
    );
  }

  if (!displayEV && !distribution) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Portfolio Summary</h2>
            <div className="text-2xl font-bold text-gray-400">--</div>
          </div>
        </div>
        {!isCollapsed && (
          <p className="text-gray-500 mt-4">Failed to load portfolio data</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header - Always visible with EV and Cash */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
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
            <h2 className="text-lg font-semibold text-gray-900">Portfolio Summary</h2>
          </button>
          <div className={`flex items-center gap-4 ${evLoading ? 'opacity-50' : ''}`}>
            <div>
              <span className="text-sm text-gray-500">Team EV:</span>
              <span className="text-2xl font-bold text-gray-900 ml-1">{displayEV ? formatValue(displayEV) : '--'}</span>
            </div>
            <div className="text-gray-300">|</div>
            <div>
              <span className="text-sm text-gray-500">Cash:</span>
              <span className="text-xl font-semibold text-gray-700 ml-1">${liveValue?.cash_balance?.toFixed(2) ?? '--'}</span>
            </div>
            <div className="text-gray-300">|</div>
            <div>
              <span className="text-sm text-gray-500">Total EV:</span>
              <span className="text-xl font-semibold text-blue-600 ml-1">${liveValue?.total_value?.toFixed(2) ?? '--'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {monteCarloStale && (
            <button
              onClick={handleResimulate}
              disabled={distLoading}
              className="px-3 py-1 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded disabled:opacity-50"
            >
              {distLoading ? 'Simulating...' : 'Re-simulate'}
            </button>
          )}
          {scenarioOverrideCount > 0 && (
            <button
              onClick={clearTemporaryOverrides}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded"
              title="Clear scenario overrides"
            >
              Clear Temp
            </button>
          )}
          {permanentOverrideCount > 0 && (
            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded" title="Permanent overrides active">
              {permanentOverrideCount} perm
            </span>
          )}
          {/* Scenario Selector */}
          {hasAnyOverrides || whatIf.activeScenarioId ? (
            <ScenarioSelector compact />
          ) : null}
          {positions?.is_mock && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Mock Data
            </span>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="mt-4 flex flex-col space-y-4">
          {monteCarloStale && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-sm text-amber-800">
                Distribution may be outdated due to scenario changes.
              </span>
            </div>
          )}

          {distLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-[200px] bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          ) : distribution ? (
            <>
              {/* Histogram */}
              <div className="h-[200px]">
                <DistributionChart distribution={distribution} />
              </div>

              {/* Percentile Summary */}
              <div className="pt-2 border-t border-gray-200">
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  <div>
                    <div className="font-medium text-red-600">{formatValue(distribution.p1)}</div>
                    <div className="text-gray-500">p1</div>
                  </div>
                  <div>
                    <div className="font-medium text-orange-600">{formatValue(distribution.p25)}</div>
                    <div className="text-gray-500">p25</div>
                  </div>
                  <div>
                    <div className="font-medium text-yellow-600">{formatValue(distribution.p50)}</div>
                    <div className="text-gray-500">p50</div>
                  </div>
                  <div>
                    <div className="font-medium text-green-600">{formatValue(distribution.p75)}</div>
                    <div className="text-gray-500">p75</div>
                  </div>
                  <div>
                    <div className="font-medium text-green-600">{formatValue(distribution.p99)}</div>
                    <div className="text-gray-500">p99</div>
                  </div>
                </div>
              </div>

              {/* Min/Max and Simulation Settings */}
              <div className="flex justify-between items-center text-xs text-gray-500">
                <div className="flex gap-4">
                  <span>Min: {formatValue(distribution.min_value)}</span>
                  <span>Max: {formatValue(distribution.max_value)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="simulations" className="text-gray-600">Simulations:</label>
                  <select
                    id="simulations"
                    value={nSimulations}
                    onChange={handleSimulationsChange}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {SIMULATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-500">Distribution not available</p>
          )}
        </div>
      )}
    </div>
  );
}
