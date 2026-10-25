import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, Search, Home } from 'lucide-react'
import type { TypeBien, CreateBienInput, CreateLocataireInput, CreateBailInput } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro, formatSurface, formatDate } from '../lib/format'

const TYPES_BIEN: TypeBien[] = ['Appartement', 'Maison', 'Garage', 'Parking', 'Local', 'Studio', 'Autre']

// --- Champs de formulaire (fusion bien + locataire + bail) ---
interface FormState {
  // Bien
  type_bien: TypeBien
  designation: string
  adresse: string
  code_postal: string
  ville: string
  surface_m2: string
  meuble: boolean
  valeur_venale: string
  dpe: string
  // Locataire
  nom_complet: string
  email: string
  telephone: string
  // Bail
  date_debut_bail: string
  date_fin_bail: string
  trimestre_ref_num: string
  trimestre_ref_annee: string
  loyer_hc: string
  charges: string
  loyer_metre_carre_hc: string
  irl_reference: string
  irl_nouveau: string
  taux_irl: string
  nouveau_loyer_hc: string
  frais_agence: string
  actif: boolean
  occupation_gratuite: boolean
  depot_garantie: string
  type_charges: string
}

const FORM_VIDE: FormState = {
  type_bien: 'Appartement',
  designation: '',
  adresse: '',
  code_postal: '',
  ville: '',
  surface_m2: '',
  meuble: false,
  valeur_venale: '',
  dpe: '',
  nom_complet: '',
  email: '',
  telephone: '',
  date_debut_bail: '',
  date_fin_bail: '',
  trimestre_ref_num: '',
  trimestre_ref_annee: '',
  loyer_hc: '',
  charges: '',
  loyer_metre_carre_hc: '',
  irl_reference: '',
  irl_nouveau: '',
  taux_irl: '',
  nouveau_loyer_hc: '',
  frais_agence: '',
  actif: true,
  occupation_gratuite: false,
  depot_garantie: '',
  type_charges: ''
}

