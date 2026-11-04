import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X, Clock, Loader2, Coins, Repeat, Mail, Copy, FileText } from 'lucide-react'
import type { StatutPaiement, Paiement, BienLocationRow } from '@shared/types'
import { montantAttendu, detailProrata, echeanceIso, joursDeRetard } from '@shared/echeancier'
import {
  parseReleve,
  proposerPointages,
  periodePrecedente,
  cleRegle,
  type PropositionPointage,
  type ReglesRapprochement
} from '@shared/rapprochement'
import { templateRelance, libelleNiveau, type NiveauRelance } from '@shared/relances'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatPeriode, formatDate } from '../lib/format'
import { nomBien } from '@shared/labels'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'

const MODES = ['Virement', 'Chèque', 'Espèces', 'Prélèvement', 'Autre'] as const

/* eslint-disable @typescript-eslint/no-explicit-any -- branchement tolérant
   aux formes de module de pdfmake/vfs_fonts (varie selon les versions) */
const vfs =
  (vfsFonts as any)?.pdfMake?.vfs ??
  (vfsFonts as any)?.default?.pdfMake?.vfs ??
  (vfsFonts as any)?.vfs ??
  (vfsFonts as any)?.default?.vfs ??
  vfsFonts
;(pdfMake as any).vfs = vfs
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Lettre PDF de relance (A4, mise en forme courrier) — même texte que
 * l'email, présenté en lettre : recommandé conseillé pour une mise en demeure.
 */
function construireLettreRelance(
  modele: { objet: string; corps: string },
  bailleur: string,
  adresseBailleur: string,
  locataire: string,
  adresseLocataire: string
): TDocumentDefinitions {
  // (annotation Content sur le map : sans elle, l'objet élargi en
  // `{ margin: number[] }` casse l'inférence contextuelle du tableau)
  const contenu: Content[] = [
    {
      columns: [
        { width: '50%', stack: [{ text: bailleur, bold: true }, { text: adresseBailleur }] },
        {
          width: '50%',
          alignment: 'right',
          stack: [{ text: locataire, bold: true }, { text: adresseLocataire }]
        }
      ]
    },
    {
      text: `Fait le ${new Date().toLocaleDateString('fr-FR')}`,
      alignment: 'right',
      margin: [0, 20, 0, 20]
    },
    { text: `Objet : ${modele.objet}`, bold: true, margin: [0, 0, 0, 16] },
    ...modele.corps
      .split('\n\n')
      .map((paragraphe): Content => ({ text: paragraphe, margin: [0, 0, 0, 10] })),
    { text: bailleur, alignment: 'right', margin: [0, 24, 0, 0] },
    { text: '(signature)', alignment: 'right', style: 'etiquette' }
  ]
  return {
    content: contenu,
    styles: {
      etiquette: { fontSize: 9, color: '#888888' }
    },
    defaultStyle: { font: 'Roboto', fontSize: 10 }
  }
}

/**
 * Vue matrice Mois × Biens : pointage en masse des loyers du mois choisi,
 * un clic par bail — remplace le pointage bail par bail.
 * Le backend (upsert par bail+periode) existe déjà.
 */
