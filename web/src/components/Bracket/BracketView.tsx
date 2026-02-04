import { useEffect, useRef, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { useTeams, useBracket } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { TeamInfo, BracketGame } from '../../types';

const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 24;
const ROUND_GAP = 40;
const SLOT_GAP = 8;
const GAME_BOX_PADDING = 6;

interface BracketSlot {
  teamName: string;
  teamInfo: TeamInfo | null;
  x: number;
  y: number;
  round: number;
  slotIndex: number;
}

function getDeltaColor(delta: number, maxDelta: number): string {
  // Color based on portfolio delta (sensitivity to team's rating change)
  if (delta === 0 || maxDelta === 0) return '#e5e7eb'; // gray-200
  const intensity = Math.min(Math.abs(delta) / maxDelta, 1);
  // Start from neutral gray (229) and interpolate toward green or red
  const neutral = 229; // gray-200
  if (delta > 0) {
    // Green gradient for positive delta (portfolio benefits from team improvement)
    const r = Math.round(neutral - intensity * 189); // 229 -> 40
    const g = Math.round(neutral + intensity * 26);  // 229 -> 255
    const b = Math.round(neutral - intensity * 189); // 229 -> 40
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red gradient for negative delta (portfolio hurt by team improvement)
    const r = Math.round(neutral + intensity * 26);  // 229 -> 255
    const g = Math.round(neutral - intensity * 189); // 229 -> 40
    const b = Math.round(neutral - intensity * 189); // 229 -> 40
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function RegionBracket({
  games,
  teamInfoMap,
  regionName,
  maxDelta,
  flipHorizontal = false,
}: {
  games: BracketGame[];
  teamInfoMap: Map<string, TeamInfo>;
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
    if (!svgRef.current || games.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Build slots from games - each game has one team (or multiple for play-in)
    // For a 16-team region, we have 16 slots in round 0
    const slots: BracketSlot[] = [];
    const rounds = 4; // 16 -> 8 -> 4 -> 2

    // Round 0: All 16 teams from the games
    games.forEach((game, i) => {
      // Get the primary team name (first key in the teams dict)
      const teamNames = Object.keys(game.teams);
      const teamName = teamNames[0] || '';
      const teamInfo = teamInfoMap.get(teamName) || null;

      const roundX = flipHorizontal
        ? (rounds - 1) * (SLOT_WIDTH + ROUND_GAP)
        : 0;
      const y = i * (SLOT_HEIGHT + SLOT_GAP);

      slots.push({
        teamName,
        teamInfo,
        x: roundX,
        y,
        round: 0,
        slotIndex: i,
      });
    });

    // Add empty slots for later rounds
    for (let round = 1; round < rounds; round++) {
      const slotsInRound = Math.pow(2, rounds - 1 - round);
      for (let i = 0; i < slotsInRound; i++) {
        const spacing = Math.pow(2, round) * (SLOT_HEIGHT + SLOT_GAP);
        const offset = (Math.pow(2, round) - 1) * (SLOT_HEIGHT + SLOT_GAP) / 2;
        const y = offset + i * spacing;
        const roundX = flipHorizontal
          ? (rounds - 1 - round) * (SLOT_WIDTH + ROUND_GAP)
          : round * (SLOT_WIDTH + ROUND_GAP);

        slots.push({
          teamName: '',
          teamInfo: null,
          x: roundX,
          y,
          round,
          slotIndex: i,
        });
      }
    }

    // Draw game boxes first (lower z-index) - for round 0 matchups
    const gameBoxGroup = svg.append('g').attr('class', 'game-boxes');

    const round0Slots = slots.filter(s => s.round === 0);
    for (let matchup = 0; matchup < 8; matchup++) {
      const topSlot = round0Slots[matchup * 2];
      const bottomSlot = round0Slots[matchup * 2 + 1];

      if (topSlot && bottomSlot && topSlot.teamName && bottomSlot.teamName) {
        const boxX = Math.min(topSlot.x, bottomSlot.x) - GAME_BOX_PADDING;
        const boxY = topSlot.y - GAME_BOX_PADDING;
        const boxWidth = SLOT_WIDTH + GAME_BOX_PADDING * 2;
        const boxHeight = (bottomSlot.y + SLOT_HEIGHT) - topSlot.y + GAME_BOX_PADDING * 2;

        const isSelected = selectedGame &&
          ((selectedGame.team1 === topSlot.teamName && selectedGame.team2 === bottomSlot.teamName) ||
           (selectedGame.team1 === bottomSlot.teamName && selectedGame.team2 === topSlot.teamName));

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
            selectGame({ team1: topSlot.teamName, team2: bottomSlot.teamName });
          })
          .on('mouseenter', function() {
            d3.select(this)
              .attr('fill', 'rgba(59, 130, 246, 0.05)')
              .attr('stroke', '#93c5fd');
          })
          .on('mouseleave', function() {
            const stillSelected = selectedGame &&
              ((selectedGame.team1 === topSlot.teamName && selectedGame.team2 === bottomSlot.teamName) ||
               (selectedGame.team1 === bottomSlot.teamName && selectedGame.team2 === topSlot.teamName));
            d3.select(this)
              .attr('fill', stillSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent')
              .attr('stroke', stillSelected ? '#3b82f6' : '#e5e7eb');
          });
      }
    }

    // Draw connecting lines
    const lineGroup = svg.append('g').attr('class', 'lines');

    for (let round = 0; round < rounds - 1; round++) {
      const roundSlots = slots.filter(s => s.round === round);
      const nextRoundSlots = slots.filter(s => s.round === round + 1);

      for (let i = 0; i < roundSlots.length; i += 2) {
        const topSlot = roundSlots[i];
        const bottomSlot = roundSlots[i + 1];
        const nextSlot = nextRoundSlots[Math.floor(i / 2)];

        if (topSlot && bottomSlot && nextSlot) {
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

    // Round 0 slots with teams
    slots.filter(s => s.round === 0 && s.teamName).forEach((slot) => {
      const group = slotGroup.append('g')
        .attr('transform', `translate(${slot.x}, ${slot.y})`)
        .attr('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          selectTeam(slot.teamName);
        });

      const delta = slot.teamInfo?.delta || 0;

      // Background rect
      group.append('rect')
        .attr('width', SLOT_WIDTH)
        .attr('height', SLOT_HEIGHT)
        .attr('rx', 3)
        .attr('fill', getDeltaColor(delta, maxDelta))
        .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
        .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);

      // Team name
      group.append('text')
        .attr('x', 4)
        .attr('y', SLOT_HEIGHT / 2 + 4)
        .attr('font-size', '10px')
        .attr('fill', '#374151')
        .text(slot.teamName.length > 14 ? slot.teamName.substring(0, 12) + '..' : slot.teamName);
    });

    // Empty slots for later rounds
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

  }, [games, teamInfoMap, maxDelta, flipHorizontal, selectTeam, selectGame, selectedTeam, selectedGame]);

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
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: bracket, isLoading: bracketLoading } = useBracket();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);

  // Re-center bracket when sidebar opens/closes
  useLayoutEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      if (scrollWidth > clientWidth) {
        container.scrollLeft = (scrollWidth - clientWidth) / 2;
      }
    }
  }, [selectedTeam, selectedGame]);

  const isLoading = teamsLoading || bracketLoading;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <div className="animate-pulse h-96 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!teams || teams.length === 0 || !bracket) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tournament Bracket</h2>
        <p className="text-gray-500">No bracket data available</p>
      </div>
    );
  }

  // Build a map of team name -> TeamInfo for quick lookup
  const teamInfoMap = new Map<string, TeamInfo>();
  teams.forEach(t => teamInfoMap.set(t.name, t));

  // Calculate max delta for color scaling
  const maxDelta = Math.max(...teams.map((t) => Math.abs(t.delta)));

  // Split bracket games into regions (16 games each for 64-team bracket)
  const regions = [
    { name: 'South', games: bracket.games.slice(0, 16) },
    { name: 'East', games: bracket.games.slice(16, 32) },
    { name: 'Midwest', games: bracket.games.slice(32, 48) },
    { name: 'West', games: bracket.games.slice(48, 64) },
  ];

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Tournament Bracket</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getDeltaColor(maxDelta, maxDelta) }}></div>
            <span>+Delta</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-200"></div>
            <span>Neutral</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: getDeltaColor(-maxDelta, maxDelta) }}></div>
            <span>-Delta</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-8">
          <RegionBracket
            games={regions[0].games}
            teamInfoMap={teamInfoMap}
            regionName={regions[0].name}
            maxDelta={maxDelta}
          />
          <RegionBracket
            games={regions[1].games}
            teamInfoMap={teamInfoMap}
            regionName={regions[1].name}
            maxDelta={maxDelta}
          />
        </div>
        <div className="space-y-8">
          <RegionBracket
            games={regions[2].games}
            teamInfoMap={teamInfoMap}
            regionName={regions[2].name}
            maxDelta={maxDelta}
            flipHorizontal
          />
          <RegionBracket
            games={regions[3].games}
            teamInfoMap={teamInfoMap}
            regionName={regions[3].name}
            maxDelta={maxDelta}
            flipHorizontal
          />
        </div>
      </div>
    </div>
  );
}
