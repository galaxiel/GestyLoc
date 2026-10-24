import { useCallback, useEffect, useState, createContext, useContext } from 'react'
import type { BienLocationRow, Alerte } from '@shared/types'
import { ipc } from '../lib/ipc'

interface StoreState {
  locations: BienLocationRow[]
  alertes: Alerte[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const StoreContext = createContext<StoreState | null>(null)

/**
 * Store central : charge la vue agrégée + les alertes, expose un refresh()
 * à appeler après toute mutation (create/update/delete).
 * Contexte React plutôt que state local : toutes les pages partagent les
 * mêmes données sans prop-drilling ni duplication d'appels IPC.
 */
export function StoreProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locations, setLocations] = useState<BienLocationRow[]>([])
  const [alertes, setAlertes] = useState<Alerte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [locs, alrs] = await Promise.all([ipc.locations.list(), ipc.alertes.list()])
      setLocations(locs)
      setAlertes(alrs)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <StoreContext.Provider value={{ locations, alertes, loading, error, refresh }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): StoreState {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore doit être utilisé dans <StoreProvider>')
  return ctx
}