export function Paiements(): React.JSX.Element {
  const { locations, refresh } = useStore()
  const navigate = useNavigate()
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  const [periode, setPeriode] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [saving, setSaving] = useState<number | null>(null)
  const [modes, setModes] = useState<Record<number, string>>({})
  // Modal de saisie du montant partiel (window.prompt n'existe pas dans Electron)
  const [partielModal, setPartielModal] = useState<{
    row: BienLocationRow
    attendu: number
  } | null>(null)
  const [montantSaisi, setMontantSaisi] = useState('')

  // --- Rapprochement bancaire (import relevé CSV, matching, validation) ---
  const [rapproOuvert, setRapproOuvert] = useState(false)
  const [propositions, setPropositions] = useState<PropositionPointage[]>([])
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [rapproMsg, setRapproMsg] = useState<string | null>(null)
  const [rapproEnCours, setRapproEnCours] = useState(false)
  // Règles mémorisées (v2) : libellé déjà pointé → bail, reconnu les mois
  // suivants. Stockées dans parametres (clé 'rapprochement'), 100 % local.
  const [regles, setRegles] = useState<ReglesRapprochement>({})

  // --- Relances d'impayés (email prérempli, 3 niveaux, décision du bailleur) ---
  const [relanceModal, setRelanceModal] = useState<{ row: BienLocationRow } | null>(null)
  const [niveauRelance, setNiveauRelance] = useState<NiveauRelance>(1)
  const [relanceEnCours, setRelanceEnCours] = useState(false)
  const [smtpOk, setSmtpOk] = useState(false)
  const [bailleurProfil, setBailleurProfil] = useState<{
    nom_complet: string
    adresse: string
    code_postal?: string
    ville?: string
  } | null>(null)

  const recharger = (): Promise<void> =>
    ipc.paiements
      .listAll()
      .then(setPaiements)
      .catch(() => setPaiements([]))

  useEffect(() => {
    void recharger()
    void ipc.parametres
      .get<{ regles?: ReglesRapprochement }>('rapprochement')
      .then((cfg) => setRegles(cfg?.regles ?? {}))
      .catch(() => setRegles({}))
    void ipc.email
      .getConfig()
      .then((c) => setSmtpOk(c.configure))
      .catch(() => setSmtpOk(false))
    void ipc.parametres
      .getBailleur()
      .then(setBailleurProfil)
      .catch(() => setBailleurProfil(null))
  }, [])

  const statutDe = (bailId: number): Paiement | undefined =>
    paiements.find((p) => p.bail_id === bailId && p.periode === periode)

  // Montant attendu pour la période : loyer CC plein, ou PRORATA du premier
  // mois (entrée dans les lieux en cours de mois) — cf. shared/echeancier.ts.
  const attenduDe = (r: BienLocationRow): number => montantAttendu(r.bail, periode) ?? 0

  // --- Totaux du mois sélectionné ---
  // (helpers inlinés : attenduDe/statutDe sont recréés à chaque rendu, les
  // mettre en dépendance du useMemo le ruinerait — cf. exhaustive-deps)
  const totaux = useMemo(() => {
    const attendu = bauxPayants.reduce((s, r) => s + (montantAttendu(r.bail, periode) ?? 0), 0)
    let encaisse = 0
    let nbPayes = 0
    let nbRetards = 0
    for (const r of bauxPayants) {
      const p = paiements.find((x) => x.bail_id === r.bail.id && x.periode === periode)
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
      // Par défaut on pointe le montant attendu (prorata compris au 1er mois).
      const loyerCc = montantForce ?? attenduDe(row)
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

  /** Ouvre le modal de saisie du montant partiel. */
  const ouvrirPartiel = (bailId: number): void => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return
    const attendu = attenduDe(row)
    setMontantSaisi('')
    setPartielModal({ row, attendu })
  }

  /** Enregistre le paiement partiel + propose le reçu PDF. */
  const validerPartiel = async (): Promise<void> => {
    if (!partielModal) return
    const { row, attendu } = partielModal
    const montant = parseFloat(montantSaisi.replace(',', '.'))
    if (isNaN(montant) || montant <= 0) {
      window.alert('Montant invalide.')
      return
    }
    const montantArrondi = Math.round(montant * 100) / 100
    setPartielModal(null)
    await pointer(row.bail.id, montantArrondi >= attendu ? 'paye' : 'partiel', montantArrondi)

    // Paiement partiel : proposer le reçu (la quittance atteste un paiement
    // intégral — art. 21, loi de 1989).
    if (montantArrondi < attendu) {
      if (!window.confirm('Paiement partiel enregistré. Générer un REÇU de paiement (PDF) ?'))
        return
      try {
        const bailleur = await ipc.parametres.getBailleur()
        const doc = (await ipc.recu.pdf({
          row,
          bailleur: bailleur
            ? {
                nom_complet: bailleur.nom_complet || '________________',
                adresse: bailleur.adresse || '________________',
                code_postal: bailleur.code_postal,
                ville: bailleur.ville
              }
            : null,
          periode,
          montantRecu: montantArrondi,
          modePaiement: modes[row.bail.id] ?? 'Virement'
        })) as unknown as TDocumentDefinitions
        pdfMake.createPdf(doc).getBase64(async (base64: string) => {
          const nom = `recu_${slug(row.locataire.nom_complet)}_${periode}.pdf`
          const chemin = await ipc.quittances.save(base64, nom)
          if (chemin) window.alert(`Reçu enregistré : ${chemin}`)
        })
      } catch (err) {
        window.alert(
          `Erreur de génération du reçu : ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  const toutMarquerPaye = async (): Promise<void> => {
    const nonPayes = bauxPayants.filter((r) => statutDe(r.bail.id)?.statut !== 'paye')
    if (nonPayes.length === 0) return
    if (
      !confirm(`Marquer les loyers de ${nonPayes.length} bail(s) comme PAYÉS pour ${periode} ?`)
    ) {
      return
    }
    for (const r of nonPayes) {
      setSaving(r.bail.id)
      const loyerCc = attenduDe(r)
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

  // ==========================================================================
  // Rapprochement bancaire : le fichier CSV du relevé est lu 100 % localement
  // (FileReader — aucun Node/fs côté renderer, aucune donnée qui sort du PC).
  // ==========================================================================
  const analyserReleve = (fichier: File): void => {
    setRapproMsg(null)
    const lecteur = new FileReader()
    lecteur.onload = (): void => {
      const texte = String(lecteur.result ?? '')
      const transactions = parseReleve(texte)
      if (transactions.length === 0) {
        setPropositions([])
        setRapproMsg('Aucune opération chiffrée trouvée dans ce fichier (format CSV attendu).')
        return
      }
      // Candidats : pour chaque bail payant, le loyer attendu de la période
      // pointée ET du mois précédent — en EXCLUANT les périodes déjà
      // pointées payé/partiel (pas de double pointage proposé).
      const periodePrec = periodePrecedente(periode)
      const candidats = bauxPayants.map((r) => ({
        bailId: r.bail.id,
        locataire: r.locataire.nom_complet,
        designation: nomBien(r.bien),
        attendusParPeriode: [periode, periodePrec]
          .map((p) => ({ periode: p, montant: montantAttendu(r.bail, p) ?? 0 }))
          .filter(
            (x) =>
              x.montant > 0 &&
              paiements.find(
                (p) =>
                  p.bail_id === r.bail.id &&
                  p.periode === x.periode &&
                  (p.statut === 'paye' || p.statut === 'partiel')
              ) === undefined
          )
      }))
      const props = proposerPointages(transactions, candidats, periode, regles)
      setPropositions(props)
      // Pré-coche les propositions sûres (haute/moyenne = montant exact).
      // (variable nommée `prop` : « props.map » ferait croire au lint que ce
      // composant reçoit des props nommés map/filter)
      setSelection(
        new Set(props.map((p, i) => (p.confiance !== 'revoir' ? i : -1)).filter((i) => i >= 0))
      )
      setRapproMsg(
        `${transactions.length} opération(s) analysée(s) — ${props.filter((p) => p.confiance !== 'revoir').length} proposition(s) de pointage.`
      )
    }
    lecteur.readAsText(fichier, 'utf-8')
  }

  const appliquerSelection = async (): Promise<void> => {
    const retenues = [...selection]
      .map((i) => propositions[i])
      .filter((p) => p && p.bailId !== null && p.periode !== null)
    if (retenues.length === 0) return
    setRapproEnCours(true)
    try {
      // Mémorise « libellé → bail » pour reconnaitre les virements suivants
      // (règles v2 — la clé ignore les chiffres : dates/références varient).
      const nouvellesRegles: ReglesRapprochement = { ...regles }
      for (const p of retenues) {
        const cle = cleRegle(p.transaction.libelle)
        if (cle !== '' && p.bailId !== null) nouvellesRegles[cle] = p.bailId
      }
      await ipc.parametres.set('rapprochement', { regles: nouvellesRegles })
      setRegles(nouvellesRegles)
      for (const p of retenues) {
        await ipc.paiements.upsert({
          bail_id: p.bailId as number,
          periode: p.periode as string,
          montant_paye: Math.abs(p.transaction.montant),
          statut: 'paye',
          date_paiement: p.transaction.date ?? new Date().toISOString().slice(0, 10),
          mode_paiement: 'Virement',
          reference: p.transaction.libelle.slice(0, 80) || null,
          notes: 'Rapprochement bancaire'
        })
      }
      await recharger()
      await refresh()
      setPropositions([])
      setSelection(new Set())
      setRapproMsg(
        `${retenues.length} loyer(s) pointé(s) payé(s) depuis le relevé — ${Object.keys(nouvellesRegles).length} libellé(s) mémorisé(s) pour les prochains mois.`
      )
    } catch (err) {
      setRapproMsg(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRapproEnCours(false)
    }
  }

  /** Oublie toutes les règles mémorisées (ex : déménagement, erreur). */
  const oublierRegles = async (): Promise<void> => {
    setRegles({})
    await ipc.parametres.set('rapprochement', { regles: {} })
    setRapproMsg('Règles mémorisées effacées — le matching repart du montant + nom.')
  }

  // ==========================================================================
  // Relances d'impayés : 3 niveaux de templates (courtoise / ferme / mise en
  // demeure). Préremplis mais JAMAIS automatiques — le bailleur relit,
  // ajuste puis envoie lui-même (email, copie ou lettre PDF).
  // ==========================================================================
  const ctxRelance = relanceModal
    ? {
        locataire: relanceModal.row.locataire.nom_complet,
        designation: nomBien(relanceModal.row.bien),
        adresseBien: [
          relanceModal.row.bien.adresse,
          relanceModal.row.bien.code_postal,
          relanceModal.row.bien.ville
        ]
          .filter(Boolean)
          .join(', '),
        periode: formatPeriode(periode),
        montantDu: attenduDe(relanceModal.row),
        echeance: formatDate(echeanceIso(periode, relanceModal.row.bail.jour_paiement)),
        bailleur: bailleurProfil?.nom_complet || 'Le bailleur'
      }
    : null
  const modeleRelance = ctxRelance ? templateRelance(niveauRelance, ctxRelance) : null

  /** Ouvre le modal de relance pour un bail impayé/retard du mois affiché. */
  const ouvrirRelance = (bailId: number): void => {
    const row = bauxPayants.find((r) => r.bail.id === bailId)
    if (!row) return
    // Niveau suggéré : courtoise par défaut, ferme si déjà ~10 j de retard.
    const retard = joursDeRetard(periode, row.bail.jour_paiement, 0)
    setNiveauRelance(retard > 10 ? 2 : 1)
    setRelanceModal({ row })
  }

  /** Envoie la relance par email (SMTP configuré + email du locataire requis). */
  const envoyerRelance = async (): Promise<void> => {
    if (!relanceModal || !modeleRelance) return
    if (!relanceModal.row.locataire.email) {
      window.alert('Ce locataire n’a pas d’adresse email — complète sa fiche.')
      return
    }
    setRelanceEnCours(true)
    try {
      await ipc.email.send(
        relanceModal.row.locataire.email,
        modeleRelance.objet,
        modeleRelance.corps
      )
      window.alert(`Relance envoyée à ${relanceModal.row.locataire.email}.`)
      setRelanceModal(null)
    } catch (err) {
      window.alert(`Erreur d'envoi : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRelanceEnCours(false)
    }
  }

  /** Copie le texte de la relance (pour collage dans un webmail, SMS…). */
  const copierRelance = async (): Promise<void> => {
    if (!modeleRelance) return
    await navigator.clipboard.writeText(`${modeleRelance.objet}\n\n${modeleRelance.corps}`)
    window.alert('Relance copiée dans le presse-papiers.')
  }

  /** Génère la lettre PDF de relance (utile pour la mise en demeure en recommandé). */
  const pdfRelance = async (): Promise<void> => {
    if (!modeleRelance || !ctxRelance || !relanceModal) return
    const { row } = relanceModal
    const doc = construireLettreRelance(
      modeleRelance,
      bailleurProfil?.nom_complet || 'Le bailleur',
      [bailleurProfil?.adresse, bailleurProfil?.code_postal, bailleurProfil?.ville]
        .filter(Boolean)
        .join(', '),
      row.locataire.nom_complet,
      [row.locataire.adresse, row.locataire.code_postal, row.locataire.ville]
        .filter(Boolean)
        .join(', ')
    )
    pdfMake.createPdf(doc).getBase64(async (base64: string) => {
      const nom = `relance_${slug(row.locataire.nom_complet)}_${periode}.pdf`
      const chemin = await ipc.quittances.save(base64, nom)
      if (chemin) window.alert(`Lettre enregistrée : ${chemin}`)
    })
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

  // Adresse complète du bien (colonne dédiée : on affiche tout, sans filtrage)
  const adressesParBail = new Map(
    locations.map((r) => [
      r.bail.id,
      [r.bien.adresse, r.bien.code_postal, r.bien.ville].filter(Boolean).join(', ') || null
    ])
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
      <div
        className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"
        data-tri="bien puis locataire"
      >
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Bien</th>
              <th className="px-4 py-2">Locataire</th>
              <th className="px-4 py-2">Adresse</th>
              <th className="px-4 py-2 text-right">Montant dû</th>
              <th className="px-4 py-2">Échéance</th>
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
                // Échéancier : prorata du 1er mois + jour de paiement du bail.
                const prorata = detailProrata(r.bail, periode)
                const echeance = echeanceIso(periode, r.bail.jour_paiement)
                const enRetard =
                  joursDeRetard(periode, r.bail.jour_paiement, 0) > 0 &&
                  existant?.statut !== 'paye' &&
                  existant?.statut !== 'partiel'
                return (
                  <tr
                    key={r.bail.id}
                    onClick={() => navigate(`/baux/${r.bail.id}`)}
                    title="Voir la fiche du bail"
                    className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">
                        <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {r.bien.type_bien}
                        </span>
                        {nomBien(r.bien)}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {r.locataire.nom_complet}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                      {adressesParBail.get(r.bail.id) ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="font-medium">{formatEuro(attenduDe(r))}</div>
                      {prorata && (
                        <span
                          title={`Prorata du mois d'entrée (${r.bail.date_debut_bail})`}
                          className="text-[11px] font-semibold text-sky-600 dark:text-sky-400"
                        >
                          prorata {prorata}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2 text-sm ${enRetard ? 'font-semibold text-red-500' : 'text-slate-500 dark:text-slate-400'}`}
                    >
                      le {echeance.slice(8, 10)}/{echeance.slice(5, 7)}
                      {enRetard && <span className="ml-1 text-xs">⏱</span>}
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
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {boutonStatut(
                          r,
                          'paye',
                          Check,
                          'bg-emerald-600 text-white hover:bg-emerald-700'
                        )}
                        <button
                          onClick={() => ouvrirPartiel(r.bail.id)}
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
                        {boutonStatut(
                          r,
                          'retard',
                          Clock,
                          'bg-amber-500 text-white hover:bg-amber-600'
                        )}
                        {boutonStatut(r, 'impaye', X, 'bg-red-600 text-white hover:bg-red-700')}
                        {existant &&
                          (existant.statut === 'retard' || existant.statut === 'impaye') && (
                            <button
                              onClick={() => ouvrirRelance(r.bail.id)}
                              title="Relancer le locataire (email prérempli — courtoise, ferme ou mise en demeure)"
                              aria-label="Relancer le locataire"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            {bauxPayants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Aucun bail payant actif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Clique sur ✓ (payé), 💶 (partiel — saisir le montant reçu), ⏱ (en retard) ou ✕ (impayé) pour
        pointer chaque bail du mois choisi. Re-cliquer sur le même bouton annule le pointage. Le
        premier mois d’un bail commençant en cours de mois est automatiquement PRORATISÉ (badge
        bleu). Les occupations gratuites n’apparaissent pas. L’historique complet de chaque bail est
        dans sa fiche détaillée.
      </p>

      {/* Rapprochement bancaire (import de relevé CSV) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setRapproOuvert(!rapproOuvert)}
          className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium"
        >
          <Repeat className="h-4 w-4 text-primary-500" />
          Rapprochement bancaire — importer un relevé CSV
          <span className="ml-auto text-xs text-slate-400">
            montant + période → propositions de pointage
          </span>
        </button>
        {rapproOuvert && (
          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Exporte le relevé de ta banque en CSV, glisse-le ici : GestyLoc reconnait les loyers
              (montant + nom + période) et propose le pointage — tu valides en masse. Le fichier est
              lu 100 % localement, rien ne quitte ton PC. Les périodes déjà pointées payé/partiel ne
              sont jamais re-proposées.
              {Object.keys(regles).length > 0 &&
                ` ${Object.keys(regles).length} libellé(s) déjà mémorisé(s) — reconnus d'office aux prochains mois.`}
            </p>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) analyserReleve(f)
                e.target.value = ''
              }}
              className="block w-full max-w-md text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-primary-700"
            />
            {rapproMsg && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{rapproMsg}</p>
            )}
            {propositions.length > 0 && (
              <div className="mt-3">
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Libellé</th>
                        <th className="px-3 py-2 text-right">Montant</th>
                        <th className="px-3 py-2">Proposition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propositions.map((p, i) => (
                        <tr
                          key={`${p.transaction.date}-${i}`}
                          className="border-t border-slate-200 dark:border-slate-800"
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              disabled={p.confiance === 'revoir'}
                              checked={selection.has(i)}
                              onChange={(e) => {
                                const next = new Set(selection)
                                if (e.target.checked) next.add(i)
                                else next.delete(i)
                                setSelection(next)
                              }}
                              className="h-4 w-4 rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                            {p.transaction.date ? formatDate(p.transaction.date) : '—'}
                          </td>
                          <td
                            className="max-w-[220px] truncate px-3 py-2"
                            title={p.transaction.libelle}
                          >
                            {p.transaction.libelle || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatEuro(Math.abs(p.transaction.montant))}
                          </td>
                          <td className="px-3 py-2">
                            {p.bailId !== null ? (
                              <span>
                                <strong>{p.locataire}</strong>
                                <span className="text-xs text-slate-400">
                                  {' '}
                                  — {formatPeriode(p.periode as string)}
                                </span>
                                <span
                                  className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    p.confiance === 'haute'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                                  }`}
                                >
                                  {p.confiance === 'haute' ? 'sûr' : 'probable'}
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400" title={p.motif}>
                                ⚠ {p.motif}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => void appliquerSelection()}
                    disabled={rapproEnCours || selection.size === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {rapproEnCours ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `✓ Pointer la sélection (${selection.size})`
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setPropositions([])
                      setSelection(new Set())
                      setRapproMsg(null)
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Effacer
                  </button>
                  {Object.keys(regles).length > 0 && (
                    <button
                      onClick={() => void oublierRegles()}
                      title="Efface la mémorisation libellé → bail (le matching repart du montant + nom)"
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Oublier les règles ({Object.keys(regles).length})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal : saisie du montant partiellement reçu */}
      {partielModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-bold">Paiement partiel</h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {partielModal.row.locataire.nom_complet} — {formatPeriode(periode)} · attendu :{' '}
              <strong>{formatEuro(partielModal.attendu)}</strong>
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              value={montantSaisi}
              onChange={(e) => setMontantSaisi(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void validerPartiel()
                if (e.key === 'Escape') setPartielModal(null)
              }}
              placeholder="Montant reçu (€)"
              className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPartielModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={() => void validerPartiel()}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : relance d'impayé (courtoise / ferme / mise en demeure) */}
      {relanceModal && modeleRelance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-bold">Relancer le locataire</h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {relanceModal.row.locataire.nom_complet} — {formatPeriode(periode)} · dû :{' '}
              <strong>{formatEuro(attenduDe(relanceModal.row))}</strong>
            </p>
            <div className="mb-3 flex gap-1.5">
              {([1, 2, 3] as NiveauRelance[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setNiveauRelance(n)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    niveauRelance === n
                      ? 'bg-primary-600 text-white'
                      : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {libelleNiveau(n)}
                </button>
              ))}
            </div>
            <div className="mb-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Objet
              </div>
              <p className="mb-3 text-sm font-medium">{modeleRelance.objet}</p>
              <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Message (modifiable dans ton email — relis avant envoi)
              </div>
              <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                {modeleRelance.corps}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setRelanceModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
              <button
                onClick={() => void copierRelance()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Copy className="h-4 w-4" /> Copier
              </button>
              <button
                onClick={() => void pdfRelance()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                title="Lettre PDF (recommandé pour une mise en demeure)"
              >
                <FileText className="h-4 w-4" /> Lettre PDF
              </button>
              <button
                onClick={() => void envoyerRelance()}
                disabled={!smtpOk || relanceEnCours}
                title={
                  smtpOk
                    ? `Envoyer à ${relanceModal.row.locataire.email ?? '—'}`
                    : 'Configure le SMTP dans Paramètres → Email pour activer l’envoi'
                }
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
              >
                {relanceEnCours ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Mail className="h-4 w-4" /> Envoyer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
