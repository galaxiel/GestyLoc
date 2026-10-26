import { useEffect, useMemo, useState } from 'react'
import { Loader2, Scale, TrendingUp } from 'lucide-react'
import { simulerRattrapageIrl, type BailPourSimulation } from '@shared/stats'
import { nomBien } from '@shared/labels'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import { formatEuro } from '../lib/format'

const inputCls =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900'

/**
 * Simulateur — scénarios PURS (aucune écriture en base).
 *  A. Rattrapage IRL : « et si j'avais révisé chaque année ? »
 *     ⚠ Garde-fou : la révision n'est PAS rétroactive — le scénario mesure une
 *     renonciation passée, pas une créance. Application possible uniquement à
 *     la prochaine échéance annuelle.
 *  B. Seuil micro-BIC vs réel (LMNP) : réel devient favorable quand les charges
 *     dépassent 50 % des recettes (hors amortissement, qui rend le réel encore
 *     plus favorable que montré).
 */
export function Simulateur(): React.JSX.Element {
  const { locations } = useStore()
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)

  // --- Paramètres modèle A ---
  const [anneeDepart, setAnneeDepart] = useState(2019)
  const [tauxFixe, setTauxFixe] = useState<string>('')
  const [irlHistory, setIrlHistory] = useState<Map<string, number> | null>(null)
  const [irlErreur, setIrlErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    void ipc.indices
      .fetchHistory('IRL')
      .then((res) => {
        if (res.erreur || res.valeurs.length === 0) {
          setIrlErreur(res.erreur ?? 'Aucune donnée')
        } else {
          const map = new Map<string, number>()
          for (const v of res.valeurs) map.set(v.periode.replace('-T', '-Q'), v.valeur)
          setIrlHistory(map)
        }
      })
      .catch((e) => setIrlErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
  }, [])

  const bauxSimulables: BailPourSimulation[] = useMemo(
    () =>
      bauxPayants
        .filter((r) => r.bail.loyer_hc !== null && r.bail.date_debut_bail)
        .map((r) => ({
          bailId: r.bail.id,
          designation: r.bien.designation,
          locataire: r.locataire.nom_complet,
          typeBien: r.bien.type_bien,
          adresse: [r.bien.adresse, r.bien.ville].filter(Boolean).join(', '),
          loyerHcActuel: r.bail.loyer_hc ?? 0,
          dateDebutBail: r.bail.date_debut_bail!,
          trimestreRef: r.bail.trimestre_reference
        })),
    [bauxPayants]
  )

  const tauxFixeNum = parseFloat(tauxFixe.replace(',', '.'))
  const resultats = useMemo(
    () =>
      simulerRattrapageIrl(
        bauxSimulables,
        anneeDepart,
        tauxFixeNum > 0 ? null : irlHistory,
        tauxFixeNum > 0 ? tauxFixeNum : null
      ),
    [bauxSimulables, anneeDepart, irlHistory, tauxFixeNum]
  )

  const typesParBail = new Map(
    locations.map((r) => [r.bail.id, r.bien.type_bien])
  )
  const nomsParBail = new Map(locations.map((r) => [r.bail.id, nomBien(r.bien)]))
  const adressesUniquesParBail = new Map(
    locations.map((r) => {
      // On dédoublonne : adresse/ville identiques à la désignation = redondants
      const parties = [r.bien.adresse, r.bien.code_postal, r.bien.ville]
        .filter((x, i, tab) => x && x !== r.bien.designation && tab.indexOf(x) === i)
      const valeur = parties.join(', ')
      return [r.bail.id, valeur !== '' && valeur !== r.bien.designation ? valeur : null]
    })
  )

  const totalDeltaAn = Math.round(
    resultats.reduce((s, r) => s + r.deltaAn, 0) * 100
  ) / 100
  const totalLoyerActuel = resultats.reduce((s, r) => s + r.loyerActuel, 0)
  const totalLoyerSimule = resultats.reduce((s, r) => s + r.loyerSimule, 0)
  const tries = [...resultats].sort((a, b) => b.deltaAn - a.deltaAn)

  // --- Modèle B : seuil micro-BIC vs réel pour les MEUBLÉS ---
  const meubles = locations.filter(
    (r) => r.bien.meuble && r.bail.actif && !r.bail.occupation_gratuite
  )
  const annee = String(new Date().getFullYear())

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Simulateur</h1>

      {/* ===== Modèle A : rattrapage IRL ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          A. Rattrapage IRL — « et si j'avais révisé chaque année ? »
        </h2>

        <p className="text-xs text-slate-400">
          ⚠ Simulation à titre indicatif : la révision du loyer n'est pas rétroactive —
          ce scénario mesure une renonciation passée, pas une créance. Pour appliquer
          une révision : fiche du bail (prochaine échéance annuelle légale).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Année de départ :
            <select
              value={anneeDepart}
              onChange={(e) => setAnneeDepart(Number(e.target.value))}
              className={inputCls}
            >
              {Array.from({ length: 18 }, (_, i) => 2026 - i).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Indice :
            {chargement ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : irlHistory && !irlErreur ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                IRL réel INSEE ({irlHistory.size} trimestres)
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                INSEE indisponible ({irlErreur}) — utiliser un taux fixe
              </span>
            )}
          </label>
          <label className="flex items-center gap-2 text-sm">
            ou taux fixe %/an :
            <input
              value={tauxFixe}
              onChange={(e) => setTauxFixe(e.target.value)}
              placeholder="ex : 1,5"
              className={`${inputCls} w-24`}
            />
          </label>
        </div>

        {/* Résultats agrégés */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950">
            <div className="text-xs text-slate-400">Loyer HC actuel</div>
            <div className="text-lg font-bold">{formatEuro(totalLoyerActuel)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950">
            <div className="text-xs text-slate-400">Loyer simulé</div>
            <div className="text-lg font-bold">{formatEuro(totalLoyerSimule)}</div>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <div className="text-xs text-emerald-600 dark:text-emerald-400">
              Manque à gagner / an (renonciation)
            </div>
            <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {formatEuro(totalDeltaAn)}
            </div>
          </div>
        </div>

        {/* Détail par bail */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Bien</th>
                <th className="px-4 py-2">Locataire</th>
                <th className="px-4 py-2">Adresse</th>
                <th className="px-4 py-2 text-right">HC actuel</th>
                <th className="px-4 py-2 text-right">HC simulé</th>
                <th className="px-4 py-2 text-right">Δ / mois</th>
                <th className="px-4 py-2 text-right">Δ / an</th>
                <th className="px-4 py-2 text-center">Révisions</th>
              </tr>
            </thead>
            <tbody>
              {tries.map((r) => (
                <tr key={r.bailId} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {typesParBail.get(r.bailId)}
                      </span>
                      {nomsParBail.get(r.bailId)}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-300 dark:text-slate-200">
                    {r.locataire}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {adressesUniquesParBail.get(r.bailId) ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right">{formatEuro(r.loyerActuel)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatEuro(r.loyerSimule)}</td>
                  <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400">
                    +{formatEuro(r.deltaMois)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-amber-700 dark:text-amber-300">
                    +{formatEuro(r.deltaAn)}
                  </td>
                  <td className="px-4 py-2 text-center text-xs text-slate-400">
                    {r.revisionsJouees} manquée(s)
                  </td>
                </tr>
              ))}
              {tries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Aucun bail simulable (loyer ou date de début manquants).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Modèle B : seuil LMNP / micro-BIC ===== */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Scale className="h-4 w-4" /> B. Seuil micro-BIC vs réel (biens meublés / LMNP)
        </h2>
        {meubles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aucun bien meublé loué — ce comparateur devient utile quand tu en auras un.
          </p>
        ) : (
          <div className="space-y-2">
            {meubles.map((r) => {
              const bailId = r.bail.id
              const recettes = Number(
                (
                  r.bail.loyer_cc ??
                  (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)
                ).toFixed(2)
              ) * 12
              // Charges déductibles du bien meublé sur l'année en cours
              void bailId
              const charges = 0 // calculé ci-dessous via les dépenses
              void charges
              return (
                <SeuilLmnp key={bailId} designation={r.bien.designation} recettes={recettes} bailId={bailId} annee={annee} />
              )
            })}
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-slate-300 p-2 text-xs text-slate-400 dark:border-slate-700">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
              Le seuil de bascule : le régime réel devient plus favorable dès que les
              charges déductibles dépassent <strong>50 % des recettes</strong> (micro-BIC
              abattement forfaitaire de 50 %). En-dessous, le micro-BIC est plus simple et
              plus avantageux. Ce calcul ignore l'**amortissement** (déductible au réel,
              non encaissé) : le réel est donc en réalité encore plus favorable que
              montré. À confirmer avec ton comptable.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

/** Composant seuil LMNP pour un bien : charges actuelles vs seuil 50 %. */
function SeuilLmnp({
  designation,
  recettes,
  bailId,
  annee
}: {
  designation: string
  recettes: number
  bailId: number
  annee: string
}): React.JSX.Element {
  const [charges, setCharges] = useState<number | null>(null)

  useEffect(() => {
    void ipc.depenses
      .list()
      .then((deps) => {
        setCharges(
          Math.round(
            deps
              .filter(
                (d) => d.bien_id === bailId && d.date_depense?.startsWith(annee)
              )
              .reduce((s, d) => s + d.montant, 0) * 100
          ) / 100
        )
      })
      .catch(() => setCharges(0))
  }, [bailId, annee])

  if (charges === null) {
    return <div className="text-sm text-slate-400">{designation} : chargement…</div>
  }

  const pctRecettes = recettes > 0 ? Math.round((charges / recettes) * 10000) / 100 : 0
  const seuil = Math.round(recettes * 0.5 * 100) / 100
  const reelMeilleur = charges > seuil

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{designation}</div>
          <div className="text-xs text-slate-400">
            Recettes {annee} : {formatEuro(recettes)} · charges déductibles :{' '}
            {formatEuro(charges)} ({pctRecettes} % des recettes)
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400">Seuil de bascule (50 %)</div>
          <div
            className={`text-lg font-bold ${reelMeilleur ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
          >
            {formatEuro(seuil)}
          </div>
        </div>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${reelMeilleur ? 'bg-emerald-500' : 'bg-sky-500'}`}
          style={{ width: `${Math.min((pctRecettes / 100) * 100, 100)}%` }}
        />
        <div
          className="relative -mt-3 h-3 border-l-2 border-slate-400"
          style={{ marginLeft: '50%' }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {reelMeilleur
          ? 'Au-dessus du seuil : le régime réel est probablement plus favorable (comptabiliser les amortissements le rendrait encore plus intéressant).'
          : 'En-dessous du seuil : le micro-BIC (abattement 50 %, zéro comptabilité) reste le plus avantageux. Il te manque ' +
            formatEuro(Math.max(seuil - charges, 0)) +
            ' de charges pour que le réel devienne intéressant.'}
      </p>
    </div>
  )
}
