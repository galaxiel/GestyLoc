import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet, Home, AlertTriangle, CalendarClock, Plus, Receipt,
  ChevronDown, ChevronRight, Coins
} from 'lucide-react'
import type { Alerte, Paiement } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate, periodeCourante } from '../lib/format'

const groupeStyle: Record<Alerte['type'], { titre: string; couleur: string }> = {
  fin_bail: { titre: 'Fins de bail', couleur: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300' },
  revision_irl: { titre: 'Révisions IRL en attente', couleur: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300' },
  impaye: { titre: 'Loyers impayés', couleur: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300' }
}

const severiteUrgente: Record<Alerte['severite'], boolean> = {
  urgent: true,
  warning: false,
  info: false
}

/** Groupe d'alertes repliable. */
function GroupeAlertes({ type, alertes }: { type: Alerte['type']; alertes: Alerte[] }): React.JSX.Element | null {
  const [ouvert, setOuvert] = useState(false)
  if (alertes.length === 0) return null
  const style = groupeStyle[type]
  const nbUrgentes = alertes.filter((a) => severiteUrgente[a.severite]).length

  return (
    <li className={`rounded-lg border ${style.couleur}`}>
      <button
        onClick={() => setOuvert(!ouvert)}
        className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium"
      >
        {ouvert ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {style.titre} — {alertes.length}{' '}
          {alertes.length > 1 ? 'alertes' : 'alerte'}{' '}
          {nbUrgentes > 0 && <span className="font-semibold">dont {nbUrgentes} urgente(s)</span>}
        </span>
      </button>
      {ouvert && (
        <ul className="space-y-1 border-t border-current/20 px-3 pb-3 pt-2 text-sm">
          {alertes.map((a, i) => (
            <li key={`${type}-${a.bail_id}-${i}`}>• {a.message}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function Dashboard(): React.JSX.Element {
  const { locations, alertes, loading, error } = useStore()
  const navigate = useNavigate()
  const [paiements, setPaiements] = useState<Paiement[]>([])

  useEffect(() => {
    void ipc.paiements
      .listAll()
      .then(setPaiements)
      .catch(() => setPaiements([]))
  }, [locations])

  // --- Trésorerie du mois ---
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)
  const attenduCeMois = bauxPayants.reduce(
    (s, r) => s + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
    0
  )
  const periode = periodeCourante()
  const encaisseCeMois = paiements
    .filter((p) => p.periode === periode && (p.statut === 'paye' || p.statut === 'partiel'))
    .reduce((s, p) => s + p.montant_paye, 0)
  const resteAEncaisser = Math.max(attenduCeMois - encaisseCeMois, 0)
  const impayesCumules = paiements
    .filter((p) => p.statut === 'retard' || p.statut === 'impaye')
    .reduce((s, p) => s + p.montant_paye, 0)
  const nbImpayes = paiements.filter((p) => p.statut === 'retard' || p.statut === 'impaye').length

  const bauxActifs = locations.filter((r) => r.bail.actif)
  const totalLoyerCcMensuel = bauxPayants.reduce(
    (s, r) => s + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
    0
  )

  // --- Alertes groupées par type ---
  const alertesGroupees = useMemo(() => {
    const groupes: Record<Alerte['type'], Alerte[]> = { fin_bail: [], revision_irl: [], impaye: [] }
    for (const a of alertes) groupes[a.type].push(a)
    return groupes
  }, [alertes])

  if (loading) return <div className="p-8 text-slate-400">Chargement…</div>
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

      {/* Actions rapides */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate('/paiements')}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Wallet className="h-4 w-4" /> Pointer les loyers
        </button>
        <button
          onClick={() => navigate('/quittances')}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Receipt className="h-4 w-4" /> Quittances du mois
        </button>
        <button
          onClick={() => navigate('/biens', { state: { openNew: true } })}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> Nouveau bail
        </button>
      </div>

      {/* Trésorerie */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Trésorerie — {periodeCourante().replace('-', '/')}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Attendu ce mois</span>
              <Coins className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold">{formatEuro(attenduCeMois)}</div>
            <div className="mt-1 text-xs text-slate-400">{bauxPayants.length} bail(s) payant(s)</div>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-600 dark:text-emerald-400">Encaissé</span>
              <Wallet className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatEuro(encaisseCeMois)}
            </div>
            <div className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">
              {Math.round((encaisseCeMois / Math.max(attenduCeMois, 1)) * 10000) / 100} % du mois
            </div>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-amber-600 dark:text-amber-400">Reste à encaisser</span>
              <CalendarClock className="h-5 w-5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">
              {formatEuro(resteAEncaisser)}
            </div>
            <div className="mt-1 text-xs text-amber-600/70 dark:text-amber-400/70">
              ce mois-ci
            </div>
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600 dark:text-red-400">Impayés cumulés</span>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-red-700 dark:text-red-300">
              {formatEuro(impayesCumules)}
            </div>
            <div className="mt-1 text-xs text-red-600/70 dark:text-red-400/70">
              {nbImpayes} période(s) toutes époques
            </div>
          </div>
        </div>
      </section>

      {/* Indicateurs du parc */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">Loyers mensuels (CC)</span>
            <Wallet className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{formatEuro(totalLoyerCcMensuel)}</div>
          <div className="mt-1 text-xs text-slate-400">soit {formatEuro(totalLoyerCcMensuel * 12)}/an</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">Biens gérés</span>
            <Home className="h-5 w-5 text-violet-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{locations.length}</div>
          <div className="mt-1 text-xs text-slate-400">
            {bauxPayants.length} loué(s)
            {locations.filter((r) => r.bail.actif && r.bail.occupation_gratuite).length >
              0 && ` + ${locations.filter((r) => r.bail.actif && r.bail.occupation_gratuite).length} gratuit(s)`}
            {' · '}
            {locations
              .filter((r) => r.bail.actif && !r.bail.occupation_gratuite)
              .reduce((sum, r) => sum + (r.bien.surface_m2 ?? 0), 0)
              .toLocaleString('fr-FR')}{' '}
            m² loués
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">Alertes actives</span>
            <AlertTriangle className={`h-5 w-5 ${alertes.length > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
          </div>
          <div className="mt-2 text-2xl font-bold">{alertes.length}</div>
          <div className="mt-1 text-xs text-slate-400">
            {alertes.filter((a) => a.severite === 'urgent').length} urgente(s)
          </div>
        </div>
      </div>

      {/* Alertes groupées */}
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
            {(['fin_bail', 'revision_irl', 'impaye'] as const).map((type) => (
              <GroupeAlertes key={type} type={type} alertes={alertesGroupees[type]} />
            ))}
          </ul>
        )}
      </section>

      {/* Échéances de bail */}
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
                    className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    onClick={() => navigate(`/baux/${r.bail.id}`)}
                  >
                    <td className="px-4 py-2">{r.bien.designation}</td>
                    <td className="px-4 py-2">{r.locataire.nom_complet}</td>
                    <td className="px-4 py-2">
                      {formatDate(r.bail.date_fin_bail)}
                      {r.jours_avant_fin_bail !== null && (
                        <span
                          className={`ml-2 text-xs ${(r.jours_avant_fin_bail ?? 0) < 90 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}
                        >
                          (dans {r.jours_avant_fin_bail} j)
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
