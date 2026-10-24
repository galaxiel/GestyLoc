import { HashRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { StoreProvider } from './hooks/useStore'
import { Dashboard } from './pages/Dashboard'
import { BiensLocataires } from './pages/BiensLocataires'
import { Paiements } from './pages/Paiements'
import { Documents } from './pages/Documents'
import { Quittances } from './pages/Quittances'
import { Parametres } from './pages/Parametres'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <StoreProvider>
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/biens" element={<BiensLocataires />} />
              <Route path="/paiements" element={<Paiements />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/quittances" element={<Quittances />} />
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
