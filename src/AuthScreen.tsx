import { useState } from 'react';
import { useAuth } from './auth-context';

type Mode = 'login' | 'register';

// Combined login / register screen. Shown whenever no user is authenticated;
// a successful submit updates the auth context, which swaps this out for the app.
export function AuthScreen() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(username.trim(), password);
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError(null);
  };

  return (
    <div
      style={{
        maxWidth: 360,
        margin: '60px auto',
        padding: 24,
        border: '1px solid #ddd',
        borderRadius: 8,
        fontFamily: 'sans-serif',
      }}
    >
      <h2 style={{ marginTop: 0 }}>{isRegister ? 'Create an account' : 'Sign in'}</h2>
      <p style={{ color: '#666', marginTop: 0 }}>
        You must be signed in to view or manage dialogs.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={{ padding: 8 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Password
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            style={{ padding: 8 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Show password
        </label>

        {error && (
          <p style={{ color: '#d33', margin: 0 }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} style={{ padding: '10px 16px' }}>
          {submitting ? 'Please wait…' : isRegister ? 'Register' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginBottom: 0 }}>
        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          type="button"
          onClick={switchMode}
          style={{
            background: 'none',
            border: 'none',
            color: '#0969da',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {isRegister ? 'Sign in' : 'Register'}
        </button>
      </p>
    </div>
  );
}

export default AuthScreen;
