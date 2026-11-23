let leaving = false;
export function markLeaving() { leaving = true; }

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !leaving && !location.pathname.startsWith('/login')) {
      leaving = true;
      location.href = '/login';
    }
    throw new Error('unauthorized');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}
