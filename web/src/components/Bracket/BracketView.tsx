import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import * as d3 from 'd3';
import { useTeams, useBracket } from '../../hooks/useTournament';
import { useUIStore } from '../../store/uiStore';
import { MetaTeamModal } from './MetaTeamModal';
import type { TeamInfo, BracketGame, PlayInGame } from '../../types';

type BracketViewType = 'overall' | 'region1' | 'region2' | 'region3' | 'region4' | 'sweet16';

// Default sizes for individual region views
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 24;
const ROUND_GAP = 40;
const SLOT_GAP = 8;
const GAME_BOX_PADDING = 6;

// Compact sizes for overall view to fit without scrolling
// With 6 columns (5 rounds + 1 play-in), these fit in ~1200px container
const COMPACT_SLOT_WIDTH = 80;
const COMPACT_ROUND_GAP = 18;
const COMPACT_SLOT_GAP = 5;

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

// Build a map of which team is in each slot based on what-if outcomes
function buildWhatIfSlotMap(
  games: BracketGame[],
  whatIfOutcomes: { winner: string; loser: string }[]
): Map<string, string> {
  // Map of "round-slotIndex" -> team name
  const slotMap = new Map<string, string>();

  if (whatIfOutcomes.length === 0) return slotMap;

  // Create a map of winner -> teams they beat (their "path")
  const winnerBeats = new Map<string, Set<string>>();
  for (const outcome of whatIfOutcomes) {
    if (!winnerBeats.has(outcome.winner)) {
      winnerBeats.set(outcome.winner, new Set());
    }
    winnerBeats.get(outcome.winner)!.add(outcome.loser);
  }

  // Create team -> round 0 slot index map
  const teamToR0Slot = new Map<string, number>();
  games.forEach((game, i) => {
    const teamNames = Object.keys(game.teams);
    teamNames.forEach(name => teamToR0Slot.set(name, i));
  });

  // For each winner, trace their path through the bracket
  for (const [winner, beatSet] of winnerBeats.entries()) {
    const r0Slot = teamToR0Slot.get(winner);
    if (r0Slot === undefined) continue;

    // Check each round - calculate positions directly from R0 slot
    for (let round = 1; round <= 4; round++) {
      // Team's slot in the previous round (round - 1)
      // At round R-1, team is at slot floor(r0Slot / 2^(R-1))
      const teamSlotInPrevRound = Math.floor(r0Slot / Math.pow(2, round - 1));

      // Opponent's slot in the previous round (XOR with 1 to get adjacent slot)
      const opponentSlotInPrevRound = teamSlotInPrevRound ^ 1;

      // Opponent could have come from any R0 slot in this range
      // Slot S in round R-1 contains teams from R0 slots [S * 2^(R-1), (S+1) * 2^(R-1))
      const opponentR0Start = opponentSlotInPrevRound * Math.pow(2, round - 1);
      const opponentR0End = opponentR0Start + Math.pow(2, round - 1);

      // Get all teams that could be in the opponent position
      const opponentTeams: string[] = [];
      for (let i = opponentR0Start; i < opponentR0End && i < games.length; i++) {
        opponentTeams.push(...Object.keys(games[i]?.teams || {}));
      }

      // Check if this winner has beaten any of those teams
      const hasBeatenOpponent = opponentTeams.some(t => beatSet.has(t));

      if (hasBeatenOpponent) {
        // Team's slot in this round (after winning)
        const teamSlotInThisRound = Math.floor(r0Slot / Math.pow(2, round));
        slotMap.set(`${round}-${teamSlotInThisRound}`, winner);
      } else {
        // No win recorded for this round, stop tracing
        break;
      }
    }
  }

  return slotMap;
}

