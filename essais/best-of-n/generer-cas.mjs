// ============================================================================
// Générateur de cas pour le Best-of-N — DÉTERMINISTE (seed en constante).
// Usage : node generer-cas.mjs <fichier-sortie.json> [seed]
// Les cas sont des ENTRÉES uniquement (aucun résultat attendu).
// Quotas de frontières imposés par le CONTRAT.md §5.
// ============================================================================

const out = process.argv[2]
let seed = parseInt(process.argv[3] ?? '20261107', 10)
if (!out) {
  console.error('Usage : node generer-cas.mjs <sortie.json> [seed]')
  process.exit(1)
}

// PRNG mulberry32 — identique au générateur de démo (déterminisme).
function mulberry32(s) {
  let a = s >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(seed)
const entier = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const choix = (l) => l[entier(0, l.length - 1)]
const round2 = (v) => Math.round(v * 100) / 100

// Table IRL publique (extraite de shared/irl-insee.ts) — pour construire des
// tables tronquées « indices manquants » et des ratios plausibles.
const IRL_PLEIN = {
  '2022-Q1': 133.93, '2022-Q2': 135.84, '2022-Q3': 136.27, '2022-Q4': 137.26,
  '2023-Q1': 138.61, '2023-Q2': 140.59, '2023-Q3': 141.03, '2023-Q4': 142.06,
  '2024-Q1': 143.46, '2024-Q2': 145.17, '2024-Q3': 144.51, '2024-Q4': 144.61,
  '2025-Q1': 145.48, '2025-Q2': 146.68, '2025-Q3': 145.77, '2025-Q4': 146.04,
  '2026-Q1': 146.6, '2026-Q2': 148.37, '2026-Q3': 148.06
}
const TRIMESTRES = Object.keys(IRL_PLEIN)

// --- Révision : 250 cas ------------------------------------------------------
const revision = []
function casRevision(cas, bail, anneeDepart, irl, tauxFixe) {
  revision.push({
    cas,
    bail: {
      bailId: parseInt(cas.slice(1), 10),
      designation: `cas ${cas}`,
      locataire: `Locataire ${cas}`,
      loyerHcActuel: bail.loyerHcActuel,
      dateDebutBail: bail.dateDebutBail,
      trimestreRef: bail.trimestreRef
    },
    anneeDepart,
    // JSON : la Map est sérialisée en objet (le couloir d'exécution la
    // convertit en Map — CONTRAT §1).
    irlParTrimestre: irl,
    tauxFixeAnnuel: tauxFixe ?? null
  })
}

function tablePlein() {
  return { ...IRL_PLEIN }
}
function tableTronquee() {
  // Indices manquants : on retire 1 à 3 années consécutives quelconques.
  const t = { ...IRL_PLEIN }
  const debut = entier(0, TRIMESTRES.length - 8)
  const largeur = entier(1, 6)
  for (let i = debut; i < Math.min(debut + largeur, TRIMESTRES.length); i++) delete t[TRIMESTRES[i]]
  return t
}
function anneeSousTable(table) {
  const annees = [...new Set(Object.keys(table).map((k) => k.slice(0, 4)))]
  return parseInt(choix(annees), 10)
}

// 150 cas aléatoires
for (let i = 0; i < 150; i++) {
  const annee = entier(2019, 2025)
  const mois = String(entier(1, 10)).padStart(2, '0') // pas nov./déc. (CONTRAT §4)
  const jour = String(entier(1, 28)).padStart(2, '0')
  const trimestre = Math.min(4, Math.ceil(parseInt(mois, 10) / 3))
  const utiliseTable = rnd() < 0.8
  casRevision(`R${String(revision.length + 1).padStart(3, '0')}`, {
    loyerHcActuel: choix([0, entier(300, 900) + round2(rnd()), round2(rnd() * 950)]),
    dateDebutBail: `${annee}-${mois}-${jour}`,
    trimestreRef: choix([`T${trimestre} ${annee}`, null, `T${entier(1, 4)} ${entier(2018, annee)}`])
  }, entier(2022, 2026), utiliseTable ? tablePlein() : null, utiliseTable ? null : choix([1.5, 2.0, 3.5]))
}

// 100 cas de frontière ciblés
const frontieresRev = []
// Entrées de fin de mois (31, 30, 29, 28)
frontieresRev.push(['2023-01-31', 'T1 2023'], ['2023-04-30', 'T2 2023'], ['2023-02-28', 'T1 2023'], ['2023-06-30', 'T2 2023'])
// Bissextiles : début 29/02/2024 (anniversaire borné au 28 en 2025/2026)
frontieresRev.push(['2024-02-29', 'T1 2024'], ['2024-02-29', null])
// Bail < 12 mois : début tardif + anneeDepart courante
frontieresRev.push(['2025-12-15', 'T4 2025'], ['2025-11-01', 'T4 2025'], ['2025-10-20', 'T4 2025'])
// Révisions non appliquées (anneeDepart après les indices disponibles)
frontieresRev.push(['2022-05-10', 'T2 2022'], ['2022-03-01', 'T1 2022'])
// Loyers 0 (parking)
frontieresRev.push(['2023-03-15', 'T1 2023'], ['2023-03-15', null])
// Trimestre null / piégeux
frontieresRev.push(['2023-10-01', null], ['2023-10-01', 'T3 2023'], ['2023-10-01', ' genre vide '], ['2024-10-01', 'T3 2024'])
for (const [debut, trim] of frontieresRev) {
  const table = tablePlein()
  casRevision(`R${String(revision.length + 1).padStart(3, '0')}`, {
    loyerHcActuel: frontieresRev.indexOf([debut, trim]) % 3 === 0 ? 0 : round2(300 + rnd() * 600),
    dateDebutBail: debut,
    trimestreRef: trim
  }, entier(2024, 2026), rnd() < 0.85 ? table : tableTronquee(), null)
}
// Indices manquants explicites (15) + taux fixes (10)
for (let i = 0; i < 15; i++) {
  const annee = entier(2020, 2024)
  casRevision(`R${String(revision.length + 1).padStart(3, '0')}`, {
    loyerHcActuel: round2(300 + rnd() * 600),
    dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-${String(entier(1, 28)).padStart(2, '0')}`,
    trimestreRef: `T${entier(1, 4)} ${annee}`
  }, entier(annee + 1, 2026), tableTronquee(), null)
}
for (let i = 0; i < 10; i++) {
  const annee = entier(2020, 2024)
  casRevision(`R${String(revision.length + 1).padStart(3, '0')}`, {
    loyerHcActuel: round2(300 + rnd() * 600),
    dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-01`,
    trimestreRef: `T${entier(1, 4)} ${annee}`
  }, entier(2024, 2026), null, choix([0, 1.5, 2.35, 3.5]))
}
// Compléter jusqu'à 250 avec des tables tronquées variées
while (revision.length < 250) {
  const annee = entier(2020, 2024)
  casRevision(`R${String(revision.length + 1).padStart(3, '0')}`, {
    loyerHcActuel: round2(rnd() * 900),
    dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-${String(entier(1, 28)).padStart(2, '0')}`,
    trimestreRef: choix([`T${entier(1, 4)} ${annee}`, null])
  }, anneeSousTable(tablePlein()), tableTronquee(), rnd() < 0.15 ? choix([1.5, 2.0]) : null)
}

// --- Prorata : 250 cas -------------------------------------------------------
const prorata = []
function casProrata(cas, bail, periode) {
  prorata.push({ cas, bail, periode })
}

// 150 aléatoires (jour 1..31 → certains bornés, certains invalides pour le mois)
for (let i = 0; i < 150; i++) {
  const annee = entier(2024, 2026)
  const mois = String(entier(1, 12)).padStart(2, '0')
  const loyerHc = choix([null, round2(rnd() * 800), 0])
  const charges = choix([null, 0, round2(rnd() * 120)])
  const cc = loyerHc !== null ? round2(loyerHc + (charges ?? 0)) : choix([null, round2(rnd() * 900), 0])
  const dateFin = rnd() < 0.25 ? `${annee}-${mois}-${String(entier(2, 28)).padStart(2, '0')}` : null // sondes de sortie
  casProrata(`P${String(prorata.length + 1).padStart(3, '0')}`, {
    date_debut_bail: `${annee}-${mois}-${String(entier(1, 31)).padStart(2, '0')}`,
    date_fin_bail: dateFin,
    loyer_cc: cc,
    loyer_hc: loyerHc,
    charges
  }, `${annee}-${mois}`)
}

// 100 frontières ciblées
const frontieresPro = []
// 31 dans un mois de 30 (borné) / de 31 (1 jour)
frontieresPro.push(['2026-04-31', '2026-04'], ['2026-01-31', '2026-01'], ['2026-03-31', '2026-03'], ['2026-05-31', '2026-05'])
// Bissextile : 29/02/2024 existe (1 jour), 29/02/2025 n'existe pas (borné au 28)
frontieresPro.push(['2024-02-29', '2024-02'], ['2025-02-29', '2025-02'], ['2024-02-28', '2024-02'], ['2025-02-28', '2025-02'], ['2025-02-01', '2025-02'])
// Entrée le 1er (plein) + loyers 0
frontieresPro.push(['2026-04-01', '2026-04'], ['2026-01-01', '2026-01'])
// Sondes de sortie : départ DANS le mois visé (le code actuel ne prorate pas)
for (const j of [2, 12, 20, 27]) frontieresPro.push([`2026-06-${String(j).padStart(2, '0')}`, '2026-06'])
// Bail hors période (période avant le début → plein tel quel ? le code dit
// plein pour toute période ≠ premier mois : sonde)
frontieresPro.push(['2025-06-15', '2024-03'], ['2025-06-15', '2025-06'])
for (const [debut, periode] of frontieresPro) {
  const hc = choix([null, round2(rnd() * 800), 0])
  const charges = choix([null, 0, round2(rnd() * 120)])
  casProrata(`P${String(prorata.length + 1).padStart(3, '0')}`, {
    date_debut_bail: debut,
    date_fin_bail: rnd() < 0.3 ? `${periode}-${String(entier(3, 28)).padStart(2, '0')}` : null,
    loyer_cc: hc !== null ? round2(hc + (charges ?? 0)) : choix([null, round2(rnd() * 900)]),
    loyer_hc: hc,
    charges
  }, periode)
}
// Compléter jusqu'à 250
while (prorata.length < 250) {
  const annee = entier(2024, 2026)
  const mois = String(entier(1, 12)).padStart(2, '0')
  casProrata(`P${String(prorata.length + 1).padStart(3, '0')}`, {
    date_debut_bail: `${annee}-${mois}-${String(entier(1, 31)).padStart(2, '0')}`,
    date_fin_bail: null,
    loyer_cc: round2(rnd() * 900),
    loyer_hc: round2(rnd() * 800),
    charges: round2(rnd() * 120)
  }, `${annee}-${mois}`)
}

// --- Écriture ----------------------------------------------------------------
const fs = await import('node:fs')
const contenu = {
  seed,
  genere_le: 'déterministe (aucune date système)',
  reference_temporelle: '2026-11-06 (CONTRAT §4)',
  revision,
  prorata
}
fs.writeFileSync(out, JSON.stringify(contenu, null, 2) + '\n')
console.log(`${revision.length} cas de révision + ${prorata.length} cas de prorata → ${out}`)
