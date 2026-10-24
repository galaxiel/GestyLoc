import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, TrendingUp, Home, Wallet, Ruler, AlertTriangle, Coins, Percent
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell
} from 'recharts'
import type { Paiement } from '@shared/types'
import { useStore } from '../hooks/useStore'
import { ipc } from '../lib/ipc'
import type { Depense } from '@shared/types'
import { formatEuro, formatPeriode } from '../lib/format'

/** Génère les N dernières périodes 'yyyy-mm', la plus ancienne en premier. */
function periodesPassees(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function KpiCard({
  titre,
  valeur,
  detail,
  icon: Icon,
  couleur
}: {
  titre: string
  valeur: string
  detail?: string
  icon: React.ElementType
  couleur: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">{titre}</span>
        <Icon className={`h-5 w-5 ${couleur}`} />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{valeur}</div>
      {detail && <div className="mt-1 text-xs text-slate-400">{detail}</div>}
    </div>
  )
}

/** Hook : suit le thème de l'OS pour adapter les couleurs des graphiques. */
function useSombre(): boolean {
  const [sombre, setSombre] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent): void => setSombre(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return sombre
}

const COULEURS_TYPES = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']

export function Statistiques(): React.JSX.Element {
  const { locations } = useStore()
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [depensesList, setDepensesList] = useState<Depense[]>([])
  const [loading, setLoading] = useState(true)
  const sombre = useSombre()

  useEffect(() => {
    void Promise.all([ipc.paiements.listAll(), ipc.depenses.list()])
      .then(([pay, dep]) => {
        setPaiements(pay)
        setDepensesList(dep)
      })
      .catch(() => {
        /* chargement partiel toléré */
      })
      .finally(() => setLoading(false))
  }, [])

  // --- Encaissements par mois (12 derniers) ---
  const encaissements = useMemo(() => {
    return periodesPassees(12).map((p) => ({
      periode: formatPeriode(p).slice(0, 4), // "janv.", "févr."…
      periodeComplete: formatPeriode(p),
      total: paiements
        .filter((x) => x.periode === p && (x.statut === 'paye' || x.statut === 'partiel'))
        .reduce((s, x) => s + x.montant_paye, 0)
    }))
  }, [paiements])

  // --- Répartition par type de bien ---
  const parType = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of locations) {
      if (!r.bail.actif || r.bail.occupation_gratuite) continue
      const cc = r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)
      map.set(r.bien.type_bien, (map.get(r.bien.type_bien) ?? 0) + cc)
    }
    return [...map.entries()]
      .map(([type, total]) => ({ type, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total)
  }, [locations])

  // --- Comparaison annuelle (encaissé année en cours vs précédente) ---
  const annee = new Date().getFullYear()
  const parAnnee = useMemo(() => {
    const enCours = paiements
      .filter((p) => p.periode.startsWith(String(annee)))
      .reduce((s, p) => s + p.montant_paye, 0)
    const precedente = paiements
      .filter((p) => p.periode.startsWith(String(annee - 1)))
      .reduce((s, p) => s + p.montant_paye, 0)
    return [
      { annee: String(annee - 1), total: Math.round(precedente * 100) / 100 },
      { annee: String(annee), total: Math.round(enCours * 100) / 100 }
    ]
  }, [paiements, annee])

  // --- KPI ---
  const bauxPayants = locations.filter((r) => r.bail.actif && !r.bail.occupation_gratuite)
  const loyerMensuelCc = bauxPayants.reduce(
    (s, r) => s + (r.bail.loyer_cc ?? (r.bail.loyer_hc ?? 0) + (r.bail.charges ?? 0)),
    0
  )
  const chargesMensuelles = bauxPayants.reduce((s, r) => s + (r.bail.charges ?? 0), 0)
  const impayes = paiements.filter((p) => p.statut === 'retard' || p.statut === 'impaye')
  const montantImpaye = impayes.reduce((s, p) => s + p.montant_paye, 0)
  const surfaceLouee = bauxPayants.reduce((s, r) => s + (r.bien.surface_m2 ?? 0), 0)
  const loyerM2Moyen = surfaceLouee > 0 ? loyerMensuelCc / surfaceLouee : 0
  // Taux d'occupation : biens occupés (bail actif, payant ou gratuit) / total des biens
  const biensOccupes = locations.filter((r) => r.bail.actif).length
  const tauxOccupation = locations.length > 0 ? Math.round((biensOccupes / locations.length) * 100) : 0

  const axes = sombre ? '#64748b' : '#94a3b8'
  const grille = sombre ? '#334155' : '#e2e8f0'
  const texte = sombre ? '#cbd5e1' : '#334155'

  if (loading) return <div className="p-8 text-slate-400">Chargement…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Statistiques</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          titre="Loyers mensuels CC"
          valeur={formatEuro(loyerMensuelCc)}
          detail={`${bauxPayants.length} bail(s) payant(s)`}
          icon={Wallet}
          couleur="text-emerald-500"
        />
        <KpiCard
          titre="Taux d'occupation"
          valeur={`${tauxOccupation} %`}
          detail={`${biensOccupes}/${locations.length} biens occupés`}
          icon={Percent}
          couleur="text-sky-500"
        />
        <KpiCard
          titre="Charges mensuelles"
          valeur={formatEuro(chargesMensuelles)}
          detail="provisions sur baux actifs"
          icon={Coins}
          couleur="text-violet-500"
        />
        <KpiCard
          titre="Impayés en cours"
          valeur={formatEuro(montantImpaye)}
          detail={`${impayes.length} période(s) non réglée(s)`}
          icon={AlertTriangle}
          couleur={impayes.length > 0 ? 'text-red-500' : 'text-slate-400'}
        />
        <KpiCard
          titre="Surface louée"
          valeur={`${surfaceLouee.toLocaleString('fr-FR')} m²`}
          detail={`${locations.length} bien(s)`}
          icon={Home}
          couleur="text-amber-500"
        />
        <KpiCard
          titre="Loyer moyen / m²"
          valeur={formatEuro(Math.round(loyerM2Moyen * 100) / 100)}
          detail="loyer CC ÷ surface louée"
          icon={Ruler}
          couleur="text-teal-500"
        />
      </div>

      {/* Patrimoine & rentabilité */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Patrimoine &amp; rentabilité
        </h2>
        {(() => {
          const biensAvecValeur = locations.filter((r) => (r.bien.valeur_venale ?? 0) > 0)
          const valeurTotale = biensAvecValeur.reduce((s, r) => s + (r.bien.valeur_venale ?? 0), 0)
          const loyersAnnuelsHc = bauxPayants.reduce(
            (s, r) => s + (r.bail.loyer_hc ?? 0) * 12,
            0
          )
          const depensesAnnee = depensesList
            .filter((d) => d.date_depense?.startsWith(String(annee)))
            .reduce((s, d) => s + d.montant, 0)
          const rentBrute =
            valeurTotale > 0 ? Math.round((loyersAnnuelsHc / valeurTotale) * 10000) / 100 : null
          const rentNette =
            valeurTotale > 0
              ? Math.round(((loyersAnnuelsHc - depensesAnnee) / valeurTotale) * 10000) / 100
              : null
          const cashFlow = loyerMensuelCc * 12 - depensesAnnee
          // Gains dus aux révisions IRL : le taux est appliqué au loyer AVANT
          // révision, donc gain mensuel = loyer_actuel x t/(100+t).
          const gainsIrlMensuel = bauxPayants
            .filter((r) => r.bail.taux_irl && r.bail.taux_irl > 0 && r.bail.loyer_hc)
            .reduce(
              (s, r) =>
                s + ((r.bail.loyer_hc ?? 0) * (r.bail.taux_irl ?? 0)) / (100 + (r.bail.taux_irl ?? 0)),
              0
            )
          const gainsIrl = Math.round(gainsIrlMensuel * 12 * 100) / 100

          if (valeurTotale === 0) {
            return (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">
                Renseigne la <strong>valeur vénale</strong> de tes biens (formulaire Biens
                &amp; Locataires) pour activer la rentabilité brute/nette et le cash-flow.
                {depensesAnnee > 0 &&
                  ` Tes dépenses ${annee} sont déjà enregistrées : ${formatEuro(depensesAnnee)}.`}
              </p>
            )
          }
          return (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard titre="Valeur du patrimoine" valeur={formatEuro(valeurTotale)}
                detail={`${biensAvecValeur.length} bien(s) valorisé(s)`} icon={Home} couleur="text-indigo-500" />
              <KpiCard titre="Loyers annuels HC" valeur={formatEuro(loyersAnnuelsHc)}
                detail="sur baux actifs" icon={Wallet} couleur="text-emerald-500" />
              <KpiCard titre={`Dépenses ${annee}`} valeur={formatEuro(depensesAnnee)}
                detail="travaux, TF, PNO…" icon={Coins} couleur="text-red-500" />
              <KpiCard titre="Rentabilité brute" valeur={rentBrute !== null ? `${rentBrute} %` : '—'}
                detail="loyers HC ÷ valeur" icon={Percent} couleur="text-sky-500" />
              <KpiCard titre="Rentabilité nette" valeur={rentNette !== null ? `${rentNette} %` : '—'}
                detail={`cash-flow ${formatEuro(cashFlow)}`} icon={TrendingUp} couleur={rentNette !== null && rentNette >= 0 ? 'text-emerald-500' : 'text-amber-500'} />
              <KpiCard titre="Gains dus aux révisions IRL" valeur={formatEuro(gainsIrl)}
                detail="estimation annualisée (baux révisés)" icon={TrendingUp} couleur="text-blue-500" />
            </div>
          )
        })()}
      </section>

      {/* Fiscalité — revenus fonciers (2044) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Fiscalité — revenus fonciers {annee} (récap 2044)
        </h2>
        {(() => {
          const recettes = paiements
            .filter((p) => p.periode.startsWith(String(annee)) && (p.statut === 'paye' || p.statut === 'partiel'))
            .reduce((s, p) => s + p.montant_paye, 0)
          // Charges déductibles : toutes les catégories du module Dépenses
          const chargesDeductibles = depensesList
            .filter((d) => d.date_depense?.startsWith(String(annee)))
            .reduce((s, d) => s + d.montant, 0)
          const resultat = recettes - chargesDeductibles
          const microFoncier = recettes <= 15000
          const netMicro = recettes * 0.7
          const netReel = Math.max(resultat, 0)

          return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard titre="Recettes encaissées" valeur={formatEuro(recettes)}
                  detail={`loyers pointés ${annee}`} icon={Wallet} couleur="text-emerald-500" />
                <KpiCard titre="Charges déductibles" valeur={formatEuro(chargesDeductibles)}
                  detail="module Dépenses" icon={Coins} couleur="text-red-500" />
                <KpiCard titre="Résultat foncier (réel)" valeur={formatEuro(resultat)}
                  detail={resultat >= 0 ? 'bénéfice imposable' : 'déficit reportable'} icon={TrendingUp}
                  couleur={resultat >= 0 ? 'text-blue-500' : 'text-amber-500'} />
                <KpiCard titre="Régime conseillé" valeur={microFoncier ? 'Micro-foncier' : 'Réel'}
                  detail={microFoncier ? `recettes ≤ 15 000 € — abattement 30 % : ${formatEuro(recettes - netMicro)}` : 'recettes > 15 000 € — réel obligatoire'}
                  icon={Percent} couleur="text-violet-500" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                <table className="w-full">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="pb-2">Net imposable estimé</th>
                      <th className="pb-2 text-right">Micro-foncier (abattement 30 %)</th>
                      <th className="pb-2 text-right">Régime réel</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-slate-500 dark:text-slate-400">Base imposable</td>
                      <td className="text-right font-medium">{formatEuro(Math.max(netMicro, 0))}</td>
                      <td className="text-right font-medium">{formatEuro(netReel)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-400">
                  Estimations indicatives basées sur tes pointages et ton module Dépenses.
                  Reporte ces montants dans la déclaration 2044 (régime réel) ou 2042
                  case 4BE (micro-foncier). Un déficit foncier est reportable sur les
                  revenus globaux jusqu'à 10 700 €/an. Vérifie avec ton comptable ou
                  l'administration fiscale.
                </p>
              </div>
            </div>
          )
        })()}
      </section>

      {/* Encaissements 12 mois */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Encaissements — 12 derniers mois
        </h2>
        <div className="h-72 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          {encaissements.every((e) => e.total === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Aucun paiement pointé sur les 12 derniers mois — pointe tes loyers dans la
              page Paiements pour remplir ce graphique.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={encaissements} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grille} vertical={false} />
                <XAxis
                  dataKey="periode"
                  tick={{ fill: axes, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: grille }}
                />
                <YAxis
                  tick={{ fill: axes, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v} €`}
                  width={65}
                />
                <Tooltip
                  formatter={(v) => [formatEuro(Number(v)), 'Encaissé']}
                  labelFormatter={(l, payload) =>
                    payload?.[0]?.payload.periodeComplete ?? String(l)
                  }
                  contentStyle={{
                    background: sombre ? '#0f172a' : '#fff',
                    border: `1px solid ${grille}`,
                    borderRadius: 8,
                    color: texte
                  }}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Répartition par type */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Répartition des loyers par type de bien
          </h2>
          <div className="h-72 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            {parType.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Aucun bail payant actif.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={parType}
                    dataKey="total"
                    nameKey="type"
                    innerRadius="50%"
                    outerRadius="75%"
                    paddingAngle={3}
                  >
                    {parType.map((_, i) => (
                      <Cell key={i} fill={COULEURS_TYPES[i % COULEURS_TYPES.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [formatEuro(Number(v)) + '/mois', String(n)]}
                    contentStyle={{
                      background: sombre ? '#0f172a' : '#fff',
                      border: `1px solid ${grille}`,
                      borderRadius: 8,
                      color: texte
                    }}
                  />
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={texte}
                    fontSize="13"
                  >
                    {formatEuro(loyerMensuelCc)}
                  </text>
                  <text
                    x="50%"
                    y="55%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={axes}
                    fontSize="11"
                  >
                    par mois
                  </text>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Légende */}
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {parType.map((p, i) => (
              <span key={p.type} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: COULEURS_TYPES[i % COULEURS_TYPES.length] }}
                />
                {p.type} : {formatEuro(p.total)}
              </span>
            ))}
          </div>
        </section>

        {/* Comparaison annuelle */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Encaissé par année
          </h2>
          <div className="h-72 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            {parAnnee.every((a) => a.total === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Pas encore d'historique sur deux années.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parAnnee} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grille} vertical={false} />
                  <XAxis
                    dataKey="annee"
                    tick={{ fill: axes, fontSize: 13 }}
                    tickLine={false}
                    axisLine={{ stroke: grille }}
                  />
                  <YAxis
                    tick={{ fill: axes, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v} €`}
                    width={65}
                  />
                  <Tooltip
                    formatter={(v) => [formatEuro(Number(v)), 'Encaissé']}
                    contentStyle={{
                      background: sombre ? '#0f172a' : '#fff',
                      border: `1px solid ${grille}`,
                      borderRadius: 8,
                      color: texte
                    }}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={90} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs text-slate-400">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
            Ces graphiques se remplissent automatiquement au fur et à mesure de tes
            pointages dans la page Paiements.
          </p>
        </section>
      </div>
    </div>
  )
}
