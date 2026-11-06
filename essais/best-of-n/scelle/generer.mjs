// ============================================================================
// Générateur du JEU SCELLÉ — 2 000 cas, seed 777777 (différente du visible).
// À exécuter UNIQUEMENT en phase 2, APRÈS le gel des 8 tentatives.
// Usage : node generer.mjs → écrit cas-scelle-2000.json à côté de lui-même.
// Mêmes familles et format que le jeu visible (CONTRAT §7), quotas doublés.
// ============================================================================

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const out = join(dirname(fileURLToPath(import.meta.url)), 'cas-scelle-2000.json')
let seed = 777777

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

const IRL_PLEIN = {
  '2022-Q1': 133.93, '2022-Q2': 135.84, '2022-Q3': 136.27, '2022-Q4': 137.26,
  '2023-Q1': 138.61, '2023-Q2': 140.59, '2023-Q3': 141.03, '2023-Q4': 142.06,
  '2024-Q1': 143.46, '2024-Q2': 145.17, '2024-Q3': 144.51, '2024-Q4': 144.61,
  '2025-Q1': 145.48, '2025-Q2': 146.68, '2025-Q3': 145.77, '2025-Q4': 146.04,
  '2026-Q1': 146.6, '2026-Q2': 148.37, '2026-Q3': 148.06
}
const TRIMESTRES = Object.keys(IRL_PLEIN)

const revision = []
function casRevision(bail, anneeDepart, irl, tauxFixe) {
  revision.push({
    cas: `R${String(revision.length + 1).padStart(4, '0')}`,
    bail: {
      bailId: revision.length + 1,
      designation: `scellé ${revision.length + 1}`,
      locataire: `Locataire scellé ${revision.length + 1}`,
      loyerHcActuel: bail.loyerHcActuel,
      dateDebutBail: bail.dateDebutBail,
      trimestreRef: bail.trimestreRef
    },
    anneeDepart,
    irlParTrimestre: irl,
    tauxFixeAnnuel: tauxFixe ?? null
  })
}
function tablePlein() {
  return { ...IRL_PLEIN }
}
function tableTronquee() {
  const t = { ...IRL_PLEIN }
  const debut = entier(0, TRIMESTRES.length - 8)
  const largeur = entier(1, 6)
  for (let i = debut; i < Math.min(debut + largeur, TRIMESTRES.length); i++) delete t[TRIMESTRES[i]]
  return t
}

