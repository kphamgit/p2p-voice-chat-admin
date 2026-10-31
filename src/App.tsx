import { AuthProvider } from './AuthProvider'
import { useAuth } from './auth-context'
import { AuthScreen } from './AuthScreen'
import { TeacherDialogPanel } from './TeacherDialogPanel'
import ListLevels from './ListLevels'

import './App.css'

// Gate the app: an unauthenticated user only ever sees the login/register
// screen, so no dialog data is fetched until they are signed in.
function AppContent() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return <p style={{ padding: 20, fontFamily: 'sans-serif' }}>Loading…</p>
  }

  if (!user) {
    return <AuthScreen />
  }

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
          Signed in as <strong>{user.name}</strong>
        </span>
        <button onClick={logout} style={{ padding: '6px 12px' }}>
          Log out
        </button>
      </header>

      {/* Teachers get the dialog authoring form. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, padding: '0 20px' }}>
        {user.role === 'teacher' && <TeacherDialogPanel />}
        <ListLevels />
      </div>
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
