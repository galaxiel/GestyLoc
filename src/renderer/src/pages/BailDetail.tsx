import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Home,
  User,
  Wallet,
  TrendingUp,
  Printer,
  FileUp,
  ExternalLink,
  Trash2,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import type { Paiement, DocumentRow, BailRevision } from '@shared/types'
import { IRL_INSEE, IRL_TRIMESTRES, valeurIrl } from '@shared/irl-insee'
import { nomBien } from '@shared/labels'
import { Mail } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate, formatSurface, libelleStatut, formatPeriode } from '../lib/format'
import pdfMake from 'pdfmake/build/pdfmake'
import vfsFonts from 'pdfmake/build/vfs_fonts'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'

/* Branchement des polices embarquées (forme du module variable selon la version) */
/* eslint-disable @typescript-eslint/no-explicit-any -- formes de module variables */
const vfsBail =
  (vfsFonts as any)?.pdfMake?.vfs ??
  (vfsFonts as any)?.default?.pdfMake?.vfs ??
  (vfsFonts as any)?.vfs ??
  (vfsFonts as any)?.default?.vfs ??
  vfsFonts
;(pdfMake as any).vfs = vfsBail
/* eslint-enable @typescript-eslint/no-explicit-any */

const cardCls =
  'rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950'
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

function Info({ label, valeur }: { label: string; valeur: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800/60">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{valeur}</span>
    </div>
  )
}

