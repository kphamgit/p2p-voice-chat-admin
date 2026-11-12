import { useState } from 'react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'
import { AuthScreen } from './AuthScreen'
import ListLevels from './ListLevels'
import ListUsers from './ListUsers'
import DialogsManager from './DialogsManager'
import TtsManager from './TtsManager'

import './App.css'

type Tab = 'levels' | 'users' | 'dialogs' | 'tts'

// Gate the app: an unauthenticated user only ever sees the login/register
// screen, so no dialog data is fetched until they are signed in.
function AppContent() {
  const { user, loading, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('levels')

  if (loading) {
    return <p style={{ padding: 20, fontFamily: 'sans-serif' }}>Loading…</p>
  }

  if (!user) {
    return <AuthScreen />
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'levels', label: 'Levels' },
    { id: 'users', label: 'Users' },
    { id: 'dialogs', label: 'Dialogs Manager' },
    { id: 'tts', label: 'TTS Manager' },
  ]

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #eee',
          fontFamily: 'sans-serif',
        }}
      >
        <span>
          Signed in as <strong>{user.name}</strong> ({user.role})
        </span>
        <button onClick={logout} style={{ padding: '6px 12px' }}>
          Log out
        </button>
      </header>

      <nav className="flex gap-1 border-b border-[var(--border)] px-5 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t border px-4 py-2 ${
              tab === t.id
                ? 'border-[var(--border)] border-b-[var(--bg)] bg-[var(--bg)] font-semibold text-[var(--text-h)]'
                : 'border-transparent hover:text-[var(--text-h)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'users' ? (
        <ListUsers />
      ) : tab === 'dialogs' ? (
        <DialogsManager />
      ) : tab === 'tts' ? (
        <TtsManager />
      ) : (
        <ListLevels />
      )}
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
