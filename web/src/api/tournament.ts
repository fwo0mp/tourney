import { api } from './client';
import type { TeamInfo, BracketResponse } from '../types';

export const tournamentApi = {
  getTeams: () => api.get<TeamInfo[]>('/tournament/teams'),
  getTeam: (name: string) => api.get<TeamInfo>(`/tournament/teams/${encodeURIComponent(name)}`),
  getBracket: () => api.get<BracketResponse>('/tournament/bracket'),
  getScores: () => api.get<Record<string, number>>('/tournament/scores'),
};
