import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, Download, Loader2, AlertTriangle, Printer, Layers, Mail, Send } from 'lucide-react'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { QuittanceHistorique, Paiement } from '@shared/types'
import { formatPeriode } from '../lib/format'
import { referenceQuittance } from '@shared/quittance-ref'
import { libelleBien, nomBien, triParLibelle } from '@shared/labels'
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
  bailleurVille: string
  locataire: string
  locataireAdresse: string
  bienNom: string
  bienAdresse: string
  periode: string
  reference: string
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
              { text: params.adresseBailleur },
              { text: params.bailleurVille }
            ]
          },
          {
            width: '50%',
            stack: [
              { text: 'LOCATAIRE', style: 'etiquette' },
              { text: params.locataire, bold: true },
              { text: params.locataireAdresse }
            ]
          }
        ],
        margin: [0, 0, 0, 20]
      },

      {
        text: `Le bailleur du bien désigné ci-dessus donne quittance à ${params.locataire} :`
      },
      {
        text: `du paiement du loyer et des charges du bien pour la période de ${params.periode}.`,
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
              { text: 'Loyer et charges du bien' },
              { text: `Bien : ${params.bienNom}` },
              { text: params.bienAdresse },
              { text: `Période : ${params.periode}` },
              { text: `Début du bail : ${formatDate(params.dateDebutBail)}` }
            ]
          },
          {
            width: '50%',
            alignment: 'right',
            stack: [
              { text: `Fait à ${params.bailleurVille || '_____________'}, le ${aujourdhui}` }
            ]
          }
        ]
      },

      {
        text: 'Cette quittance de loyer n’est pas une preuve de paiement. Elle est délivrée gratuitement.',
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

  // Pré-sélection depuis la fiche d'un bail (?bail=ID).
  const bailParam = params.get('bail')
  const [bailId, setBailId] = useState<string>(bailParam ?? '')
  const [periode, setPeriode] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}` // mois précédent par défaut
  })
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [bailleur, setBailleur] = useState<{
    nom_complet: string
    adresse: string
    code_postal?: string
    ville?: string
  } | null>(null)
  const [lot, setLot] = useState<{ enCours: boolean; fait: number; total: number; erreurs: number }>({
    enCours: false,
    fait: 0,
    total: 0,
    erreurs: 0
  })
  const [historique, setHistorique] = useState<QuittanceHistorique[]>([])
  const [smtpConfigure, setSmtpConfigure] = useState(false)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [paiementsList, setPaiementsList] = useState<Paiement[]>([])

  useEffect(() => {
    void ipc.paiements
      .listAll()
      .then(setPaiementsList)
      .catch(() => setPaiementsList([]))
  }, [locations])

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

  // Baux éligibles à une quittance : actifs, payant un loyer, ET dont le loyer
  // de la période choisie est POINTÉ « payé ». Une quittance atteste un
  // paiement intégral (art. 21, loi 1989) — jamais générée à l'aveugle.
  // (occupation gratuite = pas de quittance à établir)
  // Tous les baux actifs payants (dropdown individuel)
  const bauxEligibles = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)
  // Ceux dont le loyer de la période est pointé « payé » (génération en lot)
  const bauxPayes = bauxEligibles.filter((r) => {
    const p = paiementsList.find((x) => x.bail_id === r.bail.id && x.periode === periode)
    return p?.statut === 'paye'
  })
  const nbEnAttente = bauxEligibles.length - bauxPayes.length
  /** Le bail sélectionné est-il pointé « payé » pour la période ? */
  const estPaye = (bailId: number): boolean =>
    bauxPayes.some((r) => r.bail.id === bailId)
  /**
   * Garde-fou art. 21 : une quittance atteste un paiement intégral.
   * Si le loyer n'est pas pointé « payé », on prévient et on demande confirmation.
   */
  const confirmerSiNonPaye = (r: (typeof bauxEligibles)[number]): boolean => {
    if (estPaye(r.bail.id)) return true
    return confirm(
      `Le loyer de ${r.locataire.nom_complet} pour ${periode} n'est pas pointé « payé ».\n\n` +
        'Une quittance atteste un paiement intégral (art. 21 de la loi de 1989) — pour un paiement partiel, délivrez un reçu.\n\n' +
        'Générer quand même ?'
    )
  }

  const row = locations.find((r) => r.bail.id === Number(bailId))

  /** Construit la quittance d'un bail (profil bailleur, adresses, nom du bien). */
  const construirePour = (r: (typeof locations)[number]): TDocumentDefinitions => {
    const [a, m] = periode.split('-')
    const libellePeriode = new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric'
    })
    return construireQuittance({
      reference: referenceQuittance(r.bail.id, periode),
      bailleur: bailleur?.nom_complet || '________________',
      adresseBailleur: bailleur?.adresse || '________________',
      bailleurVille: bailleur?.ville ?? '',
      locataire: r.locataire.nom_complet,
      locataireAdresse: [r.locataire.adresse, r.locataire.code_postal, r.locataire.ville]
        .filter(Boolean)
        .join(', '),
      bienNom: nomBien(r.bien),
      bienAdresse: [r.bien.adresse, r.bien.code_postal, r.bien.ville]
        .filter(Boolean)
        .join(', '),
      periode: libellePeriode,
      dateDebutBail: r.bail.date_debut_bail,
      loyerHc: r.bail.loyer_hc ?? 0,
      charges: r.bail.charges ?? 0
    })
  }

  /** Nom de fichier sûr : sans accents, virgules ou espaces exotiques. */
  const slug = (nom: string): string =>
    nom
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

  /** Génère le PDF de la quittance du bail sélectionné (export fichier). */
  const generer = async (): Promise<void> => {
    if (!row || !confirmerSiNonPaye(row)) return
    setEnCours(true)
    setMessage(null)
    try {
      const doc = construirePour(row)
      const [annee, mois] = periode.split('-')
      const nomFichier = `quittance_${slug(row.locataire.nom_complet)}_${annee}-${mois}.pdf`
      pdfMake.createPdf(doc).getBase64(async (base64: string) => {
        const chemin = await ipc.quittances.save(
          base64,
          nomFichier,
          Number(bailId),
          periode,
          referenceQuittance(Number(bailId), periode)
        )
        setMessage(chemin ? `Quittance enregistrée : ${chemin}` : 'Enregistrement annulé.')
        void rechargerHistorique()
        setEnCours(false)
      })
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
      setEnCours(false)
    }
  }

  /** Envoie la quittance du bail sélectionné par email à son locataire. */
  const envoyerAuLocataire = async (): Promise<void> => {
    if (!row || !confirmerSiNonPaye(row)) return
    if (!row.locataire.email) {
      setMessage(
        'Ce locataire n’a pas d’adresse email — complète sa fiche (Biens & Locataires → Modifier).'
      )
      return
    }
    setEnvoiEnCours(true)
    setMessage(null)
    try {
      const [annee, mois] = periode.split('-')
      const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
        'fr-FR',
        { month: 'long', year: 'numeric' }
      )
      const doc = construirePour(row)
      const nomFichier = `quittance_${slug(row.locataire.nom_complet)}_${periode}.pdf`
      const base64 = await new Promise<string>((resolve, reject) => {
        pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
        setTimeout(() => reject(new Error('Génération PDF trop longue')), 30000)
      })
      await ipc.email.send(
        row.locataire.email,
        `Votre quittance de loyer n° ${referenceQuittance(row.bail.id, periode)}`,
        `Bonjour ${row.locataire.nom_complet},\n\nVeuillez trouver ci-joint votre quittance de loyer pour ${libellePeriode}.\n\nCordialement,\n${bailleur?.nom_complet ?? ''}`,
        { nomFichier, base64 }
      )
      await ipc.quittances.save(
        base64,
        nomFichier,
        Number(bailId),
        periode,
        referenceQuittance(Number(bailId), periode)
      )
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
    if (!row || !confirmerSiNonPaye(row)) return
    setEnCours(true)
    try {
      const doc = construirePour(row)
      pdfMake.createPdf(doc).print()
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnCours(false)
    }
  }

  /**
   * Génération en lot : PDF de chaque bail pointé « payé », dans un dossier.
   */
  const genererTout = async (): Promise<void> => {
    if (bauxPayes.length === 0) {
      setMessage(
        `Aucun loyer pointé « payé » pour ${periode} — pointe d'abord les loyers dans Paiements.`
      )
      return
    }
    const dossier = await ipc.quittances.chooseFolder()
    if (!dossier) return

    setLot({ enCours: true, fait: 0, total: bauxPayes.length, erreurs: 0 })
    setMessage(null)

    const [annee, mois] = periode.split('-')
    const suffixe = `${annee}-${mois}`

    let erreurs = 0
    for (let i = 0; i < bauxPayes.length; i++) {
      const r = bauxPayes[i]
      try {
        const doc = construirePour(r)
        const base64 = await new Promise<string>((resolve, reject) => {
          pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
          setTimeout(() => reject(new Error('Génération PDF trop longue')), 30000)
        })
        const nom = `quittance_${slug(r.locataire.nom_complet)}_${suffixe}.pdf`
        await ipc.quittances.saveTo(
          base64,
          dossier,
          nom,
          r.bail.id,
          periode,
          referenceQuittance(r.bail.id, periode)
        )
      } catch {
        erreurs++
      }
      setLot({ enCours: true, fait: i + 1, total: bauxPayes.length, erreurs })
    }

    setLot({ enCours: false, fait: bauxPayes.length, total: bauxPayes.length, erreurs })
    void rechargerHistorique()
    setMessage(
      erreurs === 0
        ? `${bauxPayes.length} quittances générées dans : ${dossier}`
        : `${bauxPayes.length - erreurs}/${bauxPayes.length} quittances générées (${erreurs} erreur(s)) — dossier : ${dossier}`
    )
  }

  /**
   * Envoi en groupe : quittance de chaque bail pointé « payé », envoyée par
   * email. Les baux sans adresse email sont listés (non bloquants).
   */
  const envoyerTout = async (): Promise<void> => {
    if (bauxPayes.length === 0) {
      setMessage(
        `Aucun loyer pointé « payé » pour ${periode} — pointe d'abord les loyers dans Paiements.`
      )
      return
    }
    const avecEmail = bauxPayes.filter((r) => r.locataire.email)
    const sansEmail = bauxPayes.filter((r) => !r.locataire.email)
    if (avecEmail.length === 0) {
      setMessage(
        `Aucun des ${bauxPayes.length} locataire(s) concerné(s) n'a d'adresse email renseignée — complète les fiches (Biens & Locataires).`
      )
      return
    }
    if (
      !confirm(
        `Envoyer ${avecEmail.length} quittance(s) par email pour ${periode} ?` +
          (sansEmail.length > 0
            ? `\n\n⚠ ${sansEmail.length} locataire(s) sans email seront ignorés : ${sansEmail
                .map((r) => r.locataire.nom_complet)
                .join(', ')}`
            : '')
      )
    ) {
      return
    }

    setLot({ enCours: true, fait: 0, total: avecEmail.length, erreurs: 0 })
    setMessage(null)

    const [annee, mois] = periode.split('-')
    const libellePeriode = new Date(Number(annee), Number(mois) - 1, 1).toLocaleDateString(
      'fr-FR',
      { month: 'long', year: 'numeric' }
    )
    const suffixe = `${annee}-${mois}`

    let erreurs = 0
    for (let i = 0; i < avecEmail.length; i++) {
      const r = avecEmail[i]
      try {
        const doc = construirePour(r)
        const base64 = await new Promise<string>((resolve, reject) => {
          pdfMake.createPdf(doc).getBase64((b64: string) => resolve(b64))
          setTimeout(() => reject(new Error('Génération PDF trop longue')), 30000)
        })
        const nomFichier = `quittance_${slug(r.locataire.nom_complet)}_${suffixe}.pdf`
        await ipc.email.send(
          r.locataire.email as string,
          `Votre quittance de loyer n° ${referenceQuittance(r.bail.id, periode)}`,
          `Bonjour ${r.locataire.nom_complet},\n\nVeuillez trouver ci-joint votre quittance de loyer pour ${libellePeriode}.\n\nCordialement,\n${bailleur?.nom_complet ?? ''}`,
          { nomFichier, base64 }
        )
        await ipc.quittances.save(
          base64,
          nomFichier,
          r.bail.id,
          periode,
          referenceQuittance(r.bail.id, periode)
        )
      } catch {
        erreurs++
      }
      setLot({ enCours: true, fait: i + 1, total: avecEmail.length, erreurs })
    }

    setLot({ enCours: false, fait: avecEmail.length, total: avecEmail.length, erreurs })
    void rechargerHistorique()
    const sansEmailNote =
      sansEmail.length > 0
        ? ` — non envoyé(s), sans email : ${sansEmail
            .map((r) => r.locataire.nom_complet)
            .join(', ')}`
        : ''
    setMessage(
      erreurs === 0
        ? `${avecEmail.length} quittance(s) envoyée(s) par email${sansEmailNote}`
        : `${avecEmail.length - erreurs}/${avecEmail.length} envoyée(s) (${erreurs} échec(s))${sansEmailNote}`
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Quittances de loyer</h1>

      {/* Génération / envoi en lot */}
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Toutes les quittances du mois</h2>
            <p className="text-xs text-slate-400">
              {bauxPayes.length} quittance(s) prête(s) pour {periode} (loyers pointés « payé ») —{' '}
              {nbEnAttente} bail(s) en attente de pointage
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void genererTout()}
              disabled={bauxPayes.length === 0 || lot.enCours}
              title="Générer les PDF dans un dossier au choix"
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
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
            {smtpConfigure && (
              <button
                onClick={() => void envoyerTout()}
                disabled={bauxPayes.length === 0 || lot.enCours}
                title="Générer et envoyer chaque quittance par email au locataire"
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {lot.enCours ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {lot.fait}/{lot.total}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Envoyer tout
                  </>
                )}
              </button>
            )}
          </div>
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
            {triParLibelle(bauxEligibles, (r) => r.locataire.nom_complet).map((r) => (
              <option key={r.bail.id} value={r.bail.id}>
                {libelleBien({
                  type_bien: r.bien.type_bien,
                  designation: r.bien.designation,
                  locataire: r.locataire.nom_complet
                })}
                {estPaye(r.bail.id) ? ' — ✓ payé' : ' — loyer non pointé'}
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

        {!bailleur && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Le profil bailleur n'est pas renseigné : les champs correspondants
            resteront vides dans le PDF. Complétez-le dans Paramètres.
          </p>
        )}

        {row && !row.bien.adresse && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              L'adresse du bien n'est pas renseignée : la quittance doit identifier
              le bien loué. Complète-la dans la fiche du bien (Biens &amp; Locataires →
              modifier).
            </span>
          </p>
        )}

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
                  {formatEuro(
                    row.bail.loyer_cc ?? (row.bail.loyer_hc ?? 0) + (row.bail.charges ?? 0)
                  )}
                </div>
              </div>
            </div>
          </div>
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
            aria-label="Imprimer la quittance"
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
                  <th className="px-4 py-2">Référence</th>
                  <th className="px-4 py-2">Période</th>
                  <th className="px-4 py-2">Fichier</th>
                </tr>
              </thead>
              <tbody>
                {historique.slice(0, 20).map((q) => {
                  const rowQ = locations.find((r) => r.bail.id === q.bail_id)
                  return (
                    <tr key={q.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-2">{q.genere_le.slice(0, 10)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{q.reference_number ?? '—'}</td>
                      <td className="px-4 py-2">
                        {formatPeriode(q.periode)}
                        <span className="ml-2 text-xs text-slate-400">
                          {rowQ
                            ? `— ${rowQ.locataire.nom_complet} (${nomBien(rowQ.bien)})`
                            : ''}
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