function num(v: string): number | null {
  if (v.trim() === '') return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

function str(v: string): string | null {
  return v.trim() === '' ? null : v.trim()
}

/** Champs de formulaire réutilisables. */
function Field({
  label,
  children,
  className = ''
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900'

export function BiensLocataires(): React.JSX.Element {
  const { locations, refresh, loading } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [recherche, setRecherche] = useState('')
  const [filtreActif, setFiltreActif] = useState<string>('tous')
  const [formOuvert, setFormOuvert] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VIDE)
  const [erreur, setErreur] = useState<string | null>(null)
  const [suppression, setSuppression] = useState<number | null>(null)

  const FILTRES = [
    { id: 'tous', label: 'Tous' },
    { id: 'appartements', label: 'Appartements' },
    { id: 'garages', label: 'Garages / parkings' },
    { id: 'fin_proche', label: 'Fin < 6 mois' },
    { id: 'gratuits', label: 'Occupation gratuite' },
    { id: 'vacants', label: 'Sans loyer' }
  ]

  const filtres = useMemo(() => {
    const q = recherche.toLowerCase()
    return locations.filter((r) => {
      if (
        q &&
        !r.bien.designation.toLowerCase().includes(q) &&
        !r.locataire.nom_complet.toLowerCase().includes(q) &&
        !r.bien.ville?.toLowerCase().includes(q)
      ) {
        return false
      }
      switch (filtreActif) {
        case 'appartements':
          return r.bien.type_bien === 'Appartement' || r.bien.type_bien === 'Studio'
        case 'garages':
          return r.bien.type_bien === 'Garage' || r.bien.type_bien === 'Parking'
        case 'fin_proche':
          return r.jours_avant_fin_bail !== null && r.jours_avant_fin_bail < 180
        case 'gratuits':
          return r.bail.occupation_gratuite
        case 'vacants':
          return !r.bail.occupation_gratuite && r.bail.loyer_cc === null && r.bail.loyer_hc === null
        default:
          return true
      }
    })
  }, [locations, recherche, filtreActif])

  // Ctrl+N depuis n'importe quelle page : ouvre le formulaire de création.
  const openNewDemande = (location.state as { openNew?: boolean } | null)?.openNew
  const [formOuvertInit, setFormOuvertInit] = useState(false)
  if (openNewDemande && !formOuvertInit) {
    setFormOuvertInit(true)
    setForm(FORM_VIDE)
    setEditId(null)
    setFormOuvert(true)
  }

  const ouvrirCreation = (): void => {
    setForm(FORM_VIDE)
    setEditId(null)
    setErreur(null)
    setFormOuvert(true)
  }

  const ouvrirEdition = (bailId: number): void => {
    const row = locations.find((r) => r.bail.id === bailId)
    if (!row) return
    setForm({
      type_bien: row.bien.type_bien as TypeBien,
      designation: row.bien.designation,
      adresse: row.bien.adresse ?? '',
      code_postal: row.bien.code_postal ?? '',
      ville: row.bien.ville ?? '',
      surface_m2: row.bien.surface_m2?.toString() ?? '',
      meuble: row.bien.meuble,
      valeur_venale: row.bien.valeur_venale?.toString() ?? '',
      dpe: row.bien.dpe ?? '',
      nom_complet: row.locataire.nom_complet,
      email: row.locataire.email ?? '',
      telephone: row.locataire.telephone ?? '',
      date_debut_bail: row.bail.date_debut_bail ?? '',
      date_fin_bail: row.bail.date_fin_bail ?? '',
      trimestre_ref_num: (() => {
        const m = (row.bail.trimestre_reference ?? '').match(/[1234]/)
        return m ? m[0] : ''
      })(),
      trimestre_ref_annee: (() => {
        const m = (row.bail.trimestre_reference ?? '').match(/(19|20)\d{2}/)
        return m ? m[0] : ''
      })(),
      loyer_hc: row.bail.loyer_hc?.toString() ?? '',
      charges: row.bail.charges?.toString() ?? '',
      loyer_metre_carre_hc: row.bail.loyer_metre_carre_hc?.toString() ?? '',
      irl_reference: row.bail.irl_reference?.toString() ?? '',
      irl_nouveau: row.bail.irl_nouveau?.toString() ?? '',
      taux_irl: row.bail.taux_irl?.toString() ?? '',
      nouveau_loyer_hc: row.bail.nouveau_loyer_hc?.toString() ?? '',
      frais_agence: row.bail.frais_agence?.toString() ?? '',
      actif: row.bail.actif,
      occupation_gratuite: row.bail.occupation_gratuite,
      depot_garantie: row.bail.depot_garantie?.toString() ?? '',
      type_charges: row.bail.type_charges ?? ''
    })
    setEditId(bailId)
    setErreur(null)
    setFormOuvert(true)
  }

  const enregistrer = async (): Promise<void> => {
    if (!form.designation.trim() || !form.nom_complet.trim()) {
      setErreur('La désignation du bien et le nom du locataire sont obligatoires.')
      return
    }
    try {
      const bienInput: CreateBienInput = {
        type_bien: form.type_bien,
        designation: form.designation.trim(),
        adresse: str(form.adresse),
        code_postal: str(form.code_postal),
        ville: str(form.ville),
        surface_m2: num(form.surface_m2),
        meuble: form.meuble,
        valeur_venale: num(form.valeur_venale),
        valeur_venale_date: num(form.valeur_venale) !== null ? new Date().toISOString().slice(0, 10) : null,
        dpe: form.dpe.trim() || null
      }
      const locataireInput: CreateLocataireInput = {
        nom_complet: form.nom_complet.trim(),
        email: str(form.email),
        telephone: str(form.telephone)
      }
      const bailInput: CreateBailInput = {
        bien_id: 0, // rempli ci-dessous
        locataire_id: 0,
        date_debut_bail: str(form.date_debut_bail),
        date_fin_bail: str(form.date_fin_bail),
        trimestre_reference:
          form.trimestre_ref_num && form.trimestre_ref_annee
            ? `T${form.trimestre_ref_num} ${form.trimestre_ref_annee}`
            : null,
        loyer_hc: num(form.loyer_hc),
        charges: num(form.charges),
        loyer_cc:
          num(form.loyer_hc) !== null
            ? (num(form.loyer_hc) ?? 0) + (num(form.charges) ?? 0)
            : null,
        loyer_metre_carre_hc: num(form.loyer_metre_carre_hc),
        loyer_annuel_hc: num(form.loyer_hc) !== null ? (num(form.loyer_hc) ?? 0) * 12 : null,
        loyer_annuel_cc:
          num(form.loyer_hc) !== null
            ? ((num(form.loyer_hc) ?? 0) + (num(form.charges) ?? 0)) * 12
            : null,
        irl_reference: num(form.irl_reference),
        irl_nouveau: num(form.irl_nouveau),
        // Taux TOUJOURS recalculé de la paire (jamais saisi) :
        taux_irl: (() => {
          const ref = num(form.irl_reference)
          const nouv = num(form.irl_nouveau)
          return ref && nouv && ref > 0
            ? Math.round((nouv / ref - 1) * 100000) / 1000
            : null
        })(),
        nouveau_loyer_hc: num(form.nouveau_loyer_hc),
        frais_agence: num(form.frais_agence),
        actif: form.actif,
        // Occupation gratuite : aucun loyer n'est dû, tous les montants à null.
        occupation_gratuite: form.occupation_gratuite,
        depot_garantie: num(form.depot_garantie),
        type_charges: form.type_charges || null
      }
      if (form.occupation_gratuite) {
        bailInput.loyer_hc = null
        bailInput.charges = null
        bailInput.loyer_cc = null
        bailInput.loyer_metre_carre_hc = null
        bailInput.loyer_annuel_hc = null
        bailInput.loyer_annuel_cc = null
        bailInput.nouveau_loyer_hc = null
        bailInput.frais_agence = null
        bailInput.irl_reference = null
        bailInput.irl_nouveau = null
        bailInput.taux_irl = null
      }

      if (editId === null) {
        // Détection de doublon de locataire (nom normalisé : casse/espaces/points).
        const normalise = (n: string): string =>
          n.toLowerCase().replace(/[.\s-]/g, '')
        const doublon = locations.find(
          (r) => normalise(r.locataire.nom_complet) === normalise(form.nom_complet.trim())
        )
        if (
          doublon &&
          !confirm(
            `Un locataire au nom proche existe déjà : « ${doublon.locataire.nom_complet} » (${doublon.bien.designation}).

` +
              'OK = créer quand même (deux personnes distinctes) — Annuler = vérifier.'
          )
        ) {
          return
        }
        // Création : bien -> locataire -> bail (avec les ids générés).
        const bien = (await ipc.biens.create(bienInput)) as { id: number }
        const locataire = (await ipc.locataires.create(locataireInput)) as { id: number }
        await ipc.baux.create({ ...bailInput, bien_id: bien.id, locataire_id: locataire.id })
      } else {
        // Édition : on met à jour les 3 entités du bail concerné.
        const row = locations.find((r) => r.bail.id === editId)
        if (!row) throw new Error('Bail introuvable')
        await ipc.biens.update(row.bien.id, bienInput)
        await ipc.locataires.update(row.locataire.id, locataireInput)
        await ipc.baux.update(editId, bailInput)
      }
      setFormOuvert(false)
      await refresh()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  const confirmerSuppression = async (): Promise<void> => {
    if (suppression === null) return
    try {
      // Supprimer le bail uniquement (bien + locataire restent réutilisables).
      await ipc.baux.remove(suppression)
      setSuppression(null)
      await refresh()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Biens &amp; Locataires</h1>
        <button
          onClick={ouvrirCreation}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" /> Nouveau bail
        </button>
      </div>

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Rechercher (bien, locataire, ville)…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className={`${inputCls} pl-9`}
        />
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-wrap gap-1.5">
        {FILTRES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltreActif(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filtreActif === f.id
                ? 'bg-primary-600 text-white'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Bien</th>
              <th className="px-4 py-2">Locataire</th>
              <th className="px-4 py-2">Surface</th>
              <th className="px-4 py-2 text-right">Loyer HC</th>
              <th className="px-4 py-2 text-right">Charges</th>
              <th className="px-4 py-2 text-right">Loyer CC</th>
              <th className="px-4 py-2">Fin bail</th>
              <th className="px-4 py-2">IRL</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtres.map((r) => (
              <tr
                key={r.bail.id}
                className={`border-t border-slate-200 dark:border-slate-800 ${!r.bail.actif ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                    {r.bien.type_bien}
                  </span>
                  {r.bien.dpe && (
                    <span
                      title="Classe énergétique (DPE)"
                      className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${
                        ['A', 'B', 'C'].includes(r.bien.dpe)
                          ? 'bg-emerald-500'
                          : r.bien.dpe === 'D'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                    >
                      {r.bien.dpe}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-medium">
                  <button
                    onClick={() => navigate(`/baux/${r.bail.id}`)}
                    title="Voir la fiche détaillée"
                    className="hover:text-primary-600 hover:underline"
                  >
                    {r.bien.designation}
                  </button>
                  {r.bail.occupation_gratuite && (
                    <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                      Gratuit
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{r.locataire.nom_complet}</td>
                <td className="px-4 py-2">{formatSurface(r.bien.surface_m2)}</td>
                <td className="px-4 py-2 text-right">{formatEuro(r.bail.loyer_hc)}</td>
                <td className="px-4 py-2 text-right">{formatEuro(r.bail.charges)}</td>
                <td className="px-4 py-2 text-right font-medium">
                  {formatEuro(r.bail.loyer_cc)}
                </td>
                <td className="px-4 py-2">
                  {formatDate(r.bail.date_fin_bail)}
                  {r.jours_avant_fin_bail !== null && (r.jours_avant_fin_bail ?? 0) < 90 && (
                    <span className="ml-1 text-xs font-semibold text-red-500">
                      ⚠ {r.jours_avant_fin_bail} j
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.bail.taux_irl !== null ? `${r.bail.taux_irl} %` : '—'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => navigate(`/biens/${r.bien.id}`)}
                      title="Voir la fiche du bien (historique locataires)"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"
                    >
                      <Home className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => ouvrirEdition(r.bail.id)}
                      title="Modifier"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setSuppression(r.bail.id)}
                      title="Supprimer le bail"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtres.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  {loading
                    ? 'Chargement…'
                    : locations.length === 0
                      ? 'Aucun bail enregistré. Cliquez sur « Nouveau bail » pour commencer.'
                      : 'Aucun résultat pour cette recherche.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Modal formulaire (création / édition) ---- */}
      {formOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editId === null ? 'Nouveau bail' : 'Modifier le bail'}
              </h2>
              <button
                onClick={() => setFormOuvert(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {erreur && (
              <p className="mb-4 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {erreur}
              </p>
            )}

            {/* Section Bien */}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Le bien
            </h3>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Type de bien">
                <select
                  value={form.type_bien}
                  onChange={(e) => setForm({ ...form, type_bien: e.target.value as TypeBien })}
                  className={inputCls}
                >
                  {TYPES_BIEN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Désignation *" className="col-span-2">
                <input
                  className={inputCls}
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="ex : Appartement T3 centre-ville"
                />
              </Field>
              <Field label="Meublé">
                <label className="flex h-[34px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.meuble}
                    onChange={(e) => setForm({ ...form, meuble: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  Oui
                </label>
              </Field>
              <Field label="Adresse" className="col-span-2">
                <input
                  className={inputCls}
                  value={form.adresse}
                  onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                />
              </Field>
              <Field label="Code postal">
                <input
                  className={inputCls}
                  value={form.code_postal}
                  onChange={(e) => setForm({ ...form, code_postal: e.target.value })}
                />
              </Field>
              <Field label="Ville">
                <input
                  className={inputCls}
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                />
              </Field>
              <Field label="Surface (m²)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.1"
                  value={form.surface_m2}
                  onChange={(e) => setForm({ ...form, surface_m2: e.target.value })}
                />
              </Field>
              <Field label="Valeur vénale estimée (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="1"
                  value={form.valeur_venale}
                  onChange={(e) => setForm({ ...form, valeur_venale: e.target.value })}
                  placeholder="pour la rentabilité"
                />
              </Field>
              <Field label="DPE (classe énergétique)">
                <select
                  value={form.dpe}
                  onChange={(e) => setForm({ ...form, dpe: e.target.value })}
                  className={inputCls}
                >
                  <option value="">— Inconnu —</option>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Section Locataire */}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Le locataire
            </h3>
            <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Nom complet *">
                <input
                  className={inputCls}
                  value={form.nom_complet}
                  onChange={(e) => setForm({ ...form, nom_complet: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputCls}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Téléphone">
                <input
                  className={inputCls}
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                />
              </Field>
            </div>

            {/* Section Bail */}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Le bail &amp; le loyer
            </h3>
            <fieldset disabled={form.occupation_gratuite} className="grid grid-cols-2 gap-3 md:grid-cols-4 disabled:opacity-50">
              <Field label="Début du bail">
                <input
                  className={inputCls}
                  type="date"
                  value={form.date_debut_bail}
                  onChange={(e) => setForm({ ...form, date_debut_bail: e.target.value })}
                />
              </Field>
              <Field label="Fin du bail">
                <input
                  className={inputCls}
                  type="date"
                  value={form.date_fin_bail}
                  onChange={(e) => setForm({ ...form, date_fin_bail: e.target.value })}
                />
              </Field>
              <Field label="Trimestre de référence IRL">
                <div className="flex gap-1">
                  <select
                    value={form.trimestre_ref_num}
                    onChange={(e) => setForm({ ...form, trimestre_ref_num: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">T…</option>
                    {['1', '2', '3', '4'].map((t) => (
                      <option key={t} value={t}>
                        T{t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.trimestre_ref_annee}
                    onChange={(e) => setForm({ ...form, trimestre_ref_annee: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Année…</option>
                    {Array.from({ length: 22 }, (_, i) => String(2026 - i)).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Bail actif">
                <label className="flex h-[34px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  En cours
                </label>
              </Field>
              <Field label="Occupation gratuite" className="col-span-2">
                <label className="flex h-[34px] items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.occupation_gratuite}
                    onChange={(e) => setForm({ ...form, occupation_gratuite: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  Occupé sans loyer (famille…) — exclut des loyers, quittances et alertes
                </label>
              </Field>
              <Field label="Loyer HC (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.loyer_hc}
                  onChange={(e) => setForm({ ...form, loyer_hc: e.target.value })}
                />
              </Field>
              <Field label="Charges (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.charges}
                  onChange={(e) => setForm({ ...form, charges: e.target.value })}
                />
              </Field>
              <Field label="Loyer HC / m² (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.loyer_metre_carre_hc}
                  onChange={(e) => setForm({ ...form, loyer_metre_carre_hc: e.target.value })}
                />
              </Field>
              <Field label="Dépôt de garantie (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.depot_garantie}
                  onChange={(e) => setForm({ ...form, depot_garantie: e.target.value })}
                />
              </Field>
              <Field label="Type de charges">
                <select
                  value={form.type_charges}
                  onChange={(e) => setForm({ ...form, type_charges: e.target.value })}
                  className={inputCls}
                >
                  <option value="">— Non précisé —</option>
                  <option value="forfaitaires">Forfaitaires</option>
                  <option value="provisionnelles">Provisionnelles (régularisation annuelle)</option>
                </select>
              </Field>
              <Field label="Frais agence (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.frais_agence}
                  onChange={(e) => setForm({ ...form, frais_agence: e.target.value })}
                />
              </Field>
              <Field label="IRL de référence">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.irl_reference}
                  onChange={(e) => setForm({ ...form, irl_reference: e.target.value })}
                />
              </Field>
              <Field label="IRL nouveau">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.irl_nouveau}
                  onChange={(e) => setForm({ ...form, irl_nouveau: e.target.value })}
                />
              </Field>
              <Field label="Taux IRL (%) — calculé">
                <input
                  className={`${inputCls} bg-slate-50 dark:bg-slate-800`}
                  type="number"
                  step="0.001"
                  value={form.taux_irl}
                  disabled
                  title="Recalculé automatiquement à partir des IRL de référence et nouveau"
                />
              </Field>
              <Field label="Nouveau loyer HC (€)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.nouveau_loyer_hc}
                  onChange={(e) => setForm({ ...form, nouveau_loyer_hc: e.target.value })}
                />
              </Field>
            </fieldset>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setFormOuvert(false)}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={() => void enregistrer()}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {editId === null ? 'Créer le bail' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Confirmation suppression ---- */}
      {suppression !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-2 text-lg font-bold">Supprimer ce bail ?</h2>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Le contrat et son historique de paiements seront supprimés. Le bien et le
              locataire restent enregistrés.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSuppression(null)}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={() => void confirmerSuppression()}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
