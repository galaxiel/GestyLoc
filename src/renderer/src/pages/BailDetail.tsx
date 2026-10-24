import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Home, User, Wallet, TrendingUp, Printer, FileUp,
  ExternalLink, Trash2, Loader2, CheckCircle2, Globe
} from 'lucide-react'
import type { Paiement, DocumentRow } from '@shared/types'
import type { ValeurIndice } from '@shared/indices'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate, formatSurface, libelleStatut, formatPeriode } from '../lib/format'

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

  // --- Révision IRL ---
  const [irlNouveau, setIrlNouveau] = useState<string>('')
  const [revisionMsg, setRevisionMsg] = useState<string | null>(null)
  const [revisant, setRevisant] = useState(false)

  useEffect(() => {
    if (row?.bail.irl_nouveau) setIrlNouveau(String(row.bail.irl_nouveau))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Récupération des indices IRL/ICC depuis l'INSEE ---
  const [typeIndice, setTypeIndice] = useState<'IRL' | 'ICC'>('IRL')
  const [indicesRecuperes, setIndicesRecuperes] = useState<ValeurIndice[] | null>(null)
  const [indicesEnCours, setIndicesEnCours] = useState(false)
  const [indicesErreur, setIndicesErreur] = useState<string | null>(null)

  const recupererIndices = async (): Promise<void> => {
    setIndicesEnCours(true)
    setIndicesErreur(null)
    try {
      const res = await ipc.indices.fetch(typeIndice)
      if (res.erreur) {
        setIndicesErreur(res.erreur)
        setIndicesRecuperes(null)
      } else {
        setIndicesRecuperes(res.valeurs)
      }
    } catch (err) {
      setIndicesErreur(err instanceof Error ? err.message : String(err))
    } finally {
      setIndicesEnCours(false)
    }
  }

  // --- Historique paiements + documents ---
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [docEnCours, setDocEnCours] = useState(false)

  useEffect(() => {
    if (!row) return
    void ipc.paiements.listByBail(row.bail.id).then(setPaiements).catch(() => setPaiements([]))
    void ipc.documents.list(row.bail.id).then(setDocs).catch(() => setDocs([]))
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

  // --- Calcul de la révision IRL (formulaire guidé) ---
  const irlRef = bail.irl_reference
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
  const tauxPct =
    revisionPossible ? Math.round((irlNouv / (irlRef as number) - 1) * 100000) / 1000 : null

  /** Applique la révision : met à jour le loyer et l'historique IRL. */
  const appliquerRevision = async (): Promise<void> => {
    if (nouveauLoyerHc === null || tauxPct === null) return
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
        taux_irl: tauxPct,
        nouveau_loyer_hc: nouveauLoyerHc,
        date_derniere_revision: new Date().toISOString().slice(0, 10)
      })
      await refresh()
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
          {bien.designation}
          {bail.occupation_gratuite && (
            <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              Occupation gratuite
            </span>
          )}
        </h1>
        <button
          onClick={() => navigate(`/quittances?bail=${bail.id}`)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" /> Quittance
        </button>
      </div>

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
              <Info label="Annuel HC / CC" valeur={`${formatEuro(bail.loyer_annuel_hc)} / ${formatEuro(bail.loyer_annuel_cc)}`} />
              <Info label="Frais agence" valeur={formatEuro(bail.frais_agence)} />
            </>
          )}
        </div>
      </div>

      {/* Révision IRL guidée */}
      {!bail.occupation_gratuite && (
        <div className={cardCls}>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="h-4 w-4 text-primary-500" /> Révision annuelle du loyer (IRL)
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Nouveau loyer = loyer HC × (IRL nouveau ÷ IRL de référence), arrondi au centime.
            {bail.date_derniere_revision &&
              ` Dernière révision : ${formatDate(bail.date_derniere_revision)}.`}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                IRL de référence {bail.trimestre_reference ? `(${bail.trimestre_reference})` : ''}
              </span>
              <input className={`${inputCls} w-32`} value={irlRef ?? ''} disabled />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                IRL nouveau (du trimestre voulu)
              </span>
              <input
                className={`${inputCls} w-32`}
                value={irlNouveau}
                onChange={(e) => setIrlNouveau(e.target.value)}
                placeholder="ex : 145.78"
              />
            </div>
            {/* Récupération automatique des indices sur INSEE.fr (internet) */}
            <div className="w-full rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <Globe className="h-4 w-4 text-slate-400" />
                <select
                  value={typeIndice}
                  onChange={(e) => {
                    setTypeIndice(e.target.value as 'IRL' | 'ICC')
                    setIndicesRecuperes(null)
                    setIndicesErreur(null)
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="IRL">IRL (habitation)</option>
                  <option value="ICC">ICC (construction)</option>
                </select>
                <button
                  onClick={() => void recupererIndices()}
                  disabled={indicesEnCours}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                  title="Récupérer les derniers indices publiés sur INSEE.fr"
                >
                  {indicesEnCours ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Récupérer sur INSEE.fr</>
                  )}
                </button>
                <span className="text-xs text-slate-400">
                  puis cliquez sur un trimestre pour remplir le champ ci-dessus
                </span>
              </div>
              {indicesErreur && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Connexion impossible : {indicesErreur} — saisie manuelle toujours possible.
                </p>
              )}
              {indicesRecuperes && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {indicesRecuperes.map((v) => (
                    <button
                      key={v.periode}
                      onClick={() => setIrlNouveau(String(v.valeur))}
                      title="Remplir le champ IRL nouveau avec cette valeur"
                      className={`rounded-lg border px-2 py-1 text-xs transition-colors ${
                        String(v.valeur) === irlNouveau
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-500'
                          : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      <strong>{v.periode}</strong> : {v.valeur}
                    </button>
                  ))}
                  <span className="w-full text-[11px] text-slate-400">
                    Source : INSEE (bdm.insee.fr), données officielles. {indicesRecuperes[0]?.periode} est le dernier publié.
                  </span>
                </div>
              )}
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
              {revisant ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Appliquer la révision
            </button>
          </div>
          {revisionMsg && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{revisionMsg}</p>}
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
            {docEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
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
                    onClick={() => void ipc.documents.remove(d.id).then(() => ipc.documents.list(bail.id).then(setDocs))}
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
