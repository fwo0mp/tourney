import { useEffect, useRef, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { useTeams } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { TeamInfo } from '../../types';

const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 24;
const ROUND_GAP = 40;
const SLOT_GAP = 8;
const GAME_BOX_PADDING = 6;

interface BracketSlot {
  team: TeamInfo | null;
  x: number;
  y: number;
  round: number;
  region: string;
  slotIndex: number;
}

function getRegionTeams(teams: TeamInfo[], regionIndex: number): TeamInfo[] {
  // Sort teams by expected score (descending) as proxy for seed
  const sorted = [...teams].sort((a, b) => b.expected_score - a.expected_score);
  // Split into 4 regions of 16 teams each
  const start = regionIndex * 16;
  return sorted.slice(start, start + 16);
}

function getDeltaColor(delta: number, maxDelta: number): string {
  if (delta === 0 || maxDelta === 0) return '#e5e7eb'; // gray-200
  const intensity = Math.min(Math.abs(delta) / maxDelta, 1);
  if (delta > 0) {
    // Green gradient
    const g = Math.round(180 + intensity * 75);
    const r = Math.round(220 - intensity * 180);
    const b = Math.round(220 - intensity * 180);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red gradient
    const r = Math.round(180 + intensity * 75);
    const g = Math.round(220 - intensity * 180);
    const b = Math.round(220 - intensity * 180);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function RegionBracket({
  teams,
  regionName,
  maxDelta,
  flipHorizontal = false,
}: {
  teams: TeamInfo[];
  regionName: string;
  maxDelta: number;
  flipHorizontal?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const selectGame = useUIStore((state) => state.selectGame);
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);

  useEffect(() => {
    if (!svgRef.current || teams.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Calculate positions for 16-team single-elimination bracket
    // Round 1: 8 games (16 teams)
    // Round 2: 4 games (8 teams)
    // Round 3: 2 games (4 teams)
    // Round 4: 1 game (2 teams) - Sweet 16 winner
    const rounds = 4;
    const slots: BracketSlot[] = [];

    // Standard bracket seed order: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
    const seedOrder = [0, 15, 7, 8, 4, 11, 3, 12, 5, 10, 2, 13, 6, 9, 1, 14];

    // Build slot positions
    for (let round = 0; round < rounds; round++) {
      const gamesInRound = Math.pow(2, rounds - 1 - round);
      const teamsInRound = gamesInRound * 2;
      const roundX = flipHorizontal
        ? (rounds - 1 - round) * (SLOT_WIDTH + ROUND_GAP)
        : round * (SLOT_WIDTH + ROUND_GAP);

      for (let i = 0; i < teamsInRound; i++) {
        const spacing = Math.pow(2, round) * (SLOT_HEIGHT + SLOT_GAP);
        const offset = (Math.pow(2, round) - 1) * (SLOT_HEIGHT + SLOT_GAP) / 2;
        const y = offset + i * spacing;

        let team: TeamInfo | null = null;
        if (round === 0) {
          team = teams[seedOrder[i]] || null;
        }

        slots.push({ team, x: roundX, y, round, region: regionName, slotIndex: i });
      }
    }

    // Draw game boxes first (lower z-index)
    const gameBoxGroup = svg.append('g').attr('class', 'game-boxes');

    // Only draw game boxes for round 0 (first round games with known teams)
    const round0Slots = slots.filter(s => s.round === 0 && s.team);
    for (let game = 0; game < 8; game++) {
      const topSlot = round0Slots[game * 2];
      const bottomSlot = round0Slots[game * 2 + 1];

      if (topSlot?.team && bottomSlot?.team) {
        const boxX = topSlot.x - GAME_BOX_PADDING;
        const boxY = topSlot.y - GAME_BOX_PADDING;
        const boxWidth = SLOT_WIDTH + GAME_BOX_PADDING * 2;
        const boxHeight = (bottomSlot.y + SLOT_HEIGHT) - topSlot.y + GAME_BOX_PADDING * 2;

        const isSelected = selectedGame &&
          ((selectedGame.team1 === topSlot.team.name && selectedGame.team2 === bottomSlot.team.name) ||
           (selectedGame.team1 === bottomSlot.team.name && selectedGame.team2 === topSlot.team.name));

        gameBoxGroup.append('rect')
          .attr('x', boxX)
          .attr('y', boxY)
          .attr('width', boxWidth)
          .attr('height', boxHeight)
          .attr('rx', 5)
          .attr('fill', isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent')
          .attr('stroke', isSelected ? '#3b82f6' : '#e5e7eb')
          .attr('stroke-width', isSelected ? 2 : 1)
          .attr('stroke-dasharray', isSelected ? 'none' : '4,2')
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            selectGame({ team1: topSlot.team!.name, team2: bottomSlot.team!.name });
          })
          .on('mouseenter', function() {
            d3.select(this)
              .attr('fill', 'rgba(59, 130, 246, 0.05)')
              .attr('stroke', '#93c5fd');
          })
          .on('mouseleave', function() {
            const stillSelected = selectedGame &&
              ((selectedGame.team1 === topSlot.team!.name && selectedGame.team2 === bottomSlot.team!.name) ||
               (selectedGame.team1 === bottomSlot.team!.name && selectedGame.team2 === topSlot.team!.name));
            d3.select(this)
              .attr('fill', stillSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent')
              .attr('stroke', stillSelected ? '#3b82f6' : '#e5e7eb');
          });
      }
    }

    // Draw connecting lines
    const lineGroup = svg.append('g').attr('class', 'lines');

    for (let round = 0; round < rounds - 1; round++) {
      const gamesInRound = Math.pow(2, rounds - 1 - round);
      for (let game = 0; game < gamesInRound; game++) {
        const topSlotIdx = slots.findIndex(s => s.round === round &&
          s.y === slots.filter(s2 => s2.round === round)[game * 2]?.y);
        const bottomSlotIdx = slots.findIndex(s => s.round === round &&
          s.y === slots.filter(s2 => s2.round === round)[game * 2 + 1]?.y);
        const nextSlotIdx = slots.findIndex(s => s.round === round + 1 &&
          s.y === slots.filter(s2 => s2.round === round + 1)[game]?.y);

        if (topSlotIdx >= 0 && bottomSlotIdx >= 0 && nextSlotIdx >= 0) {
          const topSlot = slots[topSlotIdx];
          const bottomSlot = slots[bottomSlotIdx];
          const nextSlot = slots[nextSlotIdx];

          const startX = flipHorizontal ? topSlot.x : topSlot.x + SLOT_WIDTH;
          const endX = flipHorizontal ? nextSlot.x + SLOT_WIDTH : nextSlot.x;
          const midX = (startX + endX) / 2;

          // Horizontal line from top slot
          lineGroup.append('line')
            .attr('x1', startX)
            .attr('y1', topSlot.y + SLOT_HEIGHT / 2)
            .attr('x2', midX)
            .attr('y2', topSlot.y + SLOT_HEIGHT / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Horizontal line from bottom slot
          lineGroup.append('line')
            .attr('x1', startX)
            .attr('y1', bottomSlot.y + SLOT_HEIGHT / 2)
            .attr('x2', midX)
            .attr('y2', bottomSlot.y + SLOT_HEIGHT / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Vertical line connecting them
          lineGroup.append('line')
            .attr('x1', midX)
            .attr('y1', topSlot.y + SLOT_HEIGHT / 2)
            .attr('x2', midX)
            .attr('y2', bottomSlot.y + SLOT_HEIGHT / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Horizontal line to next round
          lineGroup.append('line')
            .attr('x1', midX)
            .attr('y1', nextSlot.y + SLOT_HEIGHT / 2)
            .attr('x2', endX)
            .attr('y2', nextSlot.y + SLOT_HEIGHT / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);
        }
      }
    }

    // Draw team slots
    const slotGroup = svg.append('g').attr('class', 'slots');

    slots.filter(s => s.round === 0 && s.team).forEach((slot) => {
      const group = slotGroup.append('g')
        .attr('transform', `translate(${slot.x}, ${slot.y})`)
        .attr('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          if (slot.team) selectTeam(slot.team.name);
        });

      // Background rect
      group.append('rect')
        .attr('width', SLOT_WIDTH)
        .attr('height', SLOT_HEIGHT)
        .attr('rx', 3)
        .attr('fill', slot.team ? getDeltaColor(slot.team.delta, maxDelta) : '#f3f4f6')
        .attr('stroke', slot.team?.name === selectedTeam ? '#3b82f6' : '#d1d5db')
        .attr('stroke-width', slot.team?.name === selectedTeam ? 2 : 1);

      // Team name
      if (slot.team) {
        group.append('text')
          .attr('x', 4)
          .attr('y', SLOT_HEIGHT / 2 + 4)
          .attr('font-size', '10px')
          .attr('fill', '#374151')
          .text(slot.team.name.length > 14 ? slot.team.name.substring(0, 12) + '..' : slot.team.name);
      }
    });

    // Draw empty slots for later rounds
    slots.filter(s => s.round > 0).forEach((slot) => {
      slotGroup.append('rect')
        .attr('x', slot.x)
        .attr('y', slot.y)
        .attr('width', SLOT_WIDTH)
        .attr('height', SLOT_HEIGHT)
        .attr('rx', 3)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 1);
    });

  }, [teams, maxDelta, flipHorizontal, selectTeam, selectGame, selectedTeam, selectedGame]);

  const width = 4 * (SLOT_WIDTH + ROUND_GAP);
  const height = 16 * (SLOT_HEIGHT + SLOT_GAP);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{regionName}</h3>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
}

export function BracketView() {
  const { data: teams, isLoading } = useTeams();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);

  // Re-center bracket when sidebar opens/closes
  useLayoutEffect(() => {
    if (containerRef.current) {
      // Scroll to center the bracket horizontally
      const container = containerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      if (scrollWidth > clientWidth) {
        container.scrollLeft = (scrollWidth - clientWidth) / 2;
      }
    }
  }, [selectedTeam, selectedGame]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <div className="animate-pulse h-96 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!teams || teams.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <p className="text-gray-500">No teams available</p>
      </div>
    );
  }

  const maxDelta = Math.max(...teams.map((t) => Math.abs(t.delta)));
  const regions = ['South', 'East', 'Midwest', 'West'];

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Tournament Bracket</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getDeltaColor(maxDelta, maxDelta) }}></div>
            <span>Long</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-200"></div>
            <span>Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getDeltaColor(-maxDelta, maxDelta) }}></div>
            <span>Short</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-8">
          <RegionBracket
            teams={getRegionTeams(teams, 0)}
            regionName={regions[0]}
            maxDelta={maxDelta}
          />
          <RegionBracket
            teams={getRegionTeams(teams, 1)}
            regionName={regions[1]}
            maxDelta={maxDelta}
          />
        </div>
        <div className="space-y-8">
          <RegionBracket
            teams={getRegionTeams(teams, 2)}
            regionName={regions[2]}
            maxDelta={maxDelta}
            flipHorizontal
          />
          <RegionBracket
            teams={getRegionTeams(teams, 3)}
            regionName={regions[3]}
            maxDelta={maxDelta}
            flipHorizontal
          />
        </div>
      </div>
    </div>
  );
}
