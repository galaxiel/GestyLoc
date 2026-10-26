import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Save } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { RegularisationCharges } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro } from '../lib/format'
import { nomBien } from '@shared/labels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vfs = (vfsFonts as any)?.pdfMake?.vfs ?? (vfsFonts as any)?.default?.pdfMake?.vfs ?? (vfsFonts as any)?.vfs ?? (vfsFonts as any)?.default?.vfs ?? vfsFonts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = vfs

/**
 * Régularisation annuelle des charges : provisions versées (charges mensuelles
 * du bail) vs charges réelles (copropriété, ordures ménagères…) — écart à
 * régulariser et décompte PDF.
 */
export function Regularisation(): React.JSX.Element {
  const { locations } = useStore()
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  const anneeEnCours = new Date().getFullYear()
  const [annee, setAnnee] = useState<number>(anneeEnCours - 1) // on régularise l'année précédente
  const [regs, setRegs] = useState<RegularisationCharges[]>([])
  const [reelles, setReelles] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [pdfEnCours, setPdfEnCours] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void ipc.regularisations
      .list()
      .then(setRegs)
      .catch(() => setRegs([]))
  }, [])

  const chargesReellesDe = (bailId: number): RegularisationCharges | undefined =>
    regs.find((r) => r.bail_id === bailId && r.annee === annee)

  /** Provisions versées = charges mensuelles × 12 (ou prorata selon date de début). */
  const provisionsDe = (bailId: number): number => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return 0
    const chargesMensuelles = row.bail.charges ?? 0
    const debut = row.bail.date_debut_bail
    if (!debut || debut <= `${annee - 1}-12-31`) return chargesMensuelles * 12
    if (debut >= `${annee}-12-31`) return 0
    const d = new Date(debut)
    const moisOccupes = 12 - d.getMonth()
    return Math.round(chargesMensuelles * moisOccupes * 100) / 100
  }

  const enregistrer = async (bailId: number): Promise<void> => {
    const v = parseFloat((reelles[bailId] ?? '').replace(',', '.'))
    if (isNaN(v) || v < 0) return
    setSaving(bailId)
    try {
      await ipc.regularisations.upsert(bailId, annee, v)
      setRegs(await ipc.regularisations.list())
    } finally {
      setSaving(null)
    }
  }

  const decompteData = (bailId: number): TDocumentDefinitions | null => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return null
    const provisions = provisionsDe(bailId)
    const reelles = chargesReellesDe(bailId)?.charges_reelles ?? 0
    const ecart = Math.round((provisions - reelles) * 100) / 100
    return {
      content: [
        { text: 'DÉCOMPTE ANNUEL DE RÉGULARISATION DES CHARGES', style: 'titre' },
        { text: `(article 23 de la loi du 6 juillet 1989)`, style: 'sousTitre', margin: [0, 0, 0, 16] },
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'LOCATAIRE', style: 'etiquette' },
                { text: row.locataire.nom_complet, bold: true }
              ]
            },
            {
              width: '50%',
              stack: [
                { text: 'LOGEMENT', style: 'etiquette' },
                { text: row.bien.designation, bold: true }
              ]
            }
          ],
          margin: [0, 0, 0, 14]
        },
        {
          text: `Pour l'année ${annee}, le décompte des charges locatives récupérables s'établit comme suit :`
        },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'Poste', bold: true }, { text: 'Montant', bold: true, alignment: 'right' }],
              ['Provisions pour charges versées en ' + annee, { text: formatEuro(provisions), alignment: 'right' }],
              ['Charges réelles justifiées pour ' + annee, { text: formatEuro(reelles), alignment: 'right' }],
              [
                ecart >= 0
                  ? 'EXCÉDENT dû au locataire (régularisation en sa faveur)'
                  : 'COMPLÉMENT dû par le locataire (régularisation au bailleur)',
                { text: formatEuro(Math.abs(ecart)), bold: true, alignment: 'right' }
              ]
            ]
          },
          margin: [0, 10, 0, 16]
        },
        {
          text:
            ecart >= 0
              ? 'Le bailleur reversera cet excédent au locataire, ou l’imputera sur les prochaines provisions si le locataire en est d’accord.'
              : 'Le locataire pourra acquitter ce complément en une fois ou en plusieurs fois mensuelles sur l’année à venir.',
          style: 'note'
        },
        {
          columns: [
            {
              width: '50%',
              stack: [{ text: 'Fait à _____________, le _____________', margin: [0, 30, 0, 0] }]
            },
            {
              width: '50%',
              alignment: 'right',
              stack: [
                { text: 'Signature du bailleur', style: 'etiquette', margin: [0, 30, 0, 0] }
              ]
            }
          ]
        }
      ],
      styles: {
        titre: { fontSize: 15, bold: true, alignment: 'center' },
        sousTitre: { fontSize: 9, italics: true, alignment: 'center', color: '#666666' },
        etiquette: { fontSize: 9, color: '#888888', margin: [0, 0, 0, 2] },
        note: { fontSize: 9, italics: true, color: '#666666' }
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 }
    }
  }

  const genererDecompte = async (bailId: number): Promise<void> => {
    const doc = decompteData(bailId)
    if (!doc) return
    setPdfEnCours(bailId)
    setMessage(null)
    try {
      const row = bauxPayants.find((r) => r.bail.id === bailId)!
      const base64 = await new Promise<string>((resolve) => {
        pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
        setTimeout(() => resolve(''), 30000)
      })
      if (!base64) return
      const nom = `regularisation_charges_${row.locataire.nom_complet.replace(/\s+/g, '_')}_${annee}.pdf`
      const chemin = await ipc.quittances.save(base64, nom)
      setMessage(chemin ? `Décompte enregistré : ${chemin}` : 'Enregistrement annulé.')
    } finally {
      setPdfEnCours(null)
    }
  }

  const adressesUniquesParBail = new Map(
    locations.map((r) => {
      const parties = [r.bien.adresse, r.bien.code_postal, r.bien.ville]
        .filter((x, i, tab) => x && x !== r.bien.designation && tab.indexOf(x) === i)
      const valeur = parties.join(', ')
      return [r.bail.id, valeur !== '' && valeur !== r.bien.designation ? valeur : null]
    })
  )

  const stats = useMemo(() => {
    let aReverser = 0
    let aRecuperer = 0
    let nbRegulees = 0
    for (const r of bauxPayants) {
      const reel = chargesReellesDe(r.bail.id)
      if (reel) {
        nbRegulees++
        const ecart = provisionsDe(r.bail.id) - reel.charges_reelles
        if (ecart >= 0) aReverser += ecart
        else aRecuperer += -ecart
      }
    }
    return { aReverser, aRecuperer, nbRegulees }
  }, [bauxPayants, regs, annee])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Régularisation des charges</h1>
        <select
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {[anneeEnCours, anneeEnCours - 1, anneeEnCours - 2].map((a) => (
            <option key={a} value={a}>
              Année {a}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Saisis les <strong>charges réelles</strong> justifiées (copropriété, ordures
        ménagères…) pour chaque bail et chaque année. L'écart avec les provisions versées
        détermine ce que tu dois au locataire — ou ce qu'il te doit.
      </p>

      {/* Totaux */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs text-slate-400">Régularisées</div>
          <div className="text-lg font-bold">{stats.nbRegulees}/{bauxPayants.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="text-xs text-emerald-600 dark:text-emerald-400">À reverser au locataire</div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            {formatEuro(stats.aReverser)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="text-xs text-amber-600 dark:text-amber-400">À récupérer du locataire</div>
          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
            {formatEuro(stats.aRecuperer)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Bien</th>
              <th className="px-4 py-2">Locataire</th>
              <th className="px-4 py-2">Adresse</th>
              <th className="px-4 py-2 text-right">Provisions {annee}</th>
              <th className="px-4 py-2">Charges réelles {annee}</th>
              <th className="px-4 py-2 text-right">Écart</th>
              <th className="px-4 py-2 text-center">Décompte</th>
            </tr>
          </thead>
          <tbody>
            {bauxPayants.map((r) => {
              const provisions = provisionsDe(r.bail.id)
              const reel = chargesReellesDe(r.bail.id)
              const ecart = reel ? Math.round((provisions - reel.charges_reelles) * 100) / 100 : null
              return (
                <tr key={r.bail.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {r.bien.type_bien}
                      </span>
                      {nomBien(r.bien)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-300 dark:text-slate-200">
                    {r.locataire.nom_complet}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {adressesUniquesParBail.get(r.bail.id) ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right">{formatEuro(provisions)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={reelles[r.bail.id] ?? reel?.charges_reelles ?? ''}
                        onChange={(e) => setReelles({ ...reelles, [r.bail.id]: e.target.value })}
                        placeholder="0.00"
                        className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs dark:border-slate-700 dark:bg-slate-900"
                      />
                      {saving === r.bail.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <button
                          onClick={() => void enregistrer(r.bail.id)}
                          disabled={reelles[r.bail.id] === undefined}
                          title="Enregistrer les charges réelles"
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-primary-600 disabled:opacity-30 dark:hover:bg-slate-800"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${ecart === null ? 'text-slate-400' : ecart >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {ecart === null ? 'non saisi' : `${ecart >= 0 ? '−' : '+'}${formatEuro(Math.abs(ecart))}`}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => void genererDecompte(r.bail.id)}
                      disabled={!reel || pdfEnCours === r.bail.id}
                      title={reel ? 'Générer le décompte PDF' : 'Enregistre d’abord les charges réelles'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {pdfEnCours === r.bail.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      PDF
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {message && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
          {message}
        </p>
      )}
    </div>
  )
}
