import { useState, useEffect, useMemo } from 'react'
import { Check, X, Clock, Loader2, Coins } from 'lucide-react'
import type { StatutPaiement, Paiement } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatPeriode } from '../lib/format'
import { nomBien } from '@shared/labels'
import pdfMake from 'pdfmake/build/pdfmake'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'

const MODES = ['Virement', 'Chèque', 'Espèces', 'Prélèvement', 'Autre'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vfs =
  (vfsFonts as any)?.pdfMake?.vfs ??
  (vfsFonts as any)?.default?.pdfMake?.vfs ??
  (vfsFonts as any)?.vfs ??
  (vfsFonts as any)?.default?.vfs ??
  vfsFonts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = vfs

/**
 * Vue matrice Mois × Biens : pointage en masse des loyers du mois choisi,
 * un clic par bail — remplace le pointage bail par bail.
 * Le backend (upsert par bail+periode) existe déjà.
 */
export function Paiements(): React.JSX.Element {
  const { locations, refresh } = useStore()
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  const [periode, setPeriode] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [saving, setSaving] = useState<number | null>(null)
  const [modes, setModes] = useState<Record<number, string>>({})

  const recharger = (): Promise<void> =>
    ipc.paiements
      .listAll()
      .then(setPaiements)
      .catch(() => setPaiements([]))

  useEffect(() => {
    void recharger()
  }, [])

  const statutDe = (bailId: number): Paiement | undefined =>
    paiements.find((p) => p.bail_id === bailId && p.periode === periode)

  // --- Totaux du mois sélectionné ---
  const totaux = useMemo(() => {
    const attendu = bauxPayants.reduce(
      (s, r) => s + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
      0
    )
    let encaisse = 0
    let nbPayes = 0
    let nbRetards = 0
    for (const r of bauxPayants) {
      const p = statutDe(r.bail.id)
      if (p && (p.statut === 'paye' || p.statut === 'partiel')) {
        encaisse += p.montant_paye
        nbPayes++
      }
      if (p && p.statut === 'retard') nbRetards++
    }
    return { attendu, encaisse, nbPayes, nbRetards }
  }, [bauxPayants, paiements, periode])

  const pointer = async (
    bailId: number,
    statut: StatutPaiement,
    montantForce?: number
  ): Promise<void> => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return
    setSaving(bailId)
    try {
      const loyerCc =
        montantForce ??
        row.bail.loyer_cc ??
        (row.bail.loyer_hc ?? 0) + (row.bail.charges ?? 0)
      const existant = statutDe(bailId)
      await ipc.paiements.upsert({
        bail_id: bailId,
        periode,
        montant_paye: loyerCc,
        statut,
        date_paiement: statut === 'paye' ? new Date().toISOString().slice(0, 10) : null,
        mode_paiement: modes[bailId] ?? existant?.mode_paiement ?? 'Virement'
      })
      await recharger()
      await refresh()
    } finally {
      setSaving(null)
    }
  }

  const pointerPartiel = async (bailId: number): Promise<void> => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return
    const attendu = row.bail.loyer_cc ?? (row.bail.loyer_hc ?? 0) + (row.bail.charges ?? 0)
    const saisie = prompt(
      `Montant reçu de ${row.locataire.nom_complet} pour ${periode} (attendu : ${attendu.toFixed(2)} €) :`,
      ''
    )
    if (saisie === null) return
    const montant = parseFloat(saisie.replace(',', '.'))
    if (isNaN(montant) || montant <= 0) {
      alert('Montant invalide — pointage annulé.')
      return
    }
    const montantArrondi = Math.round(montant * 100) / 100
    await pointer(bailId, montantArrondi >= attendu ? 'paye' : 'partiel', montantArrondi)

    // Paiement partiel : proposer le reçu (la quittance est réservée aux
    // paiements intégraux — art. 21, loi de 1989).
    if (montantArrondi < attendu) {
      if (!confirm('Paiement partiel enregistré. Générer un REÇU de paiement (PDF) ?')) return
      try {
        const bailleur = await ipc.parametres.getBailleur()
        const doc = (await ipc.recu.pdf({
          row,
          bailleur: bailleur?.nom_complet || '________________',
          adresseBailleur: bailleur?.adresse || '________________',
          periode,
          montantRecu: montantArrondi,
          modePaiement: modes[bailId] ?? 'Virement'
        })) as unknown as TDocumentDefinitions
        pdfMake.createPdf(doc).getBase64(async (base64: string) => {
          const nom = `recu_${slug(row.locataire.nom_complet)}_${periode}.pdf`
          const chemin = await ipc.quittances.save(base64, nom)
          if (chemin) window.alert(`Reçu enregistré : ${chemin}`)
        })
      } catch (err) {
        window.alert(`Erreur de génération du reçu : ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const toutMarquerPaye = async (): Promise<void> => {
    const nonPayes = bauxPayants.filter((r) => statutDe(r.bail.id)?.statut !== 'paye')
    if (nonPayes.length === 0) return
    if (
      !confirm(
        `Marquer les loyers de ${nonPayes.length} bail(s) comme PAYÉS pour ${periode} ?`
      )
    ) {
      return
    }
    for (const r of nonPayes) {
      setSaving(r.bail.id)
      const loyerCc = r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)
      const existant = statutDe(r.bail.id)
      await ipc.paiements.upsert({
        bail_id: r.bail.id,
        periode,
        montant_paye: loyerCc,
        statut: 'paye',
        date_paiement: new Date().toISOString().slice(0, 10),
        mode_paiement: modes[r.bail.id] ?? existant?.mode_paiement ?? 'Virement'
      })
    }
    await recharger()
    await refresh()
    setSaving(null)
  }

  const depointer = async (bailId: number): Promise<void> => {
    setSaving(bailId)
    try {
      await ipc.paiements.remove(bailId, periode)
      await recharger()
      await refresh()
    } finally {
      setSaving(null)
    }
  }

  const LIBELLES: Record<StatutPaiement, { pointer: string; annuler: string }> = {
    paye: { pointer: 'Marquer payé', annuler: 'Annuler le pointage payé' },
    retard: { pointer: 'Marquer en retard', annuler: 'Annuler le pointage retard' },
    impaye: { pointer: 'Marquer impayé', annuler: 'Annuler le pointage impayé' },
    partiel: { pointer: 'Marquer partiel', annuler: 'Annuler le pointage partiel' }
  }

  const slug = (nom: string): string =>
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

  const adressesUniquesParBail = new Map(
    locations.map((r) => {
      const parties = [r.bien.adresse, r.bien.code_postal, r.bien.ville]
        .filter((x, i, tab) => x && x !== r.bien.designation && tab.indexOf(x) === i)
      const valeur = parties.join(', ')
      return [r.bail.id, valeur !== '' && valeur !== r.bien.designation ? valeur : null]
    })
  )

  const boutonStatut = (
    r: { bail: { id: number } },
    statut: StatutPaiement,
    icon: React.ElementType,
    cls: string
  ): React.JSX.Element => {
    const existant = statutDe(r.bail.id)
    const actif = existant?.statut === statut
    const Icon = icon
    return (
      <button
        onClick={() => void (actif ? depointer(r.bail.id) : pointer(r.bail.id, statut))}
        title={actif ? LIBELLES[statut].annuler : LIBELLES[statut].pointer}
        aria-label={actif ? LIBELLES[statut].annuler : LIBELLES[statut].pointer}
        className={`rounded-lg p-1.5 transition-colors ${
          actif ? cls : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Suivi des paiements</h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            onClick={() => void toutMarquerPaye()}
            title="Pointer d'un coup tous les baux non payés du mois"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ✓ Tout marquer payé
          </button>
        </div>
      </div>

      {/* Totaux du mois */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs text-slate-400">Attendu en {formatPeriode(periode)}</div>
          <div className="text-lg font-bold">{formatEuro(totaux.attendu)}</div>
        </div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="text-xs text-emerald-600 dark:text-emerald-400">
            Encaissé ({totaux.nbPayes}/{bauxPayants.length})
          </div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            {formatEuro(totaux.encaisse)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Reste à encaisser — dont {totaux.nbRetards} retard(s) à relancer
          </div>
          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
            {formatEuro(totaux.attendu - totaux.encaisse)}
          </div>
        </div>
      </div>

      {/* Matrice */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800" data-tri="bien puis locataire">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Bien / Locataire</th>
              <th className="px-4 py-2 text-right">Loyer CC</th>
              <th className="px-4 py-2">Règlement</th>
              <th className="px-4 py-2">Statut {formatPeriode(periode)}</th>
              <th className="px-4 py-2 text-right">Pointer</th>
            </tr>
          </thead>
          <tbody>
            {[...bauxPayants]
              .sort(
                (a, b) =>
                  a.bien.designation.localeCompare(b.bien.designation) ||
                  a.locataire.nom_complet.localeCompare(b.locataire.nom_complet)
              )
              .map((r) => {
              const existant = statutDe(r.bail.id)
              const styleStatut: Record<StatutPaiement, string> = {
                paye: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
                partiel: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
                retard: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
                impaye: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
              }
              return (
                <tr key={r.bail.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-2 text-sm">{r.bien.type_bien}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{nomBien(r.bien)}</div>
                    <div className="text-xs text-slate-400">{r.locataire.nom_complet}</div>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {adressesUniquesParBail.get(r.bail.id) ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatEuro(r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0))}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={modes[r.bail.id] ?? existant?.mode_paiement ?? 'Virement'}
                      onChange={(e) => setModes({ ...modes, [r.bail.id]: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {saving === r.bail.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : existant ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styleStatut[existant.statut]}`}
                      >
                        {existant.statut === 'paye'
                          ? `Payé${existant.date_paiement ? ` le ${existant.date_paiement.slice(8, 10)}/${existant.date_paiement.slice(5, 7)}` : ''}`
                          : existant.statut === 'retard'
                            ? 'En retard'
                            : existant.statut === 'partiel'
                              ? 'Partiel'
                              : 'Impayé'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">non pointé</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      {boutonStatut(r, 'paye', Check, 'bg-emerald-600 text-white hover:bg-emerald-700')}
                      <button
                        onClick={() => void pointerPartiel(r.bail.id)}
                        title="Marquer partiel (saisir le montant reçu)"
                        aria-label="Marquer partiel (saisir le montant reçu)"
                        className={`rounded-lg p-1.5 transition-colors ${
                          existant?.statut === 'partiel'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Coins className="h-4 w-4" />
                      </button>
                      {boutonStatut(r, 'retard', Clock, 'bg-amber-500 text-white hover:bg-amber-600')}
                      {boutonStatut(r, 'impaye', X, 'bg-red-600 text-white hover:bg-red-700')}
                    </div>
                  </td>
                </tr>
              )
            })}
            {bauxPayants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Aucun bail payant actif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Clique sur ✓ (payé), 💶 (partiel — saisir le montant reçu), ⏱ (en retard) ou
        ✕ (impayé) pour pointer chaque bail du mois choisi. Re-cliquer sur le même
        bouton annule le pointage. Les occupations
        gratuites n'apparaissent pas. L'historique complet de chaque bail est dans sa
        fiche détaillée.
      </p>
    </div>
  )
}
