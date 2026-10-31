import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthUser } from './auth-context';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const TOKEN_KEY = 'authToken';

// This app is for admins only; other roles are turned away at sign-in.
const ALLOWED_ROLE = 'admin';
const NOT_ADMIN_MESSAGE = 'Only admins can sign in to this app.';

interface AuthResponse {
  token: string;
  user: AuthUser;
}

// POST to an auth endpoint and return { token, user }, surfacing the backend's
// error message on non-2xx responses.
async function postAuth(path: string, body: Record<string, unknown>): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return data as AuthResponse;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  // Only "loading" when we have a stored token to validate; otherwise show the
  // login screen immediately.
  const [loading, setLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));

  // Validate the stored token on startup (and whenever it changes) by loading
  // the profile from /auth/me. A bad/expired token is cleared so the user is
  // sent back to the login screen.
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('invalid token');
        const me = (await res.json()) as AuthUser;
        // A stored token for a non-admin (e.g. from before this check existed,
        // or a role change) is treated like an invalid one.
        if (me.role !== ALLOWED_ROLE) throw new Error(NOT_ADMIN_MESSAGE);
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Only admins get a session; anyone else gets an error shown on the login screen.
  const applySession = useCallback((res: AuthResponse) => {
    if (res.user.role !== ALLOWED_ROLE) {
      throw new Error(NOT_ADMIN_MESSAGE);
    }
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      applySession(await postAuth('/auth/login', { name: username, password }));
    },
    [applySession],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      applySession(await postAuth('/auth/register', { name: username, password }));
    },
    [applySession],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