export function BailDetail(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const { locations, refresh } = useStore()

  const row = locations.find((r) => r.bail.id === Number(id))

  // --- Email d'assurance (SMTP configuré ?) ---
  const [smtpOk, setSmtpOk] = useState(false)
  const [bailleurNom, setBailleurNom] = useState('')
  const [bailleurProfil, setBailleurProfil] = useState<{
    nom_complet: string
    adresse: string
    code_postal?: string
    ville?: string
  } | null>(null)
  const [assuranceEnCours, setAssuranceEnCours] = useState(false)
  const [assuranceMsg, setAssuranceMsg] = useState<string | null>(null)
  const [contratEnCours, setContratEnCours] = useState(false)

  useEffect(() => {
    void ipc.email
      .getConfig()
      .then((c) => setSmtpOk(c.configure))
      .catch(() => setSmtpOk(false))
    void ipc.parametres
      .getBailleur()
      .then((b) => {
        setBailleurNom(b?.nom_complet ?? '')
        setBailleurProfil(b)
      })
      .catch(() => {
        setBailleurNom('')
        setBailleurProfil(null)
      })
  }, [])

  /** Génère le contrat de location PRÉ-REMPLI (modèle PDF indicatif, loi 1989). */
  const genererContrat = async (): Promise<void> => {
    if (!row) return
    setContratEnCours(true)
    try {
      const doc = (await ipc.contrat.pdf({
        row,
        bailleur: bailleurProfil
      })) as unknown as TDocumentDefinitions
      pdfMake.createPdf(doc).getBase64(async (base64: string) => {
        const nom = `contrat_location_${row.locataire.nom_complet.replace(/\s+/g, '_')}_${row.bail.date_debut_bail ?? ''}.pdf`
        const chemin = await ipc.quittances.save(base64, nom)
        if (chemin) window.alert(`Contrat enregistré : ${chemin}`)
      })
    } catch (err) {
      window.alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setContratEnCours(false)
    }
  }

  /** Envoie l'email de demande d'attestation d'assurance au locataire. */
  const demanderAssurance = async (): Promise<void> => {
    if (!row) return
    if (!row.locataire.email) {
      setAssuranceMsg('Ce locataire n’a pas d’adresse email — complète sa fiche.')
      return
    }
    setAssuranceEnCours(true)
    setAssuranceMsg(null)
    try {
      const [annee, mois, jour] = (bail.date_debut_bail ?? '').split('-')
      const anniversaire =
        annee && mois && jour ? `${jour}/${mois} de chaque année` : 'à la date anniversaire du bail'
      await ipc.email.send(
        row.locataire.email,
        `Attestation d'assurance locative — ${nomBien(bien)}`,
        `Bonjour ${row.locataire.nom_complet},

` +
          `Dans le cadre du bail du bien situé « ${[bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ')} », ` +
          `dont l'échéance anniversaire intervient le ${anniversaire}, merci de bien vouloir me transmettre ` +
          `l'attestation d'assurance locative (habitation) en cours de validité couvrant le bien loué.

` +
          `Cordialement,
${bailleurNom || 'Le bailleur'}`
      )
      // Traçage (migration 0013) : la demande est datée — l'alerte
      // d'anniversaire ne repart pas si elle a moins de 11 mois.
      const aujourdhui = new Date().toISOString().slice(0, 10)
      await ipc.baux.update(row.bail.id, { assurance_demandee_le: aujourdhui })
      await refresh()
      setAssuranceMsg(
        `Demande d'attestation envoyée à ${row.locataire.email} (tracée au ${aujourdhui.split('-').reverse().join('/')}).`
      )
    } catch (err) {
      setAssuranceMsg(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAssuranceEnCours(false)
    }
  }

  // --- Révision IRL : pilotée par le TRIMESTRE DE RÉFÉRENCE (table embarquée) ---
  const [tRef, setTRef] = useState<string>('')
  const [anneeRef, setAnneeRef] = useState<string>('')
  const [nouveauTrim, setNouveauTrim] = useState<string>('')
  const [irlNouveau, setIrlNouveau] = useState<string>('')
  const [revisionMsg, setRevisionMsg] = useState<string | null>(null)
  const [revisant, setRevisant] = useState(false)
  // IRL de référence affiché (pré-rempli depuis la table INSEE embarquée).
  // IMPORTANT : déclaré AVANT tout return conditionnel — un hook après un
  // early-return change l'ordre des hooks entre rendus (bug latent corrigé).
  const [irlReferenceDisplay, setIrlReferenceDisplay] = useState<number | null>(null)

  // Pré-remplissage depuis le bail : trimestre de référence parsé du texte libre
  useEffect(() => {
    if (!row) return
    const trimTxt = row.bail.trimestre_reference ?? ''
    const t = trimTxt.match(/\bT([1-4])\b/)
    const a = trimTxt.match(/(19|20)\d{2}/)
    setTRef(t ? t[1] : '')
    setAnneeRef(a ? a[0] : '')
    if (t && a) {
      const v = valeurIrl(`${a[0]}-Q${t[1]}`)
      if (v !== null) setIrlReferenceDisplay(v)
    }
    if (row.bail.irl_nouveau) setIrlNouveau(String(row.bail.irl_nouveau))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Historique paiements + documents + révisions ---
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [revisions, setRevisions] = useState<BailRevision[]>([])
  const [docEnCours, setDocEnCours] = useState(false)

  useEffect(() => {
    if (!row) return
    void ipc.paiements
      .listByBail(row.bail.id)
      .then(setPaiements)
      .catch(() => setPaiements([]))
    void ipc.documents
      .list(row.bail.id)
      .then(setDocs)
      .catch(() => setDocs([]))
    void ipc.revisions
      .listByBail(row.bail.id)
      .then(setRevisions)
      .catch(() => setRevisions([]))
  }, [row?.bail.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/biens')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux baux
        </button>
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
          Bail introuvable.
        </p>
      </div>
    )
  }

  const { bail, bien, locataire } = row

  // --- Calcul de la révision IRL (piloté par les trimestres) ---
  const irlRef = irlReferenceDisplay ?? bail.irl_reference
  const irlNouv = Number(irlNouveau.replace(',', '.'))
  const loyerHcActuel = bail.loyer_hc
  const revisionPossible =
    !bail.occupation_gratuite &&
    irlRef !== null &&
    irlRef > 0 &&
    !isNaN(irlNouv) &&
    irlNouv > 0 &&
    loyerHcActuel !== null

  const nouveauLoyerHc =
    revisionPossible && loyerHcActuel !== null
      ? Math.round(loyerHcActuel * (irlNouv / (irlRef as number)) * 100) / 100
      : null
  const tauxPct = revisionPossible
    ? Math.round((irlNouv / (irlRef as number) - 1) * 100000) / 1000
    : null

  // Validation de la paire : même trimestre, un an d'écart (révision annuelle légale)
  const pairIllégale =
    nouveauTrim !== '' &&
    tRef !== '' &&
    anneeRef !== '' &&
    nouveauTrim !==
      `${anneeRef}-Q${tRef}`.replace(String(Number(anneeRef)), String(Number(anneeRef) + 1))

  /** Applique la révision : met à jour le loyer et l'historique IRL. */
  const appliquerRevision = async (): Promise<void> => {
    if (nouveauLoyerHc === null || tauxPct === null) return
    // Anti-ré-application : si l'IRL nouveau choisi est déjà celui enregistré
    // sur le bail, appliquer à nouveau ré-incrémenterait la révision.
    if (bail.irl_nouveau !== null && irlNouv === bail.irl_nouveau) {
      setRevisionMsg(
        `Cette révision semble déjà appliquée (IRL nouveau du bail : ${bail.irl_nouveau}). Choisis un trimestre différent, ou modifie le loyer manuellement via le formulaire.`
      )
      return
    }
    setRevisant(true)
    setRevisionMsg(null)
    try {
      await ipc.baux.update(bail.id, {
        loyer_hc: nouveauLoyerHc,
        charges: bail.charges,
        loyer_cc: nouveauLoyerHc + (bail.charges ?? 0),
        loyer_annuel_hc: Math.round(nouveauLoyerHc * 12 * 100) / 100,
        loyer_annuel_cc: Math.round((nouveauLoyerHc + (bail.charges ?? 0)) * 12 * 100) / 100,
        irl_reference: irlNouv,
        irl_nouveau: irlNouv,
        trimestre_reference: nouveauTrim.replace('-Q', ' '),
        taux_irl: tauxPct,
        nouveau_loyer_hc: nouveauLoyerHc,
        date_derniere_revision: new Date().toISOString().slice(0, 10)
      })
      // Trace dans l'historique des révisions (migration 0012) — le simulateur
      // pourra comparer loyer théorique vs réellement appliqué.
      await ipc.revisions.create({
        bail_id: bail.id,
        date_revision: new Date().toISOString().slice(0, 10),
        ancien_loyer_hc: loyerHcActuel,
        nouveau_loyer_hc: nouveauLoyerHc,
        irl_reference: irlRef,
        irl_nouveau: irlNouv,
        taux: tauxPct
      })
      await refresh()
      // Réinitialise la sélection : impossible de re-cliquer « Appliquer »
      // sans choisir un nouveau trimestre (anti-incrément).
      setNouveauTrim('')
      setIrlNouveau('')
      setRevisionMsg(
        `Loyer révisé : ${formatEuro(loyerHcActuel)} → ${formatEuro(nouveauLoyerHc)} HC. La date de dernière révision est enregistrée.`
      )
    } catch (err) {
      setRevisionMsg(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRevisant(false)
    }
  }

  const joindreDoc = async (): Promise<void> => {
    setDocEnCours(true)
    try {
      await ipc.documents.attach(bail.id, 'autre')
      setDocs(await ipc.documents.list(bail.id))
    } catch {
      /* dialog annulé */
    } finally {
      setDocEnCours(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/biens')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux baux
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          {nomBien(bien)}
          {bail.occupation_gratuite && (
            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              Occupation gratuite
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/quittances?bail=${bail.id}`)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" /> Quittance
          </button>
          <button
            onClick={() => void genererContrat()}
            disabled={contratEnCours}
            title="Générer le contrat de location pré-rempli depuis cette fiche (modèle PDF indicatif, loi 1989)"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {contratEnCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Contrat
          </button>
          <button
            onClick={() => void demanderAssurance()}
            disabled={assuranceEnCours}
            title={
              smtpOk
                ? 'Envoyer l’email de demande d’attestation d’assurance'
                : 'Configure le SMTP dans Paramètres → Email pour activer l’envoi'
            }
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {assuranceEnCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Assurance
          </button>
        </div>
      </div>

      {assuranceMsg && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
          {assuranceMsg}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Le bien */}
        <div className={cardCls}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Home className="h-4 w-4 text-primary-500" /> Le bien
          </h2>
          <Info label="Type" valeur={bien.type_bien} />
          <Info label="Surface" valeur={formatSurface(bien.surface_m2)} />
          <Info label="Meublé" valeur={bien.meuble ? 'Oui' : 'Non'} />
          <Info
            label="Adresse"
            valeur={[bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ') || '—'}
          />
        </div>

        {/* Le locataire */}
        <div className={cardCls}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-primary-500" /> Le locataire
          </h2>
          <Info label="Nom" valeur={locataire.nom_complet} />
          <Info label="Email" valeur={locataire.email ?? '—'} />
          <Info label="Téléphone" valeur={locataire.telephone ?? '—'} />
          <Info label="Début du bail" valeur={formatDate(bail.date_debut_bail)} />
          <Info label="Fin du bail" valeur={formatDate(bail.date_fin_bail)} />
          {!bail.occupation_gratuite && (
            <Info
              label="Paiement du loyer"
              valeur={`le ${bail.jour_paiement ?? 1} de chaque mois`}
            />
          )}
          {bail.assurance_demandee_le && (
            <Info label="Attestation demandée le" valeur={formatDate(bail.assurance_demandee_le)} />
          )}
        </div>

        {/* Le loyer */}
        <div className={cardCls}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-primary-500" /> Le loyer
          </h2>
          {bail.occupation_gratuite ? (
            <p className="text-sm text-slate-400">Occupation gratuite — aucun loyer dû.</p>
          ) : (
            <>
              <Info label="Loyer HC" valeur={formatEuro(bail.loyer_hc)} />
              <Info label="Charges" valeur={formatEuro(bail.charges)} />
              <Info label="Loyer CC" valeur={formatEuro(bail.loyer_cc)} />
              <Info label="Loyer HC / m²" valeur={formatEuro(bail.loyer_metre_carre_hc)} />
              <Info
                label="Annuel HC / CC"
                valeur={`${formatEuro(bail.loyer_annuel_hc)} / ${formatEuro(bail.loyer_annuel_cc)}`}
              />
              <Info label="Frais agence" valeur={formatEuro(bail.frais_agence)} />
            </>
          )}
        </div>
      </div>

      {/* Révision IRL guidée — pilotée par le trimestre de référence */}
      {!bail.occupation_gratuite && (
        <div className={cardCls}>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary-500" /> Révision annuelle du loyer (IRL)
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Choisis le trimestre de référence (celui du bail, souvent le trimestre de signature),
            puis le trimestre IRL à appliquer. Les valeurs officielles INSEE sont embarquées dans
            l’application — aucun internet requis.
            {bail.date_derniere_revision &&
              ` Dernière révision : ${formatDate(bail.date_derniere_revision)}.`}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Trimestre de référence
              </span>
              <div className="flex gap-1">
                <select
                  value={tRef}
                  onChange={(e) => {
                    setTRef(e.target.value)
                    const v = valeurIrl(`${anneeRef}-Q${e.target.value}`)
                    if (v !== null) setIrlReferenceDisplay(v)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">T…</option>
                  {['1', '2', '3', '4'].map((t) => (
                    <option key={t} value={t}>
                      T{t}
                    </option>
                  ))}
                </select>
                <select
                  value={anneeRef}
                  onChange={(e) => {
                    setAnneeRef(e.target.value)
                    const v = valeurIrl(`${e.target.value}-Q${tRef}`)
                    if (v !== null) setIrlReferenceDisplay(v)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Année…</option>
                  {[...new Set(IRL_TRIMESTRES.map((q) => q.slice(0, 4)))].map((annee) => (
                    <option key={annee} value={annee}>
                      {annee}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                IRL de référence (INSEE)
              </span>
              <input className={`${inputCls} w-28`} value={irlReferenceDisplay ?? ''} readOnly />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                IRL nouveau (trimestre à appliquer)
              </span>
              <select
                value={nouveauTrim}
                onChange={(e) => {
                  setNouveauTrim(e.target.value)
                  const v = valeurIrl(e.target.value)
                  if (v !== null) setIrlNouveau(String(v))
                }}
                className={`${inputCls} w-44`}
              >
                <option value="">— Choisir —</option>
                {IRL_TRIMESTRES.map((q) => (
                  <option key={q} value={q}>
                    {q.replace('-Q', ' ')} : {IRL_INSEE[q]}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <div>
                Taux : <strong>{tauxPct !== null ? `${tauxPct} %` : '—'}</strong>
              </div>
              <div>
                Nouveau loyer HC :{' '}
                <strong className="text-primary-600 dark:text-primary-500">
                  {nouveauLoyerHc !== null ? formatEuro(nouveauLoyerHc) : '—'}
                </strong>
              </div>
            </div>
            <button
              onClick={() => void appliquerRevision()}
              disabled={!revisionPossible || revisant}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {revisant ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Appliquer la révision
            </button>
          </div>
          {pairIllégale && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              ⚠ {nouveauTrim} n’est pas le même trimestre que la référence un an plus tard (
              {tRef ? `T${tRef} ${Number(anneeRef) + 1}` : '—'}) : ce n’est pas une paire de
              révision annuelle légale.
            </p>
          )}
          {revisionMsg && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{revisionMsg}</p>
          )}
          {revisions.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Historique des révisions ({revisions.length})
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Appliquée le</th>
                      <th className="px-4 py-2 text-right">Ancien loyer HC</th>
                      <th className="px-4 py-2 text-right">Nouveau loyer HC</th>
                      <th className="px-4 py-2 text-right">IRL réf. → nouv.</th>
                      <th className="px-4 py-2 text-right">Taux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisions.map((rev) => (
                      <tr key={rev.id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="px-4 py-2">{formatDate(rev.date_revision)}</td>
                        <td className="px-4 py-2 text-right">{formatEuro(rev.ancien_loyer_hc)}</td>
                        <td className="px-4 py-2 text-right">{formatEuro(rev.nouveau_loyer_hc)}</td>
                        <td className="px-4 py-2 text-right text-xs text-slate-500 dark:text-slate-400">
                          {rev.irl_reference !== null && rev.irl_nouveau !== null
                            ? `${rev.irl_reference} → ${rev.irl_nouveau}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {rev.taux !== null ? `${rev.taux} %` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historique des paiements */}
      {!bail.occupation_gratuite && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Historique des paiements ({paiements.length})
          </h2>
          {paiements.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Aucun paiement pointé. Utilisez la page Paiements.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Période</th>
                    <th className="px-4 py-2 text-right">Montant</th>
                    <th className="px-4 py-2">Statut</th>
                    <th className="px-4 py-2">Date de paiement</th>
                  </tr>
                </thead>
                <tbody>
                  {paiements.map((p) => (
                    <tr key={p.periode} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-4 py-2">{formatPeriode(p.periode)}</td>
                      <td className="px-4 py-2 text-right">{formatEuro(p.montant_paye)}</td>
                      <td className="px-4 py-2">{libelleStatut(p.statut)}</td>
                      <td className="px-4 py-2">{formatDate(p.date_paiement)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Documents ({docs.length})
          </h2>
          <button
            onClick={() => void joindreDoc()}
            disabled={docEnCours}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {docEnCours ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Joindre
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aucun document — joignez le contrat, les états des lieux…
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{d.nom_original}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => void ipc.documents.open(d.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      void ipc.documents
                        .remove(d.id)
                        .then(() => ipc.documents.list(bail.id).then(setDocs))
                    }
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
