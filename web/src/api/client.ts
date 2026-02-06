import type { WhatIfState } from '../types';

const API_BASE = '/api/v1';

/**
 * Encode what-if state as URL query parameters.
 * Combines permanent and scenario overrides into what_if_outcomes and what_if_adjustments params.
 * Returns a query string with '?' prefix, or empty string if no params.
 */
export function encodeWhatIfParams(whatIf: WhatIfState | null | undefined): string {
  if (!whatIf) return '';
  const params = new URLSearchParams();

  const allOutcomes = [
    ...whatIf.permanentGameOutcomes,
    ...whatIf.scenarioGameOutcomes,
  ];
  const allAdjustments = {
    ...whatIf.permanentRatingAdjustments,
    ...whatIf.scenarioRatingAdjustments,
  };

  if (allOutcomes.length > 0) {
    params.set('what_if_outcomes', JSON.stringify(allOutcomes));
  }
  if (Object.keys(allAdjustments).length > 0) {
    params.set('what_if_adjustments', JSON.stringify(allAdjustments));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const api = {
  get: <T>(url: string) => fetchJson<T>(url),
  post: <T>(url: string, data: unknown) =>
    fetchJson<T>(url, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  put: <T>(url: string, data: unknown) =>
    fetchJson<T>(url, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: <T>(url: string) =>
    fetchJson<T>(url, {
      method: 'DELETE',
    }),
};
