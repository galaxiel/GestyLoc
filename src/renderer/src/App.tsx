import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { StoreProvider } from './hooks/useStore'
import { Dashboard } from './pages/Dashboard'
import { BiensLocataires } from './pages/BiensLocataires'
import { Paiements } from './pages/Paiements'
import { Documents } from './pages/Documents'
import { Quittances } from './pages/Quittances'
import { BailDetail } from './pages/BailDetail'
import { Parametres } from './pages/Parametres'
import { Statistiques } from './pages/Statistiques'
import { Depenses } from './pages/Depenses'
import { Regularisation } from './pages/Regularisation'
import { BienDetail } from './pages/BienDetail'

/**
 * Raccourcis clavier de navigation :
 * Ctrl+1..6 = pages principales, Ctrl+N = nouveau bail.
 */
function RaccourcisClavier(): null {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const routes = ['/', '/biens', '/paiements', '/quittances', '/documents', '/statistiques', '/depenses', '/regularisation', '/parametres']
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= routes.length) {
        e.preventDefault()
        navigate(routes[n - 1])
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate('/biens', { state: { openNew: true } })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
  return null
}

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <StoreProvider>
        <RaccourcisClavier />
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/biens" element={<BiensLocataires />} />
              <Route path="/baux/:id" element={<BailDetail />} />
              <Route path="/biens/:id" element={<BienDetail />} />
              <Route path="/paiements" element={<Paiements />} />
              <Route path="/quittances" element={<Quittances />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/statistiques" element={<Statistiques />} />
              <Route path="/depenses" element={<Depenses />} />
              <Route path="/regularisation" element={<Regularisation />} />
              <Route path="/parametres" element={<Parametres />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </main>
        </div>
      </StoreProvider>
    </HashRouter>
  )
}

export default App
