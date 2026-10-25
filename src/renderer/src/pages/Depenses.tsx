import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Coins, Loader2 } from 'lucide-react'
import type { CategorieDepense, Depense } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatDate } from '../lib/format'

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

const CATEGORIES: { valeur: CategorieDepense; libelle: string }[] = [
  { valeur: 'travaux', libelle: 'Travaux' },
  { valeur: 'reparations', libelle: 'Réparations' },
  { valeur: 'assurance_pno', libelle: 'Assurance PNO' },
  { valeur: 'taxe_fonciere', libelle: 'Taxe foncière' },
  { valeur: 'charges_non_recuperables', libelle: 'Charges non récupérables' },
  { valeur: 'frais_agence', libelle: 'Frais d’agence' },
  { valeur: 'autre', libelle: 'Autre' }
]

function libelleCategorie(c: string): string {
  return CATEGORIES.find((x) => x.valeur === c)?.libelle ?? c
}

export function Depenses(): React.JSX.Element {
  const { locations, refresh } = useStore()

  const [docs, setDocs] = useState<Depense[]>([])
  const [annee, setAnnee] = useState<string>(String(new Date().getFullYear()))
  const [categorieFiltre, setCategorieFiltre] = useState<string>('')
  const [enCours, setEnCours] = useState(false)

  // Formulaire
  const [bienId, setBienId] = useState<string>('')
  const [categorie, setCategorie] = useState<CategorieDepense>('travaux')
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const recharger = (): Promise<void> =>
    ipc.depenses
      .list()
      .then(setDocs)
      .catch(() => setDocs([]))

  useEffect(() => {
    void recharger()
  }, [])

  const filtres = useMemo(() => {
    return docs.filter(
      (d) =>
        (annee === '' || d.date_depense?.startsWith(annee)) &&
        (categorieFiltre === '' || d.categorie === categorieFiltre)
    )
  }, [docs, annee, categorieFiltre])

  const totalFiltre = filtres.reduce((s, d) => s + d.montant, 0)
  const totalAnnee = docs
    .filter((d) => d.date_depense?.startsWith(String(new Date().getFullYear())))
    .reduce((s, d) => s + d.montant, 0)

  const montantNum = parseFloat(montant.replace(',', '.'))
  const montantInvalide = montant.trim() !== '' && (isNaN(montantNum) || montantNum <= 0)

  const ajouter = async (): Promise<void> => {
    const m = montantNum
    if (isNaN(m) || m <= 0) return
    setEnCours(true)
    try {
      await ipc.depenses.create({
        bien_id: bienId ? Number(bienId) : null,
        categorie,
        montant: m,
        date_depense: date || null,
        notes: notes.trim() || null
      })
      setMontant('')
      setNotes('')
      await recharger()
      await refresh()
    } finally {
      setEnCours(false)
    }
  }

  const supprimer = async (id: number): Promise<void> => {
    await ipc.depenses.remove(id)
    await recharger()
    await refresh()
  }

  const bienDesignation = (bienId: number | null): string =>
    locations.find((r) => r.bien.id === bienId)?.bien.designation ?? '—'

  // Totaux par catégorie pour l'année sélectionnée
  const parCategorie = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of filtres) {
      map.set(d.categorie, (map.get(d.categorie) ?? 0) + d.montant)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filtres])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Dépenses</h1>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Total {new Date().getFullYear()} :{' '}
          <strong className="text-red-600 dark:text-red-400">{formatEuro(totalAnnee)}</strong>
        </div>
      </div>

      {/* Ajout */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-primary-500" /> Nouvelle dépense
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bien</span>
            <select value={bienId} onChange={(e) => setBienId(e.target.value)} className={inputCls}>
              <option value="">— Aucun / global —</option>
              {locations.map((r) => (
                <option key={r.bien.id} value={r.bien.id}>
                  {r.bien.designation}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Catégorie</span>
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as CategorieDepense)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c.valeur} value={c.valeur}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Montant (€)</span>
            <input
              type="number"
              step="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Notes</span>
            <div className="flex gap-2">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
              <button
                onClick={() => void ajouter()}
                disabled={enCours || montant.trim() === '' || montantInvalide}
                aria-label="Ajouter la dépense"
                title={montantInvalide ? 'Le montant doit être un nombre positif' : 'Ajouter la dépense'}
                className="shrink-0 rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40"
              >
                {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          </label>
        </div>
        {montantInvalide && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Le montant doit être un nombre positif (ex : 120 ou 120,50).
          </p>
        )}
      </div>

      {/* Filtres + totaux */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={annee}
          onChange={(e) => setAnnee(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Toutes les années</option>
          {[...new Set(docs.map((d) => d.date_depense?.slice(0, 4)).filter(Boolean))]
            .sort((a, b) => (b ?? '').localeCompare(a ?? ''))
            .map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
        </select>
        <select
          value={categorieFiltre}
          onChange={(e) => setCategorieFiltre(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {filtres.length} dépense(s) — total :{' '}
          <strong>{formatEuro(totalFiltre)}</strong>
        </span>
        {parCategorie.length > 0 && (
          <span className="text-xs text-slate-400">
            {parCategorie.map(([c, v]) => `${libelleCategorie(c)} ${formatEuro(v)}`).join(' · ')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Bien</th>
              <th className="px-4 py-2">Catégorie</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2 text-right">Montant</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtres.map((d) => (
              <tr key={d.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-2">{formatDate(d.date_depense)}</td>
                <td className="px-4 py-2">{bienDesignation(d.bien_id)}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                    {libelleCategorie(d.categorie)}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{d.notes ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium text-red-600 dark:text-red-400">
                  −{formatEuro(d.montant)}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => void supprimer(d.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtres.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  Aucune dépense enregistrée. Saisis tes travaux, taxe foncière, assurance…
                  pour calculer la rentabilité réelle.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