function RegionBracket({
  games,
  playInGames = [],
  teamInfoMap,
  regionName,
  regionIndex,
  maxDelta,
  flipHorizontal = false,
  compact = false,
}: {
  games: BracketGame[];
  playInGames?: PlayInGame[];
  teamInfoMap: Map<string, TeamInfo>;
  regionName: string;
  regionIndex: number;  // 0-3 for the four regions
  maxDelta: number;
  flipHorizontal?: boolean;
  compact?: boolean;  // Use smaller dimensions for overall view
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const selectGame = useUIStore((state) => state.selectGame);
  const selectedTeam = useUIStore((state) => state.selectedTeam);
  const selectedGame = useUIStore((state) => state.selectedGame);
  const openMetaTeamModal = useUIStore((state) => state.openMetaTeamModal);
  const whatIf = useUIStore((state) => state.whatIf);

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

    // Check if this region has any play-in games
    const hasPlayIns = playInGames.length > 0;

    // Add top padding for play-in games that might extend above first slot
    const topPadding = hasPlayIns ? 20 : 0;

    // Create a transform group for all content
    const contentGroup = svg.append('g')
      .attr('transform', `translate(0, ${topPadding})`);
    // Offset for all rounds to make room for play-in column
    const playInOffset = hasPlayIns ? (slotWidth + roundGap) : 0;

    // Compute which teams are in later round slots based on what-if outcomes
    const whatIfSlotMap = buildWhatIfSlotMap(games, whatIf.gameOutcomes);

    // Build slots from games - each game has one team (or multiple for play-in)
    // For a 16-team region, we have 16 slots in round 0
    const slots: BracketSlot[] = [];
    const rounds = 5; // 16 -> 8 -> 4 -> 2 -> 1 (regional winner)

    // Create a set of slot indices that have play-in games
    const playInSlotIndices = new Set(playInGames.map(p => p.slot_index % 16));

    // Round 0: All 16 teams from the games
    games.forEach((game, i) => {
      // Get the team with highest probability (the "primary" team)
      const teamEntries = Object.entries(game.teams);
      teamEntries.sort((a, b) => b[1] - a[1]);
      const teamName = teamEntries[0]?.[0] || '';
      const teamInfo = teamInfoMap.get(teamName) || null;

      // When flipped, rounds go right-to-left, play-in is at far right
      // When not flipped, rounds go left-to-right, play-in is at far left
      const roundX = flipHorizontal
        ? (rounds - 1) * (slotWidth + roundGap)  // No offset when flipped
        : playInOffset;  // Offset when not flipped
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

    // Add slots for later rounds (may have determined teams from what-if)
    // Round 0: 16, Round 1: 8, Round 2: 4, Round 3: 2, Round 4: 1
    for (let round = 1; round < rounds; round++) {
      const slotsInRound = Math.pow(2, 4 - round);  // 8, 4, 2, 1
      for (let i = 0; i < slotsInRound; i++) {
        const spacing = Math.pow(2, round) * (slotHeight + slotGap);
        const offset = (Math.pow(2, round) - 1) * (slotHeight + slotGap) / 2;
        const y = offset + i * spacing;
        const roundX = flipHorizontal
          ? (rounds - 1 - round) * (slotWidth + roundGap)  // No offset when flipped
          : round * (slotWidth + roundGap) + playInOffset;  // Offset when not flipped

        // Check if there's a what-if selected team for this slot
        const slotKey = `${round}-${i}`;
        const teamName = whatIfSlotMap.get(slotKey) || '';
        const teamInfo = teamName ? teamInfoMap.get(teamName) || null : null;

        slots.push({
          teamName,
          teamInfo,
          x: roundX,
          y,
          round,
          slotIndex: i,
        });
      }
    }

    // Draw game boxes first (lower z-index) - for round 0 matchups
    const gameBoxGroup = contentGroup.append('g').attr('class', 'game-boxes');

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

    // Draw play-in games if any
    if (hasPlayIns) {
      const playInGroup = contentGroup.append('g').attr('class', 'play-in-games');

      playInGames.forEach((playIn) => {
        // Calculate local slot index within this region
        const localSlotIndex = playIn.slot_index % 16;
        const y = localSlotIndex * (slotHeight + slotGap);

        // Play-in game position (before round 0)
        // When flipped, play-in is at far right; when not flipped, at far left
        const playInX = flipHorizontal
          ? rounds * (slotWidth + roundGap)  // Far right
          : 0;  // Far left

        // Draw the play-in game box with two teams
        // Team 1 is at y - (slotHeight + slotGap)/2
        // Team 2 is at y + (slotHeight + slotGap)/2
        const team1Y = y - (slotHeight + slotGap) / 2;
        const team2Y = y + (slotHeight + slotGap) / 2;

        const team1Info = teamInfoMap.get(playIn.team1);
        const team2Info = teamInfoMap.get(playIn.team2);
        const delta1 = team1Info?.delta || 0;
        const delta2 = team2Info?.delta || 0;

        // Team 1 slot (top)
        const team1Group = playInGroup.append('g')
          .attr('transform', `translate(${playInX}, ${team1Y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            selectTeam(playIn.team1);
          });

        team1Group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta1, maxDelta))
          .attr('stroke', playIn.team1 === selectedTeam ? '#3b82f6' : '#d1d5db')
          .attr('stroke-width', playIn.team1 === selectedTeam ? 2 : 1);

        const fontSize = compact ? '9px' : '10px';
        const maxNameLen = compact ? 11 : 14;
        team1Group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', '#374151')
          .text(playIn.team1.length > maxNameLen ? playIn.team1.substring(0, maxNameLen - 2) + '..' : playIn.team1);

        // Win probability badge for team 1
        team1Group.append('text')
          .attr('x', slotWidth - 4)
          .attr('y', slotHeight / 2 + 3)
          .attr('text-anchor', 'end')
          .attr('font-size', '8px')
          .attr('fill', '#6b7280')
          .text(`${Math.round(playIn.team1_prob * 100)}%`);

        // Team 2 slot (bottom)
        const team2Group = playInGroup.append('g')
          .attr('transform', `translate(${playInX}, ${team2Y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            selectTeam(playIn.team2);
          });

        team2Group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta2, maxDelta))
          .attr('stroke', playIn.team2 === selectedTeam ? '#3b82f6' : '#d1d5db')
          .attr('stroke-width', playIn.team2 === selectedTeam ? 2 : 1);

        team2Group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', '#374151')
          .text(playIn.team2.length > maxNameLen ? playIn.team2.substring(0, maxNameLen - 2) + '..' : playIn.team2);

        // Win probability badge for team 2
        team2Group.append('text')
          .attr('x', slotWidth - 4)
          .attr('y', slotHeight / 2 + 3)
          .attr('text-anchor', 'end')
          .attr('font-size', '8px')
          .attr('fill', '#6b7280')
          .text(`${Math.round(playIn.team2_prob * 100)}%`);

        // Draw game box around both teams
        const boxTop = team1Y - gameBoxPadding;
        const boxBottom = team2Y + slotHeight + gameBoxPadding;
        playInGroup.append('rect')
          .attr('x', playInX - gameBoxPadding)
          .attr('y', boxTop)
          .attr('width', slotWidth + gameBoxPadding * 2)
          .attr('height', boxBottom - boxTop)
          .attr('rx', 5)
          .attr('fill', 'none')
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,2')
          .attr('pointer-events', 'none');

        // Add "vs" label between the two teams
        const vsY = (team1Y + slotHeight + team2Y) / 2;
        playInGroup.append('text')
          .attr('x', playInX + slotWidth / 2)
          .attr('y', vsY + 3)
          .attr('text-anchor', 'middle')
          .attr('font-size', '8px')
          .attr('font-weight', '600')
          .attr('fill', '#9ca3af')
          .text('vs');

        // Draw line connecting play-in to round 0 slot
        // Calculate round 0 X position (same formula as slots above)
        const round0X = flipHorizontal
          ? (rounds - 1) * (slotWidth + roundGap)
          : playInOffset;
        const startX = flipHorizontal ? playInX : playInX + slotWidth;
        const endX = flipHorizontal ? round0X + slotWidth : round0X;
        const midX = (startX + endX) / 2;
        const midY = y + slotHeight / 2;

        // Lines from both play-in teams to the middle (from center of each team slot)
        const line1Y = team1Y + slotHeight / 2;  // Team 1 center
        const line2Y = team2Y + slotHeight / 2;  // Team 2 center

        playInGroup.append('line')
          .attr('x1', startX)
          .attr('y1', line1Y)
          .attr('x2', midX)
          .attr('y2', line1Y)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);

        playInGroup.append('line')
          .attr('x1', startX)
          .attr('y1', line2Y)
          .attr('x2', midX)
          .attr('y2', line2Y)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);

        playInGroup.append('line')
          .attr('x1', midX)
          .attr('y1', line1Y)
          .attr('x2', midX)
          .attr('y2', line2Y)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);

        playInGroup.append('line')
          .attr('x1', midX)
          .attr('y1', midY)
          .attr('x2', endX)
          .attr('y2', midY)
          .attr('stroke', '#d1d5db')
          .attr('stroke-width', 1);
      });
    }

    // Draw connecting lines
    const lineGroup = contentGroup.append('g').attr('class', 'lines');

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
    const slotGroup = contentGroup.append('g').attr('class', 'slots');

    // Round 0 slots with teams
    slots.filter(s => s.round === 0 && s.teamName).forEach((slot) => {
      // Check if this slot has a play-in game (multiple teams)
      const isPlayInSlot = playInSlotIndices.has(slot.slotIndex);
      // Calculate global position for modal
      const slotsPerRegionRound0 = 16;
      const globalPosition = regionIndex * slotsPerRegionRound0 + slot.slotIndex;

      const group = slotGroup.append('g')
        .attr('transform', `translate(${slot.x}, ${slot.y})`)
        .attr('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          if (isPlayInSlot) {
            // For play-in slots, open modal to show both candidates
            openMetaTeamModal(0, globalPosition);
          } else {
            selectTeam(slot.teamName);
          }
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

    // Later round slots - may have determined teams or be empty/clickable
    slots.filter(s => s.round > 0).forEach((slot) => {
      // Calculate the global position for this slot
      // Each region has 16 slots in round 0, then 8, 4, 2, 1
      // The global position calculation depends on round and regionIndex
      const slotsPerRegionRound0 = 16;
      const globalRound = slot.round;
      const slotsBeforeThisRegion = regionIndex * (slotsPerRegionRound0 / Math.pow(2, globalRound));
      const globalPosition = Math.floor(slotsBeforeThisRegion + slot.slotIndex);

      if (slot.teamName) {
        // Slot has a determined team - render like round 0 slots
        const group = slotGroup.append('g')
          .attr('transform', `translate(${slot.x}, ${slot.y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            // Still allow clicking to see other candidates or select a different team
            openMetaTeamModal(globalRound, globalPosition);
          });

        const delta = slot.teamInfo?.delta || 0;

        // Background rect with delta color
        group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta, maxDelta))
          .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
          .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);

        // Team name
        const fontSize = compact ? '9px' : '10px';
        const maxNameLen = compact ? 11 : 14;
        group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', '#374151')
          .text(slot.teamName.length > maxNameLen ? slot.teamName.substring(0, maxNameLen - 2) + '..' : slot.teamName);

        // Hover effect
        group.on('mouseenter', function() {
          d3.select(this).select('rect')
            .attr('stroke', '#3b82f6')
            .attr('stroke-width', 2);
        }).on('mouseleave', function() {
          d3.select(this).select('rect')
            .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
            .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);
        });
      } else {
        // Empty slot - clickable to open meta-team modal
        const group = slotGroup.append('g')
          .attr('transform', `translate(${slot.x}, ${slot.y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            openMetaTeamModal(globalRound, globalPosition);
          });

        group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', '#f9fafb')
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '4,2');

        group.on('mouseenter', function() {
          d3.select(this).select('rect')
            .attr('fill', '#f3f4f6')
            .attr('stroke', '#6b7280');
        }).on('mouseleave', function() {
          d3.select(this).select('rect')
            .attr('fill', '#f9fafb')
            .attr('stroke', '#9ca3af');
        });
      }
    });

  }, [games, playInGames, teamInfoMap, maxDelta, flipHorizontal, compact, selectTeam, selectGame, selectedTeam, selectedGame, regionIndex, openMetaTeamModal, whatIf]);

  const slotWidth = compact ? COMPACT_SLOT_WIDTH : SLOT_WIDTH;
  const roundGap = compact ? COMPACT_ROUND_GAP : ROUND_GAP;
  const slotGap = compact ? COMPACT_SLOT_GAP : SLOT_GAP;
  const hasPlayIns = playInGames.length > 0;
  // Width = 5 rounds + 1 play-in column (if any)
  const numColumns = 5 + (hasPlayIns ? 1 : 0);
  const width = numColumns * (slotWidth + roundGap);
  // Add padding for play-in games that might extend above first slot
  const topPadding = hasPlayIns ? 20 : 0;
  const height = 16 * (SLOT_HEIGHT + slotGap) + topPadding;

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
  const metaTeamModal = useUIStore((state) => state.metaTeamModal);
  const closeMetaTeamModal = useUIStore((state) => state.closeMetaTeamModal);
  const whatIf = useUIStore((state) => state.whatIf);

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
  // Also split play-in games by region based on their slot_index
  const playInGames = bracket.play_in_games || [];
  const regions = [
    {
      games: bracket.games.slice(0, 16),
      playInGames: playInGames.filter(p => p.slot_index < 16),
    },
    {
      games: bracket.games.slice(16, 32),
      playInGames: playInGames.filter(p => p.slot_index >= 16 && p.slot_index < 32),
    },
    {
      games: bracket.games.slice(32, 48),
      playInGames: playInGames.filter(p => p.slot_index >= 32 && p.slot_index < 48),
    },
    {
      games: bracket.games.slice(48, 64),
      playInGames: playInGames.filter(p => p.slot_index >= 48 && p.slot_index < 64),
    },
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
            playInGames={regions[0].playInGames}
            teamInfoMap={teamInfoMap}
            regionName={`Region 1 (${getFirstTeamName(regions[0].games)})`}
            regionIndex={0}
            maxDelta={maxDelta}
          />
        );
      case 'region2':
        return (
          <RegionBracket
            games={regions[1].games}
            playInGames={regions[1].playInGames}
            teamInfoMap={teamInfoMap}
            regionName={`Region 2 (${getFirstTeamName(regions[1].games)})`}
            regionIndex={1}
            maxDelta={maxDelta}
          />
        );
      case 'region3':
        return (
          <RegionBracket
            games={regions[2].games}
            playInGames={regions[2].playInGames}
            teamInfoMap={teamInfoMap}
            regionName={`Region 3 (${getFirstTeamName(regions[2].games)})`}
            regionIndex={2}
            maxDelta={maxDelta}
          />
        );
      case 'region4':
        return (
          <RegionBracket
            games={regions[3].games}
            playInGames={regions[3].playInGames}
            teamInfoMap={teamInfoMap}
            regionName={`Region 4 (${getFirstTeamName(regions[3].games)})`}
            regionIndex={3}
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
          <div className="inline-grid grid-cols-2 gap-4 mx-auto">
            <div className="space-y-6">
              <RegionBracket
                games={regions[0].games}
                playInGames={regions[0].playInGames}
                teamInfoMap={teamInfoMap}
                regionName={`Region 1 (${getFirstTeamName(regions[0].games)})`}
                regionIndex={0}
                maxDelta={maxDelta}
                compact
              />
              <RegionBracket
                games={regions[1].games}
                playInGames={regions[1].playInGames}
                teamInfoMap={teamInfoMap}
                regionName={`Region 2 (${getFirstTeamName(regions[1].games)})`}
                regionIndex={1}
                maxDelta={maxDelta}
                compact
              />
            </div>
            <div className="space-y-6">
              <RegionBracket
                games={regions[2].games}
                playInGames={regions[2].playInGames}
                teamInfoMap={teamInfoMap}
                regionName={`Region 3 (${getFirstTeamName(regions[2].games)})`}
                regionIndex={2}
                maxDelta={maxDelta}
                flipHorizontal
                compact
              />
              <RegionBracket
                games={regions[3].games}
                playInGames={regions[3].playInGames}
                teamInfoMap={teamInfoMap}
                regionName={`Region 4 (${getFirstTeamName(regions[3].games)})`}
                regionIndex={3}
                maxDelta={maxDelta}
                flipHorizontal
                compact
              />
            </div>
          </div>
        );
    }
  };

  // Check if any what-if scenarios are active
  const hasWhatIfActive = whatIf.gameOutcomes.length > 0 || Object.keys(whatIf.ratingAdjustments).length > 0;

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
          {hasWhatIfActive && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Scenario Active ({whatIf.gameOutcomes.length} game{whatIf.gameOutcomes.length !== 1 ? 's' : ''})
            </span>
          )}
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

      {metaTeamModal && (
        <MetaTeamModal
          round={metaTeamModal.round}
          position={metaTeamModal.position}
          onClose={closeMetaTeamModal}
        />
      )}
    </div>
  );
}
