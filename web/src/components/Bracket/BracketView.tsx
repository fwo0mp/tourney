import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { useTeams, useBracket } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import type { TeamInfo, BracketGame } from '../../types';

type BracketViewType = 'overall' | 'region1' | 'region2' | 'region3' | 'region4' | 'sweet16';

// Default sizes for individual region views
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 24;
const ROUND_GAP = 40;
const SLOT_GAP = 8;
const GAME_BOX_PADDING = 6;

// Compact sizes for overall view to fit without scrolling
const COMPACT_SLOT_WIDTH = 95;
const COMPACT_ROUND_GAP = 25;
const COMPACT_SLOT_GAP = 6;

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
  compact = false,
}: {
  games: BracketGame[];
  teamInfoMap: Map<string, TeamInfo>;
  regionName: string;
  maxDelta: number;
  flipHorizontal?: boolean;
  compact?: boolean;  // Use smaller dimensions for overall view
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

    // Use compact or full dimensions
    const slotWidth = compact ? COMPACT_SLOT_WIDTH : SLOT_WIDTH;
    const slotHeight = SLOT_HEIGHT;
    const roundGap = compact ? COMPACT_ROUND_GAP : ROUND_GAP;
    const slotGap = compact ? COMPACT_SLOT_GAP : SLOT_GAP;
    const gameBoxPadding = GAME_BOX_PADDING;

    // Build slots from games - each game has one team (or multiple for play-in)
    // For a 16-team region, we have 16 slots in round 0
    const slots: BracketSlot[] = [];
    const rounds = 5; // 16 -> 8 -> 4 -> 2 -> 1 (regional winner)

    // Round 0: All 16 teams from the games
    games.forEach((game, i) => {
      // Get the primary team name (first key in the teams dict)
      const teamNames = Object.keys(game.teams);
      const teamName = teamNames[0] || '';
      const teamInfo = teamInfoMap.get(teamName) || null;

      const roundX = flipHorizontal
        ? (rounds - 1) * (slotWidth + roundGap)
        : 0;
      const y = i * (slotHeight + slotGap);

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
    // Round 0: 16, Round 1: 8, Round 2: 4, Round 3: 2, Round 4: 1
    for (let round = 1; round < rounds; round++) {
      const slotsInRound = Math.pow(2, 4 - round);  // 8, 4, 2, 1
      for (let i = 0; i < slotsInRound; i++) {
        const spacing = Math.pow(2, round) * (slotHeight + slotGap);
        const offset = (Math.pow(2, round) - 1) * (slotHeight + slotGap) / 2;
        const y = offset + i * spacing;
        const roundX = flipHorizontal
          ? (rounds - 1 - round) * (slotWidth + roundGap)
          : round * (slotWidth + roundGap);

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
        const boxX = Math.min(topSlot.x, bottomSlot.x) - gameBoxPadding;
        const boxY = topSlot.y - gameBoxPadding;
        const boxWidth = slotWidth + gameBoxPadding * 2;
        const boxHeight = (bottomSlot.y + slotHeight) - topSlot.y + gameBoxPadding * 2;

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
          const startX = flipHorizontal ? topSlot.x : topSlot.x + slotWidth;
          const endX = flipHorizontal ? nextSlot.x + slotWidth : nextSlot.x;
          const midX = (startX + endX) / 2;

          // Horizontal line from top slot
          lineGroup.append('line')
            .attr('x1', startX)
            .attr('y1', topSlot.y + slotHeight / 2)
            .attr('x2', midX)
            .attr('y2', topSlot.y + slotHeight / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Horizontal line from bottom slot
          lineGroup.append('line')
            .attr('x1', startX)
            .attr('y1', bottomSlot.y + slotHeight / 2)
            .attr('x2', midX)
            .attr('y2', bottomSlot.y + slotHeight / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Vertical line connecting them
          lineGroup.append('line')
            .attr('x1', midX)
            .attr('y1', topSlot.y + slotHeight / 2)
            .attr('x2', midX)
            .attr('y2', bottomSlot.y + slotHeight / 2)
            .attr('stroke', '#d1d5db')
            .attr('stroke-width', 1);

          // Horizontal line to next round
          lineGroup.append('line')
            .attr('x1', midX)
            .attr('y1', nextSlot.y + slotHeight / 2)
            .attr('x2', endX)
            .attr('y2', nextSlot.y + slotHeight / 2)
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
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', getDeltaColor(delta, maxDelta))
        .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
        .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);

      // Team name (use smaller font in compact mode)
      const fontSize = compact ? '9px' : '10px';
      const maxNameLen = compact ? 11 : 14;
      group.append('text')
        .attr('x', 4)
        .attr('y', slotHeight / 2 + 4)
        .attr('font-size', fontSize)
        .attr('fill', '#374151')
        .text(slot.teamName.length > maxNameLen ? slot.teamName.substring(0, maxNameLen - 2) + '..' : slot.teamName);
    });

    // Empty slots for later rounds
    slots.filter(s => s.round > 0).forEach((slot) => {
      slotGroup.append('rect')
        .attr('x', slot.x)
        .attr('y', slot.y)
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 1);
    });

  }, [games, teamInfoMap, maxDelta, flipHorizontal, compact, selectTeam, selectGame, selectedTeam, selectedGame]);

  const slotWidth = compact ? COMPACT_SLOT_WIDTH : SLOT_WIDTH;
  const roundGap = compact ? COMPACT_ROUND_GAP : ROUND_GAP;
  const slotGap = compact ? COMPACT_SLOT_GAP : SLOT_GAP;
  const width = 5 * (slotWidth + roundGap);
  const height = 16 * (SLOT_HEIGHT + slotGap);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{regionName}</h3>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
}

