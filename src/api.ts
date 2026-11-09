const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// Call the backend with the user's bearer token. Returns parsed JSON (or null
// for empty responses such as 204) and throws the backend's error message on
// non-2xx responses. A FormData body (file upload) is sent as multipart;
// anything else as JSON.
export async function apiFetch<T = unknown>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // FormData sets its own multipart Content-Type (with the boundary).
      ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data as { message?: string } | null)?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
