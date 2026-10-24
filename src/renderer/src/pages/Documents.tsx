import { useState, useEffect } from 'react'
import { FolderOpen, FileUp, ExternalLink, Trash2, Loader2, FileText } from 'lucide-react'
import type { TypeDocument, DocumentRow } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatDate } from '../lib/format'

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

const TYPES_DOC: { valeur: TypeDocument; libelle: string }[] = [
  { valeur: 'bail', libelle: 'Contrat de bail' },
  { valeur: 'etat_des_lieux_entree', libelle: 'État des lieux — entrée' },
  { valeur: 'etat_des_lieux_sortie', libelle: 'État des lieux — sortie' },
  { valeur: 'assurance', libelle: 'Assurance locative' },
  { valeur: 'autre', libelle: 'Autre' }
]

function libelleType(type: string): string {
  return TYPES_DOC.find((t) => t.valeur === type)?.libelle ?? type
}

/** Taille lisible (Ko / Mo). */
function formatTaille(octets: number | null): string {
  if (!octets) return '—'
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

export function Documents(): React.JSX.Element {
  const { locations } = useStore()
  const baux = locations // tous les baux (actifs ou non) : les documents y restent rattachés

  const [bailId, setBailId] = useState<string>('')
  const [typeDoc, setTypeDoc] = useState<TypeDocument>('bail')
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [enCours, setEnCours] = useState(false)

  const recharger = async (id: number): Promise<void> => {
    try {
      setDocs(await ipc.documents.list(id))
    } catch {
      setDocs([])
    }
  }

  useEffect(() => {
    if (!bailId) {
      setDocs([])
      return
    }
    void recharger(Number(bailId))
  }, [bailId])

  const attacher = async (): Promise<void> => {
    if (!bailId) return
    setEnCours(true)
    try {
      await ipc.documents.attach(Number(bailId), typeDoc)
      await recharger(Number(bailId))
    } catch (err) {
      // Dialog annulé : pas d'erreur à montrer.
      if (!(err instanceof Error && err.message.includes('cancel'))) console.error(err)
    } finally {
      setEnCours(false)
    }
  }

  const ouvrir = async (id: number): Promise<void> => {
    try {
      await ipc.documents.open(id)
    } catch (err) {
      console.error(err)
    }
  }

  const supprimer = async (id: number): Promise<void> => {
    try {
      await ipc.documents.remove(id)
      await recharger(Number(bailId))
    } catch (err) {
      console.error(err)
    }
  }

  const row = baux.find((r) => r.bail.id === Number(bailId))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Documents</h1>

      {/* Ajout */}
      <div className="max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Bail concerné
            </span>
            <select value={bailId} onChange={(e) => setBailId(e.target.value)} className={inputCls}>
              <option value="">— Sélectionner un bail —</option>
              {baux.map((r) => (
                <option key={r.bail.id} value={r.bail.id}>
                  {r.bien.designation} — {r.locataire.nom_complet}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Type de document
            </span>
            <select
              value={typeDoc}
              onChange={(e) => setTypeDoc(e.target.value as TypeDocument)}
              className={inputCls}
            >
              {TYPES_DOC.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={() => void attacher()}
          disabled={!bailId || enCours}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Joindre un fichier (PDF, image, Word)
        </button>
        <p className="text-xs text-slate-400">
          Les fichiers sont copiés dans le dossier de données de l'application —
          l'original reste où il est, vous pouvez le déplacer sans risque.
        </p>
      </div>

      {/* Liste des documents du bail sélectionné */}
      {row && (
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <FolderOpen className="h-4 w-4" /> Documents — {row.bien.designation} (
            {row.locataire.nom_complet})
          </h2>
          {docs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
              Aucun document pour ce bail. Joignez le contrat, les états des lieux,
              l'assurance…
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Fichier</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Taille</th>
                    <th className="px-4 py-2">Ajouté le</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="flex items-center gap-2 px-4 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        {d.nom_original}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                          {libelleType(d.type_document)}
                        </span>
                      </td>
                      <td className="px-4 py-2">{formatTaille(d.taille_octets)}</td>
                      <td className="px-4 py-2">{formatDate(d.created_at.slice(0, 10))}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => void ouvrir(d.id)}
                            title="Ouvrir"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void supprimer(d.id)}
                            title="Supprimer"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!bailId && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
          Sélectionnez un bail pour voir et ajouter ses documents.
        </p>
      )}
    </div>
  )
}
