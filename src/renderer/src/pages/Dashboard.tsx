import { Wallet, Home, AlertTriangle, CalendarClock } from 'lucide-react'
import type { Alerte } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { formatEuro, formatDate } from '../lib/format'

/** Carte statistique générique. */
function StatCard({
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

const styleSeverite: Record<Alerte['severite'], string> = {
  urgent: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300',
  warning:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300'
}

export function Dashboard(): React.JSX.Element {
  const { locations, alertes, loading, error } = useStore()

  // --- Statistiques ---
  const bauxActifs = locations.filter((r) => r.bail.actif)
  const totalLoyerCcMensuel = bauxActifs.reduce(
    (sum, r) => sum + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
    0
  )
  const totalEncaisse = bauxActifs.length * 0 // TODO: somme des paiements 'paye' (étape suivante)
  const surfaceTotale = locations.reduce((sum, r) => sum + (r.bien.surface_m2 ?? 0), 0)

  if (loading) {
    return <div className="p-8 text-slate-400">Chargement…</div>
  }
  if (error) {
    return (
      <div className="m-8 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
        Erreur de chargement : {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Tableau de bord</h1>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          titre="Loyers mensuels (CC)"
          valeur={formatEuro(totalLoyerCcMensuel)}
          detail={`${bauxActifs.length} bail${bauxActifs.length > 1 ? 'aux' : ''} actif${bauxActifs.length > 1 ? 's' : ''}`}
          icon={Wallet}
          couleur="text-emerald-500"
        />
        <StatCard
          titre="Encaissé ce mois"
          valeur={formatEuro(totalEncaisse)}
          detail="Pointer dans Paiements"
          icon={Wallet}
          couleur="text-blue-500"
        />
        <StatCard
          titre="Biens gérés"
          valeur={String(locations.length)}
          detail={`${surfaceTotale.toLocaleString('fr-FR')} m² au total`}
          icon={Home}
          couleur="text-violet-500"
        />
        <StatCard
          titre="Alertes actives"
          valeur={String(alertes.length)}
          detail={`${alertes.filter((a) => a.severite === 'urgent').length} urgentes`}
          icon={AlertTriangle}
          couleur="text-amber-500"
        />
      </div>

      {/* Alertes */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <CalendarClock className="h-4 w-4" /> Alertes
        </h2>
        {alertes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aucune alerte — tout est en ordre.
          </p>
        ) : (
          <ul className="space-y-2">
            {alertes.map((a, i) => (
              <li
                key={`${a.type}-${a.bail_id}-${i}`}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styleSeverite[a.severite]}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Récap des baux actifs (prochaines fins) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Échéances de bail à surveiller
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Bien</th>
                <th className="px-4 py-2">Locataire</th>
                <th className="px-4 py-2">Fin de bail</th>
                <th className="px-4 py-2 text-right">Loyer CC</th>
              </tr>
            </thead>
            <tbody>
              {bauxActifs
                .filter((r) => r.jours_avant_fin_bail !== null)
                .sort((a, b) => (a.jours_avant_fin_bail ?? 0) - (b.jours_avant_fin_bail ?? 0))
                .map((r) => (
                  <tr
                    key={r.bail.id}
                    className="border-t border-slate-200 dark:border-slate-800"
                  >
                    <td className="px-4 py-2">{r.bien.designation}</td>
                    <td className="px-4 py-2">{r.locataire.nom_complet}</td>
                    <td className="px-4 py-2">
                      {formatDate(r.bail.date_fin_bail)}
                      {r.jours_avant_fin_bail !== null && (
                        <span
                          className={`ml-2 text-xs ${(r.jours_avant_fin_bail ?? 0) < 90 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}
                        >
                          ({r.jours_avant_fin_bail} j)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatEuro(r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0))}
                    </td>
                  </tr>
                ))}
              {bauxActifs.filter((r) => r.jours_avant_fin_bail !== null).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Aucun bail avec date de fin définie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
