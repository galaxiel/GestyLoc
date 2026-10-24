import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Home, FileUp, ExternalLink, Trash2, Loader2, User, Pencil
} from 'lucide-react'
import type { DocumentRow, TypeDocument } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate, formatSurface } from '../lib/format'

const cardCls =
  'rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950'

function Info({ label, valeur }: { label: string; valeur: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-slate-800/60">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium">{valeur}</span>
    </div>
  )
}

/**
 * Fiche BIEN — indépendante du bail en cours : caractéristiques fixes,
 * historique de TOUS les locataires (baux passés et actuel), documents du
 * bien (diagnostics, travaux, taxe foncière...).
 */
export function BienDetail(): React.JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const { locations } = useStore()

  const bienId = Number(id)
  const rowsDuBien = locations.filter((r) => r.bien.id === bienId)
  const rowActuelle = rowsDuBien.find((r) => r.bail.actif) ?? rowsDuBien[0]
  const bien = rowActuelle?.bien

  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [docEnCours, setDocEnCours] = useState(false)

  useEffect(() => {
    if (!bienId) return
    void ipc.documents.listByBien(bienId).then(setDocs).catch(() => setDocs([]))
  }, [bienId])

  if (!bien) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/biens')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux baux
        </button>
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
          Bien introuvable.
        </p>
      </div>
    )
  }

  // Taux de vacance : part du temps sans bail actif depuis le 1er bail.
  const tauxVacance = ((): number | null => {
    const baux = rowsDuBien.filter((r) => r.bail.date_debut_bail)
    if (baux.length === 0) return null
    const premierJour = baux.map((r) => r.bail.date_debut_bail!).sort()[0]
    const debut = new Date(premierJour).getTime()
    const fin = Date.now()
    const dureeTotale = fin - debut
    if (dureeTotale <= 0) return null
    let joursOccupes = 0
    for (const r of baux) {
      const d = new Date(r.bail.date_debut_bail!).getTime()
      const f = r.bail.date_fin_bail ? new Date(r.bail.date_fin_bail).getTime() : fin
      joursOccupes += Math.min(Math.max(f - d, 0), dureeTotale)
    }
    return Math.min(Math.round((1 - joursOccupes / dureeTotale) * 100), 100)
  })()

  const bauxTries = [...rowsDuBien].sort((a, b) => {
    // Bail actif d'abord, puis par date de début décroissante
    if (a.bail.actif !== b.bail.actif) return a.bail.actif ? -1 : 1
    return (b.bail.date_debut_bail ?? '').localeCompare(a.bail.date_debut_bail ?? '')
  })

  const joindre = async (): Promise<void> => {
    setDocEnCours(true)
    try {
      await ipc.documents.attachToBien(bienId, 'autre' as TypeDocument)
      setDocs(await ipc.documents.listByBien(bienId))
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
        <h1 className="text-xl font-bold tracking-tight">{bien.designation}</h1>
        {rowActuelle && (
          <button
            onClick={() => navigate(`/baux/${rowActuelle.bail.id}`)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <Pencil className="h-4 w-4" /> Bail en cours
          </button>
        )}
      </div>

      {/* Caractéristiques fixes du bien */}
      <div className={cardCls}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Home className="h-4 w-4 text-primary-500" /> Le bien (immobilier fixe)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <Info label="Type" valeur={bien.type_bien} />
          <Info label="Surface" valeur={formatSurface(bien.surface_m2)} />
          <Info label="Meublé" valeur={bien.meuble ? 'Oui' : 'Non'} />
          <Info
            label="Adresse"
            valeur={[bien.adresse, bien.code_postal, bien.ville].filter(Boolean).join(', ') || '—'}
          />
          <Info
            label="DPE"
            valeur={bien.dpe ? `Classe ${bien.dpe}` : '—'}
          />
          <Info
            label="Taux de vacance"
            valeur={tauxVacance !== null ? `${tauxVacance} %` : '—'}
          />
          <Info
            label="Valeur vénale"
            valeur={
              bien.valeur_venale
                ? `${formatEuro(bien.valeur_venale)}${bien.valeur_venale_date ? ` (est. ${formatDate(bien.valeur_venale_date)})` : ''}`
                : '—'
            }
          />
        </div>
      </div>

      {/* Historique des locataires */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Historique des locataires ({bauxTries.length} bail/baux)
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Locataire</th>
                <th className="px-4 py-2">Période</th>
                <th className="px-4 py-2 text-right">Loyer CC</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bauxTries.map((r) => (
                <tr key={r.bail.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-2">
                    {r.bail.actif ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        En cours
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Terminé
                      </span>
                    )}
                    {r.bail.occupation_gratuite && (
                      <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                        Gratuit
                      </span>
                    )}
                  </td>
                  <td className="flex items-center gap-2 px-4 py-2">
                    <User className="h-4 w-4 shrink-0 text-slate-400" />
                    {r.locataire.nom_complet}
                  </td>
                  <td className="px-4 py-2">
                    {formatDate(r.bail.date_debut_bail)} → {formatDate(r.bail.date_fin_bail) ?? '…'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.bail.occupation_gratuite
                      ? 'Gratuit'
                      : formatEuro(r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0))}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/baux/${r.bail.id}`)}
                      className="text-xs text-primary-600 hover:underline dark:text-primary-500"
                    >
                      Fiche bail
                    </button>
                  </td>
                </tr>
              ))}
              {bauxTries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Aucun bail rattaché à ce bien.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Documents du bien */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Documents du bien ({docs.length}) — diagnostics, travaux, taxe foncière…
          </h2>
          <button
            onClick={() => void joindre()}
            disabled={docEnCours}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {docEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Joindre
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aucun document rattaché au bien (indépendamment des locataires).
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
                        .then(() => ipc.documents.listByBien(bienId))
                        .then(setDocs)
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
      </section>
    </div>
  )
}