// Sweet 16 bracket showing the inner rounds (Sweet 16 through Championship)
function Sweet16Bracket({
  regions,
  teamInfoMap,
  maxDelta,
  getFirstTeamName,
}: {
  regions: { games: BracketGame[] }[];
  teamInfoMap: Map<string, TeamInfo>;
  maxDelta: number;
  getFirstTeamName: (games: BracketGame[]) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const selectedTeam = useUIStore((state) => state.selectedTeam);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Sweet 16 layout:
    // Left side: Region 1 (4 teams) and Region 2 (4 teams) -> Elite 8 -> Final Four
    // Right side: Region 3 (4 teams) and Region 4 (4 teams) -> Elite 8 -> Final Four
    // Center: Championship game and winner

    const slotWidth = SLOT_WIDTH;
    const slotHeight = SLOT_HEIGHT;
    const roundGap = ROUND_GAP;
    const slotGap = SLOT_GAP;

    // Structure:
    // Round 0 (Sweet 16): 4 slots per region = 16 total
    // Round 1 (Elite 8): 2 slots per region = 8 total
    // Round 2 (Final Four): 1 slot per region = 4 total
    // Round 3 (Championship): 2 slots
    // Round 4 (Winner): 1 slot

    const regionHeight = 4 * (slotHeight + slotGap);
    const regionGap = 24;
    const totalHeight = 2 * regionHeight + regionGap;
    const centerY = totalHeight / 2;

    // Draw left side regions (1 and 2)
    const leftRegions = [0, 1];
    const rightRegions = [2, 3];

    interface SlotInfo {
      x: number;
      y: number;
      teamName: string;
      teamInfo: TeamInfo | null;
    }

    const allSlots: SlotInfo[] = [];

    // Left side - Regions 1 and 2
    leftRegions.forEach((regionIdx, ri) => {
      const regionY = ri * (regionHeight + regionGap);

      // Sweet 16 slots (4 teams from each region)
      for (let i = 0; i < 4; i++) {
        const game = regions[regionIdx].games[i];
        const teamNames = Object.keys(game?.teams || {});
        const teamName = teamNames[0] || '';
        const teamInfo = teamInfoMap.get(teamName) || null;

        const x = 0;
        const y = regionY + i * (slotHeight + slotGap);

        allSlots.push({ x, y, teamName, teamInfo });
      }
    });

    // Right side - Regions 3 and 4 (mirrored)
    const rightX = 4 * (slotWidth + roundGap);
    rightRegions.forEach((regionIdx, ri) => {
      const regionY = ri * (regionHeight + regionGap);

      for (let i = 0; i < 4; i++) {
        const game = regions[regionIdx].games[i];
        const teamNames = Object.keys(game?.teams || {});
        const teamName = teamNames[0] || '';
        const teamInfo = teamInfoMap.get(teamName) || null;

        const x = rightX;
        const y = regionY + i * (slotHeight + slotGap);

        allSlots.push({ x, y, teamName, teamInfo });
      }
    });

    // Draw connecting lines for left side
    const lineGroup = svg.append('g').attr('class', 'lines');

    // Left side Elite 8 connections
    leftRegions.forEach((_, ri) => {
      const regionY = ri * (regionHeight + regionGap);
      for (let i = 0; i < 2; i++) {
        const topY = regionY + i * 2 * (slotHeight + slotGap) + slotHeight / 2;
        const bottomY = topY + (slotHeight + slotGap);
        const nextY = (topY + bottomY) / 2;
        const startX = slotWidth;
        const midX = slotWidth + roundGap / 2;
        const endX = slotWidth + roundGap;

        // Horizontal from top
        lineGroup.append('line').attr('x1', startX).attr('y1', topY).attr('x2', midX).attr('y2', topY).attr('stroke', '#d1d5db');
        // Horizontal from bottom
        lineGroup.append('line').attr('x1', startX).attr('y1', bottomY).attr('x2', midX).attr('y2', bottomY).attr('stroke', '#d1d5db');
        // Vertical connector
        lineGroup.append('line').attr('x1', midX).attr('y1', topY).attr('x2', midX).attr('y2', bottomY).attr('stroke', '#d1d5db');
        // Horizontal to next round
        lineGroup.append('line').attr('x1', midX).attr('y1', nextY).attr('x2', endX).attr('y2', nextY).attr('stroke', '#d1d5db');
      }
    });

    // Left side Final Four connections
    for (let ri = 0; ri < 2; ri++) {
      const topRegionY = ri === 0 ? (slotHeight + slotGap) / 2 : regionHeight + regionGap + (slotHeight + slotGap) / 2;
      const topY = ri === 0 ? (slotHeight + slotGap) * 0.5 + slotHeight / 2 : regionHeight + regionGap + (slotHeight + slotGap) * 0.5 + slotHeight / 2;
    }

    // Right side connections (mirrored)
    rightRegions.forEach((_, ri) => {
      const regionY = ri * (regionHeight + regionGap);
      for (let i = 0; i < 2; i++) {
        const topY = regionY + i * 2 * (slotHeight + slotGap) + slotHeight / 2;
        const bottomY = topY + (slotHeight + slotGap);
        const nextY = (topY + bottomY) / 2;
        const startX = rightX;
        const midX = rightX - roundGap / 2;
        const endX = rightX - roundGap;

        lineGroup.append('line').attr('x1', startX).attr('y1', topY).attr('x2', midX).attr('y2', topY).attr('stroke', '#d1d5db');
        lineGroup.append('line').attr('x1', startX).attr('y1', bottomY).attr('x2', midX).attr('y2', bottomY).attr('stroke', '#d1d5db');
        lineGroup.append('line').attr('x1', midX).attr('y1', topY).attr('x2', midX).attr('y2', bottomY).attr('stroke', '#d1d5db');
        lineGroup.append('line').attr('x1', midX).attr('y1', nextY).attr('x2', endX).attr('y2', nextY).attr('stroke', '#d1d5db');
      }
    });

    // Draw Elite 8 empty slots
    const elite8Group = svg.append('g').attr('class', 'elite8');

    // Left Elite 8
    leftRegions.forEach((_, ri) => {
      const regionY = ri * (regionHeight + regionGap);
      for (let i = 0; i < 2; i++) {
        const y = regionY + i * 2 * (slotHeight + slotGap) + (slotHeight + slotGap) / 2;
        elite8Group.append('rect')
          .attr('x', slotWidth + roundGap)
          .attr('y', y)
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', '#f9fafb')
          .attr('stroke', '#e5e7eb');
      }
    });

    // Right Elite 8
    rightRegions.forEach((_, ri) => {
      const regionY = ri * (regionHeight + regionGap);
      for (let i = 0; i < 2; i++) {
        const y = regionY + i * 2 * (slotHeight + slotGap) + (slotHeight + slotGap) / 2;
        elite8Group.append('rect')
          .attr('x', rightX - roundGap - slotWidth)
          .attr('y', y)
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', '#f9fafb')
          .attr('stroke', '#e5e7eb');
      }
    });

    // Draw Final Four empty slots
    const finalFourY1 = (regionHeight - slotHeight) / 2;
    const finalFourY2 = regionHeight + regionGap + (regionHeight - slotHeight) / 2;
    const finalFourLeftX = 2 * (slotWidth + roundGap);
    const finalFourRightX = rightX - 2 * roundGap - slotWidth;

    [finalFourY1, finalFourY2].forEach(y => {
      // Left Final Four
      elite8Group.append('rect')
        .attr('x', finalFourLeftX)
        .attr('y', y)
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#e5e7eb');

      // Right Final Four
      elite8Group.append('rect')
        .attr('x', finalFourRightX)
        .attr('y', y)
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#e5e7eb');
    });

    // Draw Championship slots in center
    const champX = (rightX - slotWidth) / 2;
    [finalFourY1, finalFourY2].forEach(y => {
      elite8Group.append('rect')
        .attr('x', champX)
        .attr('y', y)
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', '#f9fafb')
        .attr('stroke', '#e5e7eb');
    });

    // Winner slot
    elite8Group.append('rect')
      .attr('x', champX)
      .attr('y', centerY - slotHeight / 2)
      .attr('width', slotWidth)
      .attr('height', slotHeight)
      .attr('rx', 3)
      .attr('fill', '#fef3c7')
      .attr('stroke', '#f59e0b');

    // Draw Sweet 16 team slots
    const slotGroup = svg.append('g').attr('class', 'slots');

    allSlots.forEach((slot) => {
      if (!slot.teamName) return;

      const group = slotGroup.append('g')
        .attr('transform', `translate(${slot.x}, ${slot.y})`)
        .attr('cursor', 'pointer')
        .on('click', () => selectTeam(slot.teamName));

      const delta = slot.teamInfo?.delta || 0;

      group.append('rect')
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', getDeltaColor(delta, maxDelta))
        .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
        .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);

      group.append('text')
        .attr('x', 4)
        .attr('y', slotHeight / 2 + 4)
        .attr('font-size', '10px')
        .attr('fill', '#374151')
        .text(slot.teamName.length > 14 ? slot.teamName.substring(0, 12) + '..' : slot.teamName);
    });

    // Add region labels
    const labelGroup = svg.append('g').attr('class', 'labels');
    labelGroup.append('text')
      .attr('x', slotWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#6b7280')
      .text(`Region 1 (${getFirstTeamName(regions[0].games)})`);

    labelGroup.append('text')
      .attr('x', slotWidth / 2)
      .attr('y', regionHeight + regionGap - 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#6b7280')
      .text(`Region 2 (${getFirstTeamName(regions[1].games)})`);

    labelGroup.append('text')
      .attr('x', rightX + slotWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#6b7280')
      .text(`Region 3 (${getFirstTeamName(regions[2].games)})`);

    labelGroup.append('text')
      .attr('x', rightX + slotWidth / 2)
      .attr('y', regionHeight + regionGap - 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#6b7280')
      .text(`Region 4 (${getFirstTeamName(regions[3].games)})`);

  }, [regions, teamInfoMap, maxDelta, selectTeam, selectedTeam, getFirstTeamName]);

  const width = 5 * (SLOT_WIDTH + ROUND_GAP);
  const height = 2 * (4 * (SLOT_HEIGHT + SLOT_GAP)) + 24 + 20;

  return <svg ref={svgRef} width={width} height={height} style={{ marginTop: 20 }} />;
}

export function BracketView() {
  const [view, setView] = useState<BracketViewType>('overall');
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: bracket, isLoading: bracketLoading } = useBracket();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);

  // Re-center bracket when sidebar opens/closes or view changes
  useLayoutEffect(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      if (scrollWidth > clientWidth) {
        container.scrollLeft = (scrollWidth - clientWidth) / 2;
      }
    }
  }, [selectedTeam, selectedGame, view]);

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
    { games: bracket.games.slice(0, 16) },
    { games: bracket.games.slice(16, 32) },
    { games: bracket.games.slice(32, 48) },
    { games: bracket.games.slice(48, 64) },
  ];

  // Get first team name from each region for dropdown labels
  const getFirstTeamName = (regionGames: BracketGame[]) => {
    const firstGame = regionGames[0];
    if (firstGame) {
      const teamNames = Object.keys(firstGame.teams);
      return teamNames[0] || 'Unknown';
    }
    return 'Unknown';
  };

  const viewOptions: { value: BracketViewType; label: string }[] = [
    { value: 'overall', label: 'Overall' },
    { value: 'region1', label: `Region 1 (${getFirstTeamName(regions[0].games)})` },
    { value: 'region2', label: `Region 2 (${getFirstTeamName(regions[1].games)})` },
    { value: 'region3', label: `Region 3 (${getFirstTeamName(regions[2].games)})` },
    { value: 'region4', label: `Region 4 (${getFirstTeamName(regions[3].games)})` },
    { value: 'sweet16', label: 'Sweet 16' },
  ];

  const renderBracketContent = () => {
    switch (view) {
      case 'region1':
        return (
          <RegionBracket
            games={regions[0].games}
            teamInfoMap={teamInfoMap}
            regionName={`Region 1 (${getFirstTeamName(regions[0].games)})`}
            maxDelta={maxDelta}
          />
        );
      case 'region2':
        return (
          <RegionBracket
            games={regions[1].games}
            teamInfoMap={teamInfoMap}
            regionName={`Region 2 (${getFirstTeamName(regions[1].games)})`}
            maxDelta={maxDelta}
          />
        );
      case 'region3':
        return (
          <RegionBracket
            games={regions[2].games}
            teamInfoMap={teamInfoMap}
            regionName={`Region 3 (${getFirstTeamName(regions[2].games)})`}
            maxDelta={maxDelta}
          />
        );
      case 'region4':
        return (
          <RegionBracket
            games={regions[3].games}
            teamInfoMap={teamInfoMap}
            regionName={`Region 4 (${getFirstTeamName(regions[3].games)})`}
            maxDelta={maxDelta}
          />
        );
      case 'sweet16':
        return (
          <Sweet16Bracket
            regions={regions}
            teamInfoMap={teamInfoMap}
            maxDelta={maxDelta}
            getFirstTeamName={getFirstTeamName}
          />
        );
      case 'overall':
      default:
        return (
          <div className="inline-grid grid-cols-2 gap-4">
            <div className="space-y-6">
              <RegionBracket
                games={regions[0].games}
                teamInfoMap={teamInfoMap}
                regionName={`Region 1 (${getFirstTeamName(regions[0].games)})`}
                maxDelta={maxDelta}
                compact
              />
              <RegionBracket
                games={regions[1].games}
                teamInfoMap={teamInfoMap}
                regionName={`Region 2 (${getFirstTeamName(regions[1].games)})`}
                maxDelta={maxDelta}
                compact
              />
            </div>
            <div className="space-y-6">
              <RegionBracket
                games={regions[2].games}
                teamInfoMap={teamInfoMap}
                regionName={`Region 3 (${getFirstTeamName(regions[2].games)})`}
                maxDelta={maxDelta}
                flipHorizontal
                compact
              />
              <RegionBracket
                games={regions[3].games}
                teamInfoMap={teamInfoMap}
                regionName={`Region 4 (${getFirstTeamName(regions[3].games)})`}
                maxDelta={maxDelta}
                flipHorizontal
                compact
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Tournament Bracket</h2>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as BracketViewType)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {viewOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
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

      {renderBracketContent()}
    </div>
  );
}
