import { useEffect, useMemo, useState } from 'react'
import { BarChart3, TrendingUp, Home, Wallet, Ruler } from 'lucide-react'
import type { Paiement } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatPeriode } from '../lib/format'

/** Génère les N dernières périodes 'yyyy-mm', la plus ancienne en premier. */
function periodesPassees(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function KpiCard({
  titre,
  valeur,
  detail,
  icon: Icon,
  couleur
}: {
  titre: string
  valeur: string
  detail?: string
  icon: React.ElementType
  couleur: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">{titre}</span>
        <Icon className={`h-5 w-5 ${couleur}`} />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{valeur}</div>
      {detail && <div className="mt-1 text-xs text-slate-400">{detail}</div>}
    </div>
  )
}

export function Statistiques(): React.JSX.Element {
  const { locations } = useStore()
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void ipc.paiements
      .listAll()
      .then(setPaiements)
      .catch(() => setPaiements([]))
      .finally(() => setLoading(false))
  }, [])

  // --- Encaissements par mois (12 derniers) ---
  const encaissements = useMemo(() => {
    const periodes = periodesPassees(12)
    return periodes.map((p) => ({
      periode: p,
      total: paiements
        .filter((x) => x.periode === p && (x.statut === 'paye' || x.statut === 'partiel'))
        .reduce((s, x) => s + x.montant_paye, 0)
    }))
  }, [paiements])

  const maxEncaissement = Math.max(...encaissements.map((e) => e.total), 1)

  // --- Répartition par type de bien (loyer CC mensuel) ---
  const parType = useMemo(() => {
    const map = new Map<string, { total: number; nb: number }>()
    for (const r of locations) {
      if (!r.bail.actif || r.bail.occupation_gratuite) continue
      const cc = r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)
      const cur = map.get(r.bien.type_bien) ?? { total: 0, nb: 0 }
      map.set(r.bien.type_bien, { total: cur.total + cc, nb: cur.nb + 1 })
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [locations])
  const maxType = Math.max(...parType.map(([, v]) => v.total), 1)

  // --- KPI ---
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)
  const loyerMensuelCc = bauxPayants.reduce(
    (s, r) => s + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
    0
  )
  const encaisseAnnee = paiements
    .filter((p) => p.periode.startsWith(String(new Date().getFullYear())))
    .reduce((s, p) => s + p.montant_paye, 0)
  const surfaceLouee = bauxPayants.reduce((s, r) => s + (r.bien.surface_m2 ?? 0), 0)
  const loyerM2Moyen =
    surfaceLouee > 0 ? loyerMensuelCc / surfaceLouee : 0

  if (loading) return <div className="p-8 text-slate-400">Chargement…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Statistiques</h1>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          titre="Loyers mensuels (CC)"
          valeur={formatEuro(loyerMensuelCc)}
          detail={`${bauxPayants.length} bail(s) payant(s)`}
          icon={Wallet}
          couleur="text-emerald-500"
        />
        <KpiCard
          titre={`Encaissé en ${new Date().getFullYear()}`}
          valeur={formatEuro(encaisseAnnee)}
          detail="tous paiements pointés"
          icon={TrendingUp}
          couleur="text-blue-500"
        />
        <KpiCard
          titre="Surface louée"
          valeur={`${surfaceLouee.toLocaleString('fr-FR')} m²`}
          detail={`${locations.length} bien(s) au total`}
          icon={Home}
          couleur="text-violet-500"
        />
        <KpiCard
          titre="Loyer moyen / m²"
          valeur={formatEuro(Math.round(loyerM2Moyen * 100) / 100)}
          detail="loyer CC ÷ surface louée"
          icon={Ruler}
          couleur="text-amber-500"
        />
      </div>

      {/* Encaissements 12 mois */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Encaissements — 12 derniers mois
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          {encaissements.every((e) => e.total === 0) ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Aucun paiement pointé sur les 12 derniers mois — pointe tes loyers dans la
              page Paiements pour voir la courbe se remplir.
            </p>
          ) : (
            <div className="flex h-48 items-end gap-2">
              {encaissements.map((e) => (
                <div key={e.periode} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-400">
                    {formatEuro(e.total)}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-primary-500 transition-all group-hover:bg-primary-600"
                    style={{ height: `${Math.max((e.total / maxEncaissement) * 100, 2)}%` }}
                    title={`${formatPeriode(e.periode)} : ${formatEuro(e.total)}`}
                  />
                  <span className="text-[10px] text-slate-400">
                    {e.periode.slice(5)}/{e.periode.slice(2, 4)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Répartition par type */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Répartition des loyers par type de bien
        </h2>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
          {parType.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun bail actif.</p>
          ) : (
            parType.map(([type, v]) => (
              <div key={type}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">
                    {type} <span className="text-xs text-slate-400">({v.nb})</span>
                  </span>
                  <span>{formatEuro(v.total)}/mois</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${(v.total / maxType) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Astuce */}
      <p className="flex items-start gap-2 text-xs text-slate-400">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
        Les graphiques se remplissent automatiquement au fur et à mesure de tes pointages
        dans la page Paiements.
      </p>
    </div>
  )
}
