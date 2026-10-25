import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Download, Loader2, AlertTriangle, Printer, Layers, Mail, Send } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { QuittanceHistorique } from '@shared/types'
import { formatPeriode } from '../lib/format'
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
  const [params] = useSearchParams()
  // Baux éligibles à une quittance : actifs ET payant un loyer.
  // (occupation gratuite = pas de quittance à établir)
  const bauxActifs = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  // Pré-sélection depuis la fiche d'un bail (?bail=ID).
  const bailParam = params.get('bail')
  const [bailId, setBailId] = useState<string>(bailParam ?? '')
  const [periode, setPeriode] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}` // mois précédent par défaut
  })
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [bailleur, setBailleur] = useState<{ nom_complet: string; adresse: string } | null>(null)
  const [lot, setLot] = useState<{ enCours: boolean; fait: number; total: number; erreurs: number }>({
    enCours: false,
    fait: 0,
    total: 0,
    erreurs: 0
  })
  const [historique, setHistorique] = useState<QuittanceHistorique[]>([])
  const [smtpConfigure, setSmtpConfigure] = useState(false)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  useEffect(() => {
    void ipc.email
      .getConfig()
      .then((c) => setSmtpConfigure(c.configure))
      .catch(() => setSmtpConfigure(false))
  }, [])

  const rechargerHistorique = (): Promise<void> =>
    ipc.quittances
      .list()
      .then(setHistorique)
      .catch(() => setHistorique([]))

  useEffect(() => {
    void rechargerHistorique()
  }, [])

  // Chargement du profil bailleur (Paramètres) pour pré-remplir la quittance.
  useEffect(() => {
    void ipc.parametres
      .getBailleur()
      .then(setBailleur)
      .catch(() => setBailleur(null))
  }, [])

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
        bailleur: bailleur?.nom_complet || '________________',
        adresseBailleur: bailleur?.adresse || '________________',
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
        const chemin = await ipc.quittances.save(base64, nomFichier, Number(bailId), periode)
        setMessage(chemin ? `Quittance enregistrée : ${chemin}` : 'Enregistrement annulé.')
        void rechargerHistorique()
        setEnCours(false)
      })
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setEnCours(false)
    }
  }

  /** Génère la quittance et l'envoie par email au locataire (SMTP configuré). */
  const envoyerAuLocataire = async (): Promise<void> => {
    if (!row) return
    if (!row.locataire.email) {
      setMessage('Ce locataire n’a pas d’adresse email — complète sa fiche (Biens & Locataires → Modifier).')
      return
    }
    setEnvoiEnCours(true)
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
        bailleur: bailleur?.nom_complet || '________________',
        adresseBailleur: bailleur?.adresse || '________________',
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
      const nomFichier = `quittance_${row.locataire.nom_complet.replace(/\s+/g, '_')}_${periode}.pdf`
      const base64 = await new Promise<string>((resolve) => {
        pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
        setTimeout(() => resolve(''), 30000)
      })
      if (!base64) throw new Error('Génération PDF trop longue')
      await ipc.email.send(
        row.locataire.email,
        `Votre quittance de loyer — ${libellePeriode}`,
        `Bonjour ${row.locataire.nom_complet},

Veuillez trouver ci-joint votre quittance de loyer pour ${libellePeriode}.

