import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useUIStore } from '../../store/uiStore';
import { makePositionKey } from '../../utils/bracketTree';
import type { TeamInfo, BracketGame, PlayInGame, CompletedGame } from '../../types';
import {
  COMPACT_ROUND_GAP,
  COMPACT_SLOT_GAP,
  COMPACT_SLOT_WIDTH,
  GAME_BOX_PADDING,
  ROUND_GAP,
  SLOT_GAP,
  SLOT_HEIGHT,
  SLOT_WIDTH,
} from './bracketConstants';
import {
  buildSlotMapFromOutcomes,
  getDeltaColor,
  getImportanceColor,
  getOutcomeWinner,
  makeGameKey,
  truncateTeamName,
} from './bracketUtils';

interface BracketSlot {
  teamName: string;
  teamInfo: TeamInfo | null;
  x: number;
  y: number;
  round: number;
  slotIndex: number;
  isFromCompletedGame?: boolean; // True if team advanced here due to a completed game
  isUndeterminedPlayIn?: boolean; // True if this is a play-in slot with no determined winner
}

export function RegionBracket({
  games,
  playInGames = [],
  completedGames = [],
  teamInfoMap,
  regionIndex,
  maxDelta,
  flipHorizontal = false,
  compact = false,
  gameImportanceMap,
  maxImportance = 0,
}: {
  games: BracketGame[];
  playInGames?: PlayInGame[];
  completedGames?: CompletedGame[];
  teamInfoMap: Map<string, TeamInfo>;
  regionIndex: number;  // 0-3 for the four regions
  maxDelta: number;
  flipHorizontal?: boolean;
  compact?: boolean;  // Use smaller dimensions for overall view
  gameImportanceMap?: Map<string, number>;
  maxImportance?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const selectGame = useUIStore((state) => state.selectGame);
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);
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

    // Build set of teams that have won completed games for quick lookup
    const completedWinners = new Set(completedGames.map(g => g.winner));
    const eliminatedTeams = new Set(completedGames.map(g => g.loser));

    // Helper to check if a game between two teams is already completed
    const isGameCompleted = (team1: string, team2: string) =>
      completedGames.some(
        g => (g.winner === team1 && g.loser === team2) ||
             (g.winner === team2 && g.loser === team1)
      );

    // Compute which teams are in later round slots based on completed games and what-if outcomes
    // Completed games take priority over what-if outcomes
    const completedSlotMap = buildSlotMapFromOutcomes(games, completedGames);
    const allGameOutcomes = [...whatIf.permanentGameOutcomes, ...whatIf.scenarioGameOutcomes];
    const whatIfSlotMap = buildSlotMapFromOutcomes(games, allGameOutcomes);

    // Build slots from games - each game has one team (or multiple for play-in)
    // For a 16-team region, we have 16 slots in round 0
    const slots: BracketSlot[] = [];
    const rounds = 5; // 16 -> 8 -> 4 -> 2 -> 1 (regional winner)

    // Create a set of slot indices that have play-in games
    const playInSlotIndices = new Set(playInGames.map(p => p.slot_index % 16));

    // Build a map of play-in game outcomes from completed games and what-if
    // Key: slot index, Value: winner team name
    const playInWinners = new Map<number, string>();
    for (const playIn of playInGames) {
      const slotIdx = playIn.slot_index % 16;
      // Check completed games first
      const completedOutcome = completedGames.find(
        g => (g.winner === playIn.team1 && g.loser === playIn.team2) ||
             (g.winner === playIn.team2 && g.loser === playIn.team1)
      );
      if (completedOutcome) {
        playInWinners.set(slotIdx, completedOutcome.winner);
      } else {
        // Check what-if outcomes (new format: team1/team2/probability)
        const whatIfOutcome = allGameOutcomes.find(
          g => {
            const [t1, t2] = g.team1 < g.team2 ? [g.team1, g.team2] : [g.team2, g.team1];
            const [p1, p2] = playIn.team1 < playIn.team2 ? [playIn.team1, playIn.team2] : [playIn.team2, playIn.team1];
            return t1 === p1 && t2 === p2;
          }
        );
        if (whatIfOutcome) {
          const resolved = getOutcomeWinner(whatIfOutcome);
          if (resolved) {
            playInWinners.set(slotIdx, resolved.winner);
          }
        }
      }
    }

    // Round 0: All 16 teams from the games
    games.forEach((game, i) => {
      // Get the team with highest probability (the "primary" team)
      const teamEntries = Object.entries(game.teams);
      teamEntries.sort((a, b) => b[1] - a[1]);

      // For play-in slots, use determined winner if available
      let teamName = '';
      let isUndeterminedPlayIn = false;
      if (playInSlotIndices.has(i)) {
        // This is a play-in game slot
        const winner = playInWinners.get(i);
        if (winner) {
          // Winner has been determined (via completed game or what-if)
          teamName = winner;
        } else {
          // No winner determined yet - mark as undetermined but still show slot
          isUndeterminedPlayIn = true;
          // Use empty string to indicate no determined winner
          teamName = '';
        }
      } else {
        // Regular slot - use highest probability team
        teamName = teamEntries[0]?.[0] || '';
      }
      const teamInfo = teamName ? teamInfoMap.get(teamName) || null : null;

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
        isUndeterminedPlayIn,
      });
    });

    // Add slots for later rounds (may have determined teams from completed games or what-if)
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

        // Check for team in this slot - completed games take priority over what-if
        const slotKey = `${round}-${i}`;
        const completedTeam = completedSlotMap.get(slotKey);
        const whatIfTeam = whatIfSlotMap.get(slotKey);
        const teamName = completedTeam || whatIfTeam || '';
        const teamInfo = teamName ? teamInfoMap.get(teamName) || null : null;
        const isFromCompletedGame = !!completedTeam;

        slots.push({
          teamName,
          teamInfo,
          x: roundX,
          y,
          round,
          slotIndex: i,
          isFromCompletedGame,
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

        // Round 0 teams aren't from "completed games" in the advancement sense
        const r0GameKey = makeGameKey(topSlot.teamName, bottomSlot.teamName);
        const r0Importance = gameImportanceMap?.get(r0GameKey) ?? 0;
        const r0DefaultFill = maxImportance ? getImportanceColor(r0Importance, maxImportance) : 'rgba(219, 234, 254, 0.6)';

        gameBoxGroup.append('rect')
          .attr('x', boxX)
          .attr('y', boxY)
          .attr('width', boxWidth)
          .attr('height', boxHeight)
          .attr('rx', 5)
          .attr('fill', isSelected ? 'rgba(59, 130, 246, 0.15)' : r0DefaultFill)
          .attr('stroke', isSelected ? '#3b82f6' : '#93c5fd')
          .attr('stroke-width', isSelected ? 2 : 1)
          .attr('cursor', isGameCompleted(topSlot.teamName, bottomSlot.teamName) ? 'default' : 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            if (!isGameCompleted(topSlot.teamName, bottomSlot.teamName)) {
              selectGame({ team1: topSlot.teamName, team2: bottomSlot.teamName, bothConfirmedFromCompleted: true });
            }
          })
          .on('mouseenter', function() {
            if (!isGameCompleted(topSlot.teamName, bottomSlot.teamName)) {
              d3.select(this)
                .attr('fill', 'rgba(59, 130, 246, 0.15)')
                .attr('stroke', '#3b82f6');
            }
          })
          .on('mouseleave', function() {
            const stillSelected = selectedGame &&
              ((selectedGame.team1 === topSlot.teamName && selectedGame.team2 === bottomSlot.teamName) ||
               (selectedGame.team1 === bottomSlot.teamName && selectedGame.team2 === topSlot.teamName));
            d3.select(this)
              .attr('fill', stillSelected ? 'rgba(59, 130, 246, 0.15)' : r0DefaultFill)
              .attr('stroke', stillSelected ? '#3b82f6' : '#93c5fd');
          });
      }
    }

    // Draw game boxes for later rounds where both teams are known
    // Round 1: 8 slots -> 4 matchups, Round 2: 4 slots -> 2 matchups, Round 3: 2 slots -> 1 matchup
    for (let round = 1; round < rounds - 1; round++) {
      const roundSlots = slots.filter(s => s.round === round);
      const numMatchups = roundSlots.length / 2;

      for (let matchup = 0; matchup < numMatchups; matchup++) {
        const topSlot = roundSlots[matchup * 2];
        const bottomSlot = roundSlots[matchup * 2 + 1];

        // Only draw game box if both teams are known
        if (topSlot && bottomSlot && topSlot.teamName && bottomSlot.teamName) {
          const boxX = Math.min(topSlot.x, bottomSlot.x) - gameBoxPadding;
          const boxY = topSlot.y - gameBoxPadding;
          const boxWidth = slotWidth + gameBoxPadding * 2;
          const boxHeight = (bottomSlot.y + slotHeight) - topSlot.y + gameBoxPadding * 2;

          const isSelected = selectedGame &&
            ((selectedGame.team1 === topSlot.teamName && selectedGame.team2 === bottomSlot.teamName) ||
             (selectedGame.team1 === bottomSlot.teamName && selectedGame.team2 === topSlot.teamName));

          // Both teams confirmed only if both are from completed games
          const bothConfirmed = !!topSlot.isFromCompletedGame && !!bottomSlot.isFromCompletedGame;

          const gameCompleted = isGameCompleted(topSlot.teamName, bottomSlot.teamName);

          const laterGameKey = makeGameKey(topSlot.teamName, bottomSlot.teamName);
          const laterImportance = gameImportanceMap?.get(laterGameKey) ?? 0;
          const laterDefaultFill = maxImportance ? getImportanceColor(laterImportance, maxImportance) : 'rgba(219, 234, 254, 0.6)';

          gameBoxGroup.append('rect')
            .attr('x', boxX)
            .attr('y', boxY)
            .attr('width', boxWidth)
            .attr('height', boxHeight)
            .attr('rx', 5)
            .attr('fill', isSelected ? 'rgba(59, 130, 246, 0.15)' : laterDefaultFill)
            .attr('stroke', isSelected ? '#3b82f6' : '#93c5fd')
            .attr('stroke-width', isSelected ? 2 : 1)
            .attr('cursor', gameCompleted ? 'default' : 'pointer')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation();
              if (!gameCompleted) {
                selectGame({
                  team1: topSlot.teamName,
                  team2: bottomSlot.teamName,
                  bothConfirmedFromCompleted: bothConfirmed,
                });
              }
            })
            .on('mouseenter', function() {
              if (!gameCompleted) {
                d3.select(this)
                  .attr('fill', 'rgba(59, 130, 246, 0.15)')
                  .attr('stroke', '#3b82f6');
              }
            })
            .on('mouseleave', function() {
              const stillSelected = selectedGame &&
                ((selectedGame.team1 === topSlot.teamName && selectedGame.team2 === bottomSlot.teamName) ||
                 (selectedGame.team1 === bottomSlot.teamName && selectedGame.team2 === topSlot.teamName));
              d3.select(this)
                .attr('fill', stillSelected ? 'rgba(59, 130, 246, 0.15)' : laterDefaultFill)
                .attr('stroke', stillSelected ? '#3b82f6' : '#93c5fd');
            });
        }
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

        // Check completion status for play-in teams
        const team1WonGame = completedWinners.has(playIn.team1);
        const team1Eliminated = eliminatedTeams.has(playIn.team1);
        const team2WonGame = completedWinners.has(playIn.team2);
        const team2Eliminated = eliminatedTeams.has(playIn.team2);

        // Draw game box FIRST (background, behind team slots in SVG z-order)
        const boxTop = team1Y - gameBoxPadding;
        const boxBottom = team2Y + slotHeight + gameBoxPadding;
        const playInSelected = selectedGame &&
          ((selectedGame.team1 === playIn.team1 && selectedGame.team2 === playIn.team2) ||
           (selectedGame.team1 === playIn.team2 && selectedGame.team2 === playIn.team1));
        const playInCompleted = isGameCompleted(playIn.team1, playIn.team2);

        const piGameKey = makeGameKey(playIn.team1, playIn.team2);
        const piImportance = gameImportanceMap?.get(piGameKey) ?? 0;
        const piDefaultFill = maxImportance ? getImportanceColor(piImportance, maxImportance) : 'rgba(219, 234, 254, 0.6)';

        playInGroup.append('rect')
          .attr('x', playInX - gameBoxPadding)
          .attr('y', boxTop)
          .attr('width', slotWidth + gameBoxPadding * 2)
          .attr('height', boxBottom - boxTop)
          .attr('rx', 5)
          .attr('fill', playInSelected ? 'rgba(59, 130, 246, 0.15)' : piDefaultFill)
          .attr('stroke', playInSelected ? '#3b82f6' : '#93c5fd')
          .attr('stroke-width', playInSelected ? 2 : 1)
          .attr('cursor', playInCompleted ? 'default' : 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            if (!playInCompleted) {
              selectGame({ team1: playIn.team1, team2: playIn.team2, bothConfirmedFromCompleted: true });
            }
          })
          .on('mouseenter', function() {
            if (!playInCompleted) {
              d3.select(this)
                .attr('fill', 'rgba(59, 130, 246, 0.15)')
                .attr('stroke', '#3b82f6');
            }
          })
          .on('mouseleave', function() {
            const stillSelected = selectedGame &&
              ((selectedGame.team1 === playIn.team1 && selectedGame.team2 === playIn.team2) ||
               (selectedGame.team1 === playIn.team2 && selectedGame.team2 === playIn.team1));
            d3.select(this)
              .attr('fill', stillSelected ? 'rgba(59, 130, 246, 0.15)' : piDefaultFill)
              .attr('stroke', stillSelected ? '#3b82f6' : '#93c5fd');
          });

        // "vs" label between the two teams
        const vsY = (team1Y + slotHeight + team2Y) / 2;
        playInGroup.append('text')
          .attr('x', playInX + slotWidth / 2)
          .attr('y', vsY + 3)
          .attr('text-anchor', 'middle')
          .attr('font-size', '8px')
          .attr('font-weight', '600')
          .attr('fill', '#9ca3af')
          .text('vs');

        // Team 1 slot (top) — drawn after game box so it appears on top
        const team1Group = playInGroup.append('g')
          .attr('transform', `translate(${playInX}, ${team1Y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            selectTeam(playIn.team1);
          })
          .on('dblclick', (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            navigateToDetailedView(playIn.team1);
          });

        // Determine team 1 stroke
        let team1Stroke = playIn.team1 === selectedTeam ? '#3b82f6' : '#d1d5db';
        let team1StrokeWidth = playIn.team1 === selectedTeam ? 2 : 1;
        if (team1WonGame) {
          team1Stroke = '#16a34a';
          team1StrokeWidth = 2;
        }

        team1Group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta1, maxDelta))
          .attr('stroke', team1Stroke)
          .attr('stroke-width', team1StrokeWidth);

        const fontSize = compact ? '9px' : '10px';
        const team1Text = team1Group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', team1Eliminated ? '#9ca3af' : '#374151')
          .text(truncateTeamName(playIn.team1, compact));

        if (team1Eliminated) {
          team1Text.attr('text-decoration', 'line-through');
        }

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
          })
          .on('dblclick', (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            navigateToDetailedView(playIn.team2);
          });

        // Determine team 2 stroke
        let team2Stroke = playIn.team2 === selectedTeam ? '#3b82f6' : '#d1d5db';
        let team2StrokeWidth = playIn.team2 === selectedTeam ? 2 : 1;
        if (team2WonGame) {
          team2Stroke = '#16a34a';
          team2StrokeWidth = 2;
        }

        team2Group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta2, maxDelta))
          .attr('stroke', team2Stroke)
          .attr('stroke-width', team2StrokeWidth);

        const team2Text = team2Group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', team2Eliminated ? '#9ca3af' : '#374151')
          .text(truncateTeamName(playIn.team2, compact));

        if (team2Eliminated) {
          team2Text.attr('text-decoration', 'line-through');
        }

        // Win probability badge for team 2
        team2Group.append('text')
          .attr('x', slotWidth - 4)
          .attr('y', slotHeight / 2 + 3)
          .attr('text-anchor', 'end')
          .attr('font-size', '8px')
          .attr('fill', '#6b7280')
          .text(`${Math.round(playIn.team2_prob * 100)}%`);

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

    // Round 0 slots with teams (or undetermined play-in slots)
    slots.filter(s => s.round === 0 && (s.teamName || s.isUndeterminedPlayIn)).forEach((slot) => {
      // Check if this slot has a play-in game (multiple teams)
      const isPlayInSlot = playInSlotIndices.has(slot.slotIndex);
      // Calculate global position for modal
      const slotsPerRegionRound0 = 16;
      const globalPosition = regionIndex * slotsPerRegionRound0 + slot.slotIndex;

      // Check completion status
      const hasWonGame = slot.teamName ? completedWinners.has(slot.teamName) : false;
      const isEliminated = slot.teamName ? eliminatedTeams.has(slot.teamName) : false;

      const group = slotGroup.append('g')
        .attr('transform', `translate(${slot.x}, ${slot.y})`)
        .attr('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          if (isPlayInSlot) {
            // For play-in slots, open modal to show both candidates
            openMetaTeamModal(makePositionKey(0, globalPosition));
          } else if (slot.teamName) {
            selectTeam(slot.teamName);
          }
        })
        .on('dblclick', (event: MouseEvent) => {
          event.stopPropagation();
          event.preventDefault();
          if (!isPlayInSlot && slot.teamName) {
            navigateToDetailedView(slot.teamName);
          }
        });

      const delta = slot.teamInfo?.delta || 0;

      // Determine stroke color: green for winners, blue for selected, default otherwise
      let strokeColor = '#d1d5db';
      let strokeWidth = 1;
      if (hasWonGame) {
        strokeColor = '#16a34a'; // green-600 for completed game winners
        strokeWidth = 2;
      } else if (slot.teamName === selectedTeam) {
        strokeColor = '#3b82f6';
        strokeWidth = 2;
      } else if (slot.isUndeterminedPlayIn) {
        // Dashed border for undetermined play-in
        strokeColor = '#9ca3af';
      }

      // Background rect
      const rect = group.append('rect')
        .attr('width', slotWidth)
        .attr('height', slotHeight)
        .attr('rx', 3)
        .attr('fill', slot.isUndeterminedPlayIn ? '#f3f4f6' : getDeltaColor(delta, maxDelta))
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth);

      if (slot.isUndeterminedPlayIn) {
        rect.attr('stroke-dasharray', '4,2');
      }

      // Team name (use smaller font in compact mode)
      // Apply strikethrough and grey color for eliminated teams
      const fontSize = compact ? '9px' : '10px';

      if (slot.isUndeterminedPlayIn) {
        // Show "TBD" or similar for undetermined play-in
        group.append('text')
          .attr('x', slotWidth / 2)
          .attr('y', slotHeight / 2 + 4)
          .attr('text-anchor', 'middle')
          .attr('font-size', fontSize)
          .attr('fill', '#9ca3af')
          .attr('font-style', 'italic')
          .text('Play-in TBD');
      } else {
        const textEl = group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', isEliminated ? '#9ca3af' : '#374151')
          .text(truncateTeamName(slot.teamName, compact));

        if (isEliminated) {
          textEl.attr('text-decoration', 'line-through');
        }
      }
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
        const isEliminated = eliminatedTeams.has(slot.teamName);

        const group = slotGroup.append('g')
          .attr('transform', `translate(${slot.x}, ${slot.y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            if (slot.isFromCompletedGame) {
              // Team is confirmed here via completed games - select the team
              selectTeam(slot.teamName);
            } else {
              // Team is here via what-if - allow changing via meta team modal
              openMetaTeamModal(makePositionKey(globalRound, globalPosition));
            }
          })
          .on('dblclick', (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            if (slot.teamName) {
              navigateToDetailedView(slot.teamName);
            }
          });

        const delta = slot.teamInfo?.delta || 0;

        // Determine stroke: thick black for completed game advancement, blue for selected, default otherwise
        let strokeColor = '#d1d5db';
        let strokeWidth = 1;
        if (slot.isFromCompletedGame) {
          strokeColor = '#000000'; // Black for confirmed advancement from completed games
          strokeWidth = 3;
        } else if (slot.teamName === selectedTeam) {
          strokeColor = '#3b82f6';
          strokeWidth = 2;
        }

        // Background rect with delta color
        group.append('rect')
          .attr('width', slotWidth)
          .attr('height', slotHeight)
          .attr('rx', 3)
          .attr('fill', getDeltaColor(delta, maxDelta))
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeWidth);

        // Team name
        const fontSize = compact ? '9px' : '10px';
        const textEl = group.append('text')
          .attr('x', 4)
          .attr('y', slotHeight / 2 + 4)
          .attr('font-size', fontSize)
          .attr('fill', isEliminated ? '#9ca3af' : '#374151')
          .text(truncateTeamName(slot.teamName, compact));

        if (isEliminated) {
          textEl.attr('text-decoration', 'line-through');
        }

        // Hover effect (only if not from completed game)
        if (!slot.isFromCompletedGame) {
          group.on('mouseenter', function() {
            d3.select(this).select('rect')
              .attr('stroke', '#3b82f6')
              .attr('stroke-width', 2);
          }).on('mouseleave', function() {
            d3.select(this).select('rect')
              .attr('stroke', slot.teamName === selectedTeam ? '#3b82f6' : '#d1d5db')
              .attr('stroke-width', slot.teamName === selectedTeam ? 2 : 1);
          });
        }
      } else {
        // Empty slot - clickable to open meta-team modal
        const group = slotGroup.append('g')
          .attr('transform', `translate(${slot.x}, ${slot.y})`)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            openMetaTeamModal(makePositionKey(globalRound, globalPosition));
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

  }, [games, playInGames, completedGames, teamInfoMap, maxDelta, flipHorizontal, compact, selectTeam, selectGame, selectedTeam, selectedGame, regionIndex, openMetaTeamModal, whatIf, gameImportanceMap, maxImportance]);

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

  return <svg ref={svgRef} width={width} height={height} />;
}
