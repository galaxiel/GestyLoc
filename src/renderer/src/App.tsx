import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Component, useEffect } from 'react'
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
import { Simulateur } from './pages/Simulateur'
import { BienDetail } from './pages/BienDetail'

/**
 * Raccourcis clavier de navigation :
 * Ctrl+1..6 = pages principales, Ctrl+N = nouveau bail.
 */
/**
 * Pare-chocs : une erreur de rendu affiche le message au lieu d'une page
 * blanche silencieuse (bug signalé : « l'onglet Quittances ne s'affiche pas »).
 */
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { erreur: Error | null }
> {
  state = { erreur: null as Error | null }
  static getDerivedStateFromError(erreur: Error): { erreur: Error } {
    return { erreur }
  }
  render(): React.ReactNode {
    if (this.state.erreur) {
      return (
        <div className="m-8 rounded-xl border border-red-300 bg-red-50 p-6 dark:border-red-500/40 dark:bg-red-500/10">
          <h2 className="mb-2 font-bold text-red-700 dark:text-red-300">
            Une erreur est survenue dans cette page
          </h2>
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">
            {this.state.erreur.message}
          </p>
          <button
            onClick={() => {
              this.setState({ erreur: null })
              window.location.hash = '#/'
            }}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            Retour au tableau de bord
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function RaccourcisClavier(): null {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const routes = ['/', '/biens', '/paiements', '/quittances', '/documents', '/statistiques', '/simulateur', '/depenses', '/regularisation', '/parametres']
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
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/biens" element={<BiensLocataires />} />
              <Route path="/baux/:id" element={<BailDetail />} />
              <Route path="/biens/:id" element={<BienDetail />} />
              <Route path="/paiements" element={<Paiements />} />
              <Route path="/quittances" element={<Quittances />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/statistiques" element={<Statistiques />} />
              <Route path="/simulateur" element={<Simulateur />} />
              <Route path="/depenses" element={<Depenses />} />
              <Route path="/regularisation" element={<Regularisation />} />
              <Route path="/parametres" element={<Parametres />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </StoreProvider>
    </HashRouter>
  )
}

export default App
