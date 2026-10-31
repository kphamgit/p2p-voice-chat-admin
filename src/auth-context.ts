import { createContext, useContext } from 'react';

// The authenticated user, mirroring what the backend returns from
// /auth/login, /auth/register, and /auth/me. `name` is the login username;
// `role` drives authorization (e.g. "admin" unlocks the dialog editor).
export interface AuthUser {
  id: number;
  name: string;
  role: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean; // true while a stored token is being validated on startup
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// Access the auth state/actions. Throws if used outside <AuthProvider> so the
// mistake surfaces immediately rather than as a confusing null later.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
