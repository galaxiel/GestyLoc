import { useState, useEffect } from 'react'
import { Check, X, Clock, Loader2 } from 'lucide-react'
import type { StatutPaiement, Paiement } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatPeriode, libelleStatut } from '../lib/format'

const inputCls =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900'

/** Génère les N dernières périodes 'yyyy-mm', la plus récente en premier. */
function dernieresPeriodes(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

const boutonsStatut: { statut: StatutPaiement; icon: React.ElementType; cls: string }[] = [
  {
    statut: 'paye',
    icon: Check,
    cls: 'bg-emerald-600 text-white hover:bg-emerald-700'
  },
  {
    statut: 'retard',
    icon: Clock,
    cls: 'bg-amber-500 text-white hover:bg-amber-600'
  },
  {
    statut: 'impaye',
    icon: X,
    cls: 'bg-red-600 text-white hover:bg-red-700'
  }
]

const styleCellule: Record<StatutPaiement, string> = {
  paye: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  partiel: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
  retard: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  impaye: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
}

export function Paiements(): React.JSX.Element {
  const { locations, refresh } = useStore()
  // Les occupations gratuites (sans loyer) ne se pointent pas.
  const bauxActifs = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  const [bailId, setBailId] = useState<string>('')
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!bailId) {
      setPaiements([])
      return
    }
    void ipc.paiements
      .listByBail(Number(bailId))
      .then(setPaiements)
      .catch(() => setPaiements([]))
  }, [bailId])

  const row = locations.find((r) => r.bail.id === Number(bailId))
  const loyerCc = row ? (row.bail.loyer_cc ?? (row.bail.loyer_hc ?? 0) + (row.bail.charges ?? 0)) : 0

  const pointer = async (periode: string, statut: StatutPaiement): Promise<void> => {
    if (!bailId) return
    setSaving(periode)
    try {
      await ipc.paiements.upsert({
        bail_id: Number(bailId),
        periode,
        montant_paye: loyerCc,
        statut,
        date_paiement: statut === 'paye' ? new Date().toISOString().slice(0, 10) : null
      })
      const liste = await ipc.paiements.listByBail(Number(bailId))
      setPaiements(liste)
      await refresh()
    } finally {
      setSaving(null)
    }
  }

  const statutDe = (periode: string): Paiement | undefined =>
    paiements.find((p) => p.periode === periode)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Suivi des paiements</h1>

      <label className="block max-w-md">
        <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Bail à pointer
        </span>
        <select
          value={bailId}
          onChange={(e) => setBailId(e.target.value)}
          className={`${inputCls} w-full`}
        >
          <option value="">— Sélectionner un bail —</option>
          {bauxActifs.map((r) => (
            <option key={r.bail.id} value={r.bail.id}>
              {r.bien.designation} — {r.locataire.nom_complet}
            </option>
          ))}
        </select>
      </label>

      {row && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2 text-right">Montant attendu</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Pointer</th>
              </tr>
            </thead>
            <tbody>
              {dernieresPeriodes(6).map((p) => {
                const existant = statutDe(p)
                return (
                  <tr key={p} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-4 py-2 font-medium">{formatPeriode(p)}</td>
                    <td className="px-4 py-2 text-right">{formatEuro(loyerCc)}</td>
                    <td className="px-4 py-2">
                      {existant ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styleCellule[existant.statut]}`}
                        >
                          {libelleStatut(existant.statut)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">non pointé</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        {saving === p ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          boutonsStatut.map(({ statut, icon: Icon, cls }) => (
                            <button
                              key={statut}
                              onClick={() => void pointer(p, statut)}
                              title={libelleStatut(statut)}
                              className={`rounded-lg p-1.5 ${cls}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!bailId && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
          Sélectionnez un bail pour pointer ses loyers des 6 derniers mois.
        </p>
      )}
    </div>
  )
}
