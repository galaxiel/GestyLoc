import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ArrowUpCircle } from 'lucide-react'
import {
  LayoutDashboard,
  Home,
  Receipt,
  Wallet,
  FolderOpen,
  BarChart3,
  Calculator,
  Coins,
  Scale,
  Settings
} from 'lucide-react'
import { useStore } from '../../hooks/useStore'

const liens = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/biens', label: 'Biens & Locataires', icon: Home },
  { to: '/paiements', label: 'Paiements', icon: Wallet },
  { to: '/quittances', label: 'Quittances', icon: Receipt },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/statistiques', label: 'Statistiques', icon: BarChart3 },
  { to: '/simulateur', label: 'Simulateur', icon: Calculator },
  { to: '/depenses', label: 'Dépenses', icon: Coins },
  { to: '/regularisation', label: 'Régularisation', icon: Scale },
  { to: '/parametres', label: 'Paramètres', icon: Settings }
]

export function Sidebar(): React.JSX.Element {
  const { alertes } = useStore()
  const [version, setVersion] = useState<string>('')
  const [updateDispo, setUpdateDispo] = useState<string | null>(null)

  useEffect(() => {
    void window.electron.ipcRenderer.invoke('app:get-version').then(setVersion)
    const unDispo = window.api.updater.on('updater:update-available', (payload) => {
      setUpdateDispo((payload as unknown as { version: string }).version)
    })
    // Si déjà téléchargée (généré par la mise à jour en cours), montrer aussi.
    const unTelechargee = window.api.updater.on('updater:update-downloaded', () => {
      setUpdateDispo('installable au redémarrage')
    })
    return () => {
      unDispo()
      unTelechargee()
    }
  }, [])
  // Urgences : fins de bail expirées / loyers en retard.
  const nbUrgences = alertes.filter((a) => a.severite === 'urgent').length

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Logo / titre de l'app */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
        <Home className="h-5 w-5 text-primary-500" />
        <span className="font-semibold tracking-tight">GestyLoc</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {liens.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-500'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {to === '/' && nbUrgences > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {nbUrgences}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3 text-[11px] text-slate-400 dark:border-slate-800">
        {updateDispo && (
          <button
            onClick={() => (window.location.hash = '#/parametres')}
            className="mb-2 flex w-full items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            title="Aller aux Paramètres pour installer"
          >
            <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
            MàJ {updateDispo} dispo — installer
          </button>
        )}
        <div className="flex items-center justify-between">
          <span>Données 100 % locales</span>
          {version && <span className="font-mono">v{version}</span>}
        </div>
      </div>
    </aside>
  )
}
