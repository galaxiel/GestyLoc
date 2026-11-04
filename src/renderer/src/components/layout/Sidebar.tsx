import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowUpCircle, Search, X } from 'lucide-react'
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
import { nomBien } from '@shared/labels'

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
  const { alertes, locations } = useStore()
  const navigate = useNavigate()
  const [version, setVersion] = useState<string>('')
  const [updateDispo, setUpdateDispo] = useState<string | null>(null)

  // --- Recherche globale (disponible depuis n'importe quelle page) ---
  const [recherche, setRecherche] = useState('')
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (q.length < 2) return []
    return locations
      .filter(
        (r) =>
          r.locataire.nom_complet.toLowerCase().includes(q) ||
          nomBien(r.bien).toLowerCase().includes(q) ||
          r.bien.designation.toLowerCase().includes(q) ||
          (r.bien.ville ?? '').toLowerCase().includes(q) ||
          (r.bien.adresse ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [locations, recherche])

  useEffect(() => {
    void window.api.app.getVersion().then(setVersion)
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

      {/* Recherche globale : retrouve un locataire / un bien depuis partout */}
      <div className="relative border-b border-slate-200 p-2 dark:border-slate-800">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRecherche('')
            if (e.key === 'Enter' && resultats.length === 1) {
              navigate(`/baux/${resultats[0].bail.id}`)
              setRecherche('')
            }
          }}
          placeholder="Rechercher un locataire, un bien…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-sm outline-none focus:border-primary-400 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:focus:bg-slate-800"
        />
        {recherche && (
          <button
            onClick={() => setRecherche('')}
            aria-label="Effacer la recherche"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {resultats.length > 0 && (
          <ul className="absolute inset-x-2 top-full z-20 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {resultats.map((r) => (
              <li key={r.bail.id}>
                <button
                  onClick={() => {
                    navigate(`/baux/${r.bail.id}`)
                    setRecherche('')
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="font-medium">{r.locataire.nom_complet}</span>
                  <span className="truncate text-xs text-slate-400">
                    {nomBien(r.bien)}
                    {r.bien.ville ? ` — ${r.bien.ville}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {recherche.trim().length >= 2 && resultats.length === 0 && (
          <p className="absolute inset-x-2 top-full z-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            Aucun résultat pour « {recherche.trim()} ».
          </p>
        )}
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