// 1 000 révision : 600 aléatoires + 400 frontières (quotas doublés)
for (let i = 0; i < 600; i++) {
  const annee = entier(2019, 2025)
  const mois = String(entier(1, 10)).padStart(2, '0')
  const utiliseTable = rnd() < 0.8
  casRevision(
    {
      loyerHcActuel: choix([0, round2(rnd() * 950), round2(300 + rnd() * 600)]),
      dateDebutBail: `${annee}-${mois}-${String(entier(1, 31)).padStart(2, '0')}`,
      trimestreRef: choix([`T${Math.min(4, Math.ceil(parseInt(mois, 10) / 3))} ${annee}`, null, `T${entier(1, 4)} ${entier(2018, annee)}`])
    },
    entier(2022, 2026),
    utiliseTable ? tablePlein() : null,
    utiliseTable ? null : choix([0, 1.5, 2.0, 3.5])
  )
}
for (let i = 0; i < 100; i++) {
  const annee = entier(2019, 2025)
  casRevision(
    {
      loyerHcActuel: choix([0, round2(rnd() * 950)]),
      dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-${choix(['31', '30', '29', '28', '01'])}`,
      trimestreRef: choix([`T${entier(1, 4)} ${annee}`, null])
    },
    entier(2022, 2026),
    tableTronquee(),
    null
  )
}
for (let i = 0; i < 100; i++) {
  const annee = entier(2019, 2025)
  casRevision(
    {
      loyerHcActuel: round2(300 + rnd() * 600),
      dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-${choix(['29', '28', '15', '01'])}`,
      trimestreRef: `T${entier(1, 4)} ${annee}`
    },
    entier(2024, 2026),
    tablePlein(),
    null
  )
}
for (let i = 0; i < 100; i++) {
  const annee = entier(2019, 2025)
  casRevision(
    {
      loyerHcActuel: round2(rnd() * 900),
      dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-01`,
      trimestreRef: `T${entier(1, 4)} ${annee}`
    },
    entier(2024, 2026),
    null,
    choix([0, 1.5, 2.35, 3.5])
  )
}
for (let i = 0; i < 100; i++) {
  const annee = entier(2020, 2024)
  casRevision(
    {
      loyerHcActuel: round2(300 + rnd() * 600),
      dateDebutBail: `${annee}-${String(entier(1, 10)).padStart(2, '0')}-${String(entier(1, 28)).padStart(2, '0')}`,
      trimestreRef: choix([`T${entier(1, 4)} ${annee}`, null])
    },
    entier(annee + 1, 2026),
    tableTronquee(),
    null
  )
}

const prorata = []
function casProrata(bail, periode) {
  prorata.push({
    cas: `P${String(prorata.length + 1).padStart(4, '0')}`,
    bail: {
      date_debut_bail: bail.date_debut_bail,
      date_fin_bail: bail.date_fin_bail ?? null,
      loyer_cc: bail.loyer_cc,
      loyer_hc: bail.loyer_hc,
      charges: bail.charges
    },
    periode
  })
}
// 1 000 prorata : 600 aléatoires + 400 frontières
for (let i = 0; i < 600; i++) {
  const annee = entier(2024, 2026)
  const mois = String(entier(1, 12)).padStart(2, '0')
  const loyerHc = choix([null, round2(rnd() * 800), 0])
  const charges = choix([null, 0, round2(rnd() * 120)])
  const cc = loyerHc !== null ? round2(loyerHc + (charges ?? 0)) : choix([null, round2(rnd() * 900), 0])
  casProrata(
    {
      date_debut_bail: `${annee}-${mois}-${String(entier(1, 31)).padStart(2, '0')}`,
      date_fin_bail: rnd() < 0.25 ? `${annee}-${mois}-${String(entier(2, 28)).padStart(2, '0')}` : null,
      loyer_cc: cc,
      loyer_hc: loyerHc,
      charges
    },
    `${annee}-${mois}`
  )
}
for (let i = 0; i < 120; i++) {
  const annee = entier(2024, 2026)
  const mois31 = choix(['01', '03', '05', '07', '08', '10', '12'])
  casProrata(
    {
      date_debut_bail: `${annee}-${mois31}-${choix(['31', '30', '01'])}`,
      date_fin_bail: null,
      loyer_cc: round2(rnd() * 900),
      loyer_hc: round2(rnd() * 800),
      charges: round2(rnd() * 120)
    },
    choix([`${annee}-${mois31}`, `${annee}-04`, `${annee}-02`, `${annee}-06`])
  )
}
for (let i = 0; i < 80; i++) {
  casProrata(
    {
      date_debut_bail: `${choix(['2024', '2025'])}-02-${choix(['29', '28', '01'])}`,
      date_fin_bail: rnd() < 0.2 ? `${choix(['2024', '2025'])}-02-${entier(2, 28)}` : null,
      loyer_cc: round2(rnd() * 900),
      loyer_hc: round2(rnd() * 800),
      charges: round2(rnd() * 120)
    },
    `${choix(['2024', '2025'])}-02`
  )
}
for (let i = 0; i < 120; i++) {
  const annee = entier(2024, 2026)
  const mois = String(entier(1, 12)).padStart(2, '0')
  const jourDepart = String(entier(2, 28)).padStart(2, '0')
  casProrata(
    {
      // Sondes de sortie : départ DANS le mois visé
      date_debut_bail: `${annee - 2}-${mois}-${jourDepart}`,
      date_fin_bail: `${annee}-${mois}-${String(entier(2, 28)).padStart(2, '0')}`,
      loyer_cc: round2(rnd() * 900),
      loyer_hc: round2(rnd() * 800),
      charges: round2(rnd() * 120)
    },
    `${annee}-${mois}`
  )
}
for (let i = 0; i < 80; i++) {
  const annee = entier(2024, 2026)
  const mois = String(entier(1, 12)).padStart(2, '0')
  casProrata(
    {
      date_debut_bail: `${annee}-${mois}-${String(entier(1, 31)).padStart(2, '0')}`,
      date_fin_bail: null,
      loyer_cc: choix([null, 0]),
      loyer_hc: null,
      charges: choix([null, round2(rnd() * 120)])
    },
    `${annee}-${mois}`
  )
}

writeFileSync(
  out,
  JSON.stringify(
    {
      seed,
      genere_le: 'déterministe (aucune date système) — PHASE 2, après gel des tentatives',
      reference_temporelle: '2026-11-06 (CONTRAT §4)',
      revision,
      prorata
    },
    null,
    2
  ) + '\n'
)
console.log(`${revision.length} révision + ${prorata.length} prorata → ${out}`)
