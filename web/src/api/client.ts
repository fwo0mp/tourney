const API_BASE = '/api/v1';

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
  delete: <T>(url: string) =>
    fetchJson<T>(url, {
      method: 'DELETE',
    }),
};