Cordialement,
${bailleur?.nom_complet ?? ''}`,
        { nomFichier, base64 }
      )
      await ipc.quittances.save(base64, nomFichier, Number(bailId), periode)
      void rechargerHistorique()
      setMessage(`Quittance envoyée à ${row.locataire.email}.`)
    } catch (err) {
      setMessage(`Erreur d'envoi : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnvoiEnCours(false)
    }
  }

  /** Ouvre le dialogue d'impression du système avec la quittance. */
  const imprimer = async (): Promise<void> => {
    if (!row) return
    setEnCours(true)
    try {
      const loyerHc = row.bail.loyer_hc ?? 0
      const charges = row.bail.charges ?? 0

      const [annee, mois] = periode.split('-')
      const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
        'fr-FR',
        { month: 'long', year: 'numeric' }
      )

      const doc = construireQuittance({
        bailleur: bailleur?.nom_complet || '________________',
        adresseBailleur: bailleur?.adresse || '________________',
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

      // pdfmake ouvre un iframe avec le PDF et déclenche l'impression système.
      pdfMake.createPdf(doc).print()
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnCours(false)
    }
  }

  /** Génère les quittances de TOUS les baux payants pour le mois choisi. */
  const genererTout = async (): Promise<void> => {
    if (bauxActifs.length === 0) return
    const dossier = await ipc.quittances.chooseFolder()
    if (!dossier) return

    setLot({ enCours: true, fait: 0, total: bauxActifs.length, erreurs: 0 })
    setMessage(null)

    const [annee, mois] = periode.split('-')
    const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
      'fr-FR',
      { month: 'long', year: 'numeric' }
    )
    const suffixe = `${annee}-${mois}`

    let erreurs = 0
    for (let i = 0; i < bauxActifs.length; i++) {
      const r = bauxActifs[i]
      try {
        const doc = construireQuittance({
          bailleur: bailleur?.nom_complet || '________________',
          adresseBailleur: bailleur?.adresse || '________________',
          locataire: r.locataire.nom_complet,
          bienDesignation: r.bien.designation,
          bienAdresse: [r.bien.adresse, r.bien.code_postal, r.bien.ville]
            .filter(Boolean)
            .join(', '),
          periode: libellePeriode,
          dateDebutBail: r.bail.date_debut_bail,
          loyerHc: r.bail.loyer_hc ?? 0,
          charges: r.bail.charges ?? 0
        })
        const base64 = await new Promise<string>((resolve, reject) => {
          pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
          setTimeout(() => reject(new Error('Génération PDF trop longue')), 30000)
        })
        const nom = `quittance_${r.locataire.nom_complet.replace(/\s+/g, '_')}_${suffixe}.pdf`
        await ipc.quittances.saveTo(base64, dossier, nom, r.bail.id, periode)
      } catch {
        erreurs++
      }
      setLot({ enCours: true, fait: i + 1, total: bauxActifs.length, erreurs })
    }

    setLot({ enCours: false, fait: bauxActifs.length, total: bauxActifs.length, erreurs })
    void rechargerHistorique()
    setMessage(
      erreurs === 0
        ? `${bauxActifs.length} quittances générées dans : ${dossier}`
        : `${bauxActifs.length - erreurs}/${bauxActifs.length} quittances générées (${erreurs} erreur(s)) — dossier : ${dossier}`
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Quittances de loyer</h1>

      {/* Génération en lot */}
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Toutes les quittances du mois</h2>
            <p className="text-xs text-slate-400">
              {bauxActifs.length} bail(s) payant(s) — un PDF par locataire dans un dossier au
              choix
            </p>
          </div>
          <button
            onClick={() => void genererTout()}
            disabled={bauxActifs.length === 0 || lot.enCours}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {lot.enCours ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {lot.fait}/{lot.total}
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" /> Générer tout
              </>
            )}
          </button>
        </div>
      </div>

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

        {!bailleur && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Le profil bailleur n'est pas renseigné : les champs correspondants
            resteront vides dans le PDF. Complétez-le dans Paramètres.
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => void generer()}
            disabled={!row || enCours}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Exporter en PDF <Download className="h-3.5 w-3.5" />
              </>
            )}
          </button>
          <button
            onClick={() => void imprimer()}
            disabled={!row || enCours}
            title="Ouvrir le dialogue d'impression"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>

        {/* Envoi par email */}
        {!smtpConfigure ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-400 dark:border-slate-700">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Pour envoyer les quittances par email, configure ton serveur SMTP dans{' '}
              <button
                onClick={() => (window.location.hash = '#/parametres')}
                className="font-medium text-primary-600 underline dark:text-primary-500"
              >
                Paramètres → Email
              </button>
              . Ça prend 2 minutes et reste sur ton PC.
            </span>
          </p>
        ) : (
          <button
            onClick={() => void envoyerAuLocataire()}
            disabled={!row || envoiEnCours}
            title="Générer et envoyer la quittance au locataire par email"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {envoiEnCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Envoyer par email au locataire
              </>
            )}
          </button>
        )}

        {message && (
          <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            {message}
          </p>
        )}
      </div>

      {/* Historique des quittances générées */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Historique des quittances générées ({historique.length})
        </h2>
        {historique.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aucune quittance générée pour l'instant.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2">Générée le</th>
                  <th className="px-4 py-2">Période</th>
                  <th className="px-4 py-2">Fichier</th>
                </tr>
              </thead>
              <tbody>
                {historique.slice(0, 20).map((q) => {
                  const row = locations.find((r) => r.bail.id === q.bail_id)
                  return (
                    <tr key={q.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-2">{q.genere_le.slice(0, 10)}</td>
                      <td className="px-4 py-2">
                        {formatPeriode(q.periode)}
                        <span className="ml-2 text-xs text-slate-400">
                          {row ? `— ${row.locataire.nom_complet} (${row.bien.designation})` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{q.nom_fichier}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
