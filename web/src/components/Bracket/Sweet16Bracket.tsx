import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useUIStore } from '../../store/uiStore';
import type { BracketGame, TeamInfo } from '../../types';
import { ROUND_GAP, SLOT_GAP, SLOT_HEIGHT, SLOT_WIDTH } from './bracketConstants';
import { getDeltaColor, truncateTeamName } from './bracketUtils';

interface Sweet16BracketProps {
  regions: { games: BracketGame[] }[];
  teamInfoMap: Map<string, TeamInfo>;
  maxDelta: number;
  getFirstTeamName: (games: BracketGame[]) => string;
}

// Sweet 16 bracket showing the inner rounds (Sweet 16 through Championship)
export function Sweet16Bracket({
  regions,
  teamInfoMap,
  maxDelta,
  getFirstTeamName,
}: Sweet16BracketProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectTeam = useUIStore((state) => state.selectTeam);
  const navigateToDetailedView = useUIStore((state) => state.navigateToDetailedView);
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
        .on('click', () => selectTeam(slot.teamName))
        .on('dblclick', (event: MouseEvent) => {
          event.stopPropagation();
          event.preventDefault();
          if (slot.teamName) {
            navigateToDetailedView(slot.teamName);
          }
        });

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
        .text(truncateTeamName(slot.teamName, false));
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
