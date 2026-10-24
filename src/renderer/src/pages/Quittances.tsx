import { useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate } from '../lib/format'

// Branchement des polices embarquées (forme du module variable selon la version).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vfs = (vfsFonts as any)?.pdfMake?.vfs ?? (vfsFonts as any)?.default?.pdfMake?.vfs ?? (vfsFonts as any)?.vfs ?? (vfsFonts as any)?.default?.vfs ?? vfsFonts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = vfs

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

/** Construit la définition de la quittance (pdfmake). */
function construireQuittance(params: {
  bailleur: string
  adresseBailleur: string
  locataire: string
  bienDesignation: string
  bienAdresse: string
  periode: string
  dateDebutBail: string | null
  loyerHc: number
  charges: number
}): TDocumentDefinitions {
  const totalCc = params.loyerHc + params.charges
  const aujourdhui = new Date().toLocaleDateString('fr-FR')

  return {
    content: [
      { text: 'QUITTANCE DE LOYER', style: 'titre' },
      { text: `(article 21 de la loi du 6 juillet 1989)`, style: 'sousTitre', margin: [0, 0, 0, 20] },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'BAILLEUR', style: 'etiquette' },
              { text: params.bailleur, bold: true },
              { text: params.adresseBailleur }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'LOCATAIRE', style: 'etiquette' },
              { text: params.locataire, bold: true },
              { text: params.bienAdresse }
            ]
          }
        ],
        margin: [0, 0, 0, 20]
      },

      {
        text: `Je soussigné(e) ${params.bailleur}, bailleur du logement désigné ci-dessus, donne quittance à ${params.locataire} :`
      },
      {
        text: `du paiement du loyer et des charges du logement pour la période de ${params.periode}.`,
        margin: [0, 4, 0, 20]
      },

      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [{ text: 'Désignation', bold: true }, { text: 'Montant', bold: true, alignment: 'right' }],
            ['Loyer hors charges', { text: formatEuro(params.loyerHc), alignment: 'right' }],
            ['Charges / provision pour charges', { text: formatEuro(params.charges), alignment: 'right' }],
            [
              { text: 'TOTAL LOYER CHARGES COMPRISES', bold: true },
              { text: formatEuro(totalCc), bold: true, alignment: 'right' }
            ]
          ]
        },
        margin: [0, 0, 0, 20]
      },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'En règlement de :', style: 'etiquette' },
              { text: 'Loyer et charges du logement' },
              { text: `Période : ${params.periode}` },
              { text: `Début du bail : ${formatDate(params.dateDebutBail)}` }
            ]
          },
          {
            width: '50%',
            alignment: 'right',
            stack: [
              { text: `Fait à _____________, le ${aujourdhui}`, margin: [0, 0, 0, 40] },
              { text: 'Signature du bailleur', style: 'etiquette' }
            ]
          }
        ]
      },

      {
        text: 'Cette quittance ne décharge pas le locataire du paiement des arriérés éventuels. Elle est délivrée gratuitement.',
        style: 'pied',
        margin: [0, 40, 0, 0]
      }
    ],
    styles: {
      titre: { fontSize: 18, bold: true, alignment: 'center' },
      sousTitre: { fontSize: 9, italics: true, alignment: 'center', color: '#666666' },
      etiquette: { fontSize: 9, color: '#888888', margin: [0, 0, 0, 2] },
      pied: { fontSize: 8, italics: true, color: '#999999' }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 }
  }
}

export function Quittances(): React.JSX.Element {
  const { locations } = useStore()
  const bauxActifs = locations.filter((r) => r.bail.actif)

  const [bailId, setBailId] = useState<string>('')
  const [periode, setPeriode] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}` // mois précédent par défaut
  })
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const row = locations.find((r) => r.bail.id === Number(bailId))

  const generer = async (): Promise<void> => {
    if (!row) return
    setEnCours(true)
    setMessage(null)
    try {
      const loyerHc = row.bail.loyer_hc ?? 0
      const charges = row.bail.charges ?? 0

      const [annee, mois] = periode.split('-')
      const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
        'fr-FR',
        { month: 'long', year: 'numeric' }
      )

      const doc = construireQuittance({
        bailleur: '________________', // TODO : profil bailleur dans Paramètres
        adresseBailleur: '________________',
        locataire: row.locataire.nom_complet,
        bienDesignation: row.bien.designation,
        bienAdresse: [row.bien.adresse, row.bien.code_postal, row.bien.ville]
          .filter(Boolean)
          .join(', '),
        periode: libellePeriode,
        dateDebutBail: row.bail.date_debut_bail,
        loyerHc,
        charges
      })

      pdfMake.createPdf(doc).getBase64(async (base64: string) => {
        const nomFichier = `quittance_${row.locataire.nom_complet.replace(/\s+/g, '_')}_${periode}.pdf`
        const chemin = await ipc.quittances.save(base64, nomFichier)
        setMessage(chemin ? `Quittance enregistrée : ${chemin}` : 'Enregistrement annulé.')
        setEnCours(false)
      })
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setEnCours(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Quittances de loyer</h1>

      <div className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Bail
          </span>
          <select
            value={bailId}
            onChange={(e) => setBailId(e.target.value)}
            className={inputCls}
          >
            <option value="">— Sélectionner un bail —</option>
            {bauxActifs.map((r) => (
              <option key={r.bail.id} value={r.bail.id}>
                {r.bien.designation} — {r.locataire.nom_complet}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Mois de la quittance
          </span>
          <input
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className={inputCls}
          />
        </label>

        {row && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-slate-400">Loyer HC</div>
                <div className="font-semibold">{formatEuro(row.bail.loyer_hc)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Charges</div>
                <div className="font-semibold">{formatEuro(row.bail.charges)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Total CC</div>
                <div className="font-semibold text-primary-600 dark:text-primary-500">
                  {formatEuro(row.bail.loyer_cc ?? (row.bail.loyer_hc ?? 0) + (row.bail.charges ?? 0))}
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => void generer()}
          disabled={!row || enCours}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enCours ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Générer la quittance PDF <Download className="h-3.5 w-3.5" />
            </>
          )}
        </button>

        {message && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
