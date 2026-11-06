#!/usr/bin/env node
// ============================================================================
// Générateur de 30 dossiers locatifs SYNTHÉTIQUES pour la démo web et les
// tests de non-régression de GestyLoc.
//
//   node scripts/gen_demo_30.mjs [--seed 20261106] [--out fixtures/demo-30] [--dry-run]
//
// Sorties (dans --out) :
//   baux.csv        — format d'import de l'app (mapping par INDEX de colonnes
//                     0..20, cf. src/main/services/import.service.ts). Excel-fr
//                     (« ; », BOM UTF-8), en-tête ignorée par le filtre d'import.
//   paiements.csv   — format d'export « paiements.csv » de l'app (7 colonnes,
//                     cf. src/main/services/donnees.service.ts).
//   dossiers.json   — manifest des 30 dossiers : ce que chacun exerce, les
//                     compléments que l'import ne peut pas porter (jour de
//                     paiement, dépôt, type de charges, congé, révisions,
//                     régularisations, fusion de colocation) et les valeurs
//                     attendues pour les invariants du vérificateur.
//   README.md       — tableau dossier | ce qu'il exerce | résultat attendu.
//
// Déterminisme : même --seed → fichiers identiques au bit près (PRNG seedé,
// ordres stables, aucune date courante — la démo est figée à novembre 2026,
// cf. REF_MOIS_COURANT). Aucune dépendance Node au-delà de la stdlib.
//
// Les noms, adresses et montants sont 100 % fictifs. Les indices IRL cités
// sont des valeurs INSEE publiques (cf. shared/irl-insee.ts).
//
// ⚠️ L'implémentation des calculs (prorata, révision) est VOLONTAIREMENT
// indépendante de shared/echeancier.ts : le vérificateur recalcule avec le
// VRAI code de l'app et compare — c'est ce qui en fait un test de
// non-régression (sinon le test vérifierait le code contre lui-même).
// ============================================================================

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ----------------------------------------------------------------------------
// Paramètres
// ----------------------------------------------------------------------------
const ici = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

function argVal(flag, defaut) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut
}
const aFlag = (flag) => args.includes(flag)

const SEED = parseInt(argVal('--seed', '20261106'), 10)
const OUT = resolve(argVal('--out', join(ici, '..', 'fixtures', 'demo-30')))
const DRY_RUN = aFlag('--dry-run')

if (args.some((a) => a === '--help' || a === '-h')) {
  console.log('Usage : node scripts/gen_demo_30.mjs [--seed N] [--out DIR] [--dry-run]')
  process.exit(0)
}

// ----------------------------------------------------------------------------
// PRNG déterministe (mulberry32) — même seed, même suite.
// ----------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const entier = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const choix = (liste) => liste[entier(0, liste.length - 1)]

// ----------------------------------------------------------------------------
// Constantes de la démo
// ----------------------------------------------------------------------------
const REF_MOIS_COURANT = '2026-11' // démo figée à novembre 2026 (pas de Date.now)

// Indices IRL INSEE publics (identiques à shared/irl-insee.ts — valeurs
// vérifiées contre ce fichier ; à recaler si la table embarquée évolue).
const IRL_REELS = { '2023-T3': 141.03, '2024-T3': 144.51, '2025-T3': 145.77, '2026-T3': 148.06 }
const tauxIrlDe = (ref, nouv) => Math.round((nouv / ref - 1) * 100000) / 1000

// Fictif total : prénoms/noms assemblés pour la démo (cf. README fixtures).
const PRENOMS = [
  'Alice',
  'Bruno',
  'Chloé',
  'Damien',
  'Éloise',
  'Farid',
  'Gwenn',
  'Hugo',
  'Inès',
  'Jules'
]
const NOMS = [
  'Verdier',
  'Lambertin',
  'Castaing',
  'Oberlin',
  'Pujol',
  'Ravard',
  'Solère',
  'Tissot-Vidal'
]
const RUES = [
  'des Écureuils',
  'du Mûrier',
  'Basse des Vignes',
  'du Puits Carré',
  'de la Petite Forêt'
]
const VILLES = ['Blois', 'Villeurbanne', 'Nevers', 'Valence', 'Quimper']

// ----------------------------------------------------------------------------
// Helpers dates (chaînes ISO, zéro Date pour le déterminisme)
// ----------------------------------------------------------------------------
const joursDuMois = (annee, mois) => new Date(annee, mois, 0).getDate()
const moisSuivant = (periode) => {
  const [a, m] = periode.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}
const periodesEntre = (debut, fin) => {
  const out = []
  let p = debut
  while (p <= fin) {
    out.push(p)
    p = moisSuivant(p)
  }
  return out
}
// Prorata — implémentation indépendante (cf. en-tête) : jours civils, jour
// d'entrée compris. Semblable à shared/echeancier.ts mais réécrit ici.
const prorata = (isoDebut, loyerCc) => {
  const [a, m, j] = isoDebut.split('-').map(Number)
  const total = joursDuMois(a, m)
  if (j <= 1) return { montant: loyerCc, fraction: null }
  const occupes = total - j + 1
  return {
    montant: Math.round(((loyerCc * occupes) / total) * 100) / 100,
    fraction: `${occupes}/${total} j`
  }
}

// ----------------------------------------------------------------------------
// Fabrique de locataires / biens (fictifs)
// ----------------------------------------------------------------------------
let compteurLoc = 0
const nomsUtilises = new Set()
function nouveauLocataire() {
  compteurLoc++
  let nom = ''
  do {
    nom = `${choix(PRENOMS)} ${choix(NOMS)}`
  } while (nomsUtilises.has(nom)) // tirage répété : déterministe avec le seed
  nomsUtilises.add(nom)
  return { ref: `LOC${String(compteurLoc).padStart(2, '0')}`, nom_complet: nom }
}

function adresseBien() {
  return `${entier(1, 40)} ${choix(RUES)}, ${choix(VILLES)}`
}

// ----------------------------------------------------------------------------
// Les 30 dossiers — construction dans l'ordre imposé.
// Chaque dossier : { id, famille, designation, type, locataires[], complements,
// paiements[], attendus {…}, resultat }.
// ----------------------------------------------------------------------------
const dossiers = []
function ajoute(d) {
  dossiers.push(d)
}

const PERIODES_HISTO = periodesEntre('2025-12', REF_MOIS_COURANT) // 12 mois

// --- 10 simples : bail actif, loyer payé à date, 12 mois d'historique -------
const formesSimple = [
  ['Appartement', 'Appartement T3'],
  ['Studio', 'Studio meublé'],
  ['Appartement', 'Appartement T2'],
  ['Garage', 'Garage en rez-de-chaussée'],
  ['Maison', 'Maison de ville T4'],
  ['Studio', 'Studio étudiant'],
  ['Appartement', 'Appartement T4'],
  ['Garage', 'Box fermé'],
  ['Appartement', 'Appartement T3 duplex'],
  ['Local', 'Local artisan (atelier)']
]
for (let i = 0; i < 10; i++) {
  const [type, prefixe] = formesSimple[i]
  const loc = nouveauLocataire()
  // Dates étalées 2022→2024 ; au moins 3 baux à cheval sur deux années
  // civiles (début après le 1er juillet).
  const debut = choix(['2022-08-01', '2023-03-15', '2023-11-01', '2024-06-20', '2022-12-05'])
  const hc = type === 'Garage' || type === 'Local' ? entier(55, 110) : entier(380, 780)
  const charges = type === 'Garage' || type === 'Local' ? 0 : entier(25, 95)
  const surface = type === 'Garage' || type === 'Local' ? entier(14, 30) : entier(22, 92)
  const cc = Math.round((hc + charges) * 100) / 100
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'simple',
    designation: `${prefixe} — ${adresseBien()}`,
    type,
    locataires: [loc],
    bail: { debut, fin: null, meuble: type === 'Studio', surface, hc, charges, cc },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: cc,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref: `VIR-${p}-D${dossiers.length + 1}`
    })),
    attendus: { nbPaiements: 12, quittancePossible: true },
    resultat:
      'Bail actif, 12 périodes pointées « payé » → quittances générables, aucune alerte de loyer.'
  })
}

// --- 4 entrée en cours de mois (prorata) ------------------------------------
// D11 : le 1er → PAS de prorata (branche « jour d'entrée ≤ 1 », mois 31 j).
// D12 : le 15 d'un mois de 30 → 16/30.
// D13 : le 28 d'un mois de 31 → 4/31.
// D14 : le 30 d'un mois de 30 → 1/30 (comparé à D13 : 31 jours contre 30).
const casProrata = [
  // (jour d'entrée ; le nombre de jours du mois est recalculé, pas imposé)
  ['2026-03-01', 480],
  ['2026-04-15', 620],
  ['2026-01-28', 540],
  ['2026-09-30', 540]
]
for (const [debut, hc] of casProrata) {
  const loc = nouveauLocataire()
  const charges = 60
  const cc = Math.round((hc + charges) * 100) / 100
  const pr = prorata(debut, cc)
  const [a, m] = debut.split('-').map(Number)
  const premierePeriode = `${a}-${String(m).padStart(2, '0')}`
  const periodes = periodesEntre(premierePeriode, REF_MOIS_COURANT)
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'prorata',
    designation: `Appartement entrée ${debut.slice(8)} ${premierePeriode} — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: { debut, fin: null, meuble: false, surface: entier(30, 70), hc, charges, cc },
    paiements: periodes.map((p, i) => ({
      periode: p,
      montant: i === 0 ? pr.montant : cc,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref: `VIR-${p}-D${dossiers.length + 1}`
    })),
    attendus: {
      prorataPremierMois: pr.montant,
      fraction: pr.fraction ?? 'plein (entrée le 1er)',
      nbPaiements: periodes.length,
      quittancePossible: true
    },
    resultat:
      pr.fraction === null
        ? `Entrée le 1ᵉʳ → loyer plein (${cc} €), branche « pas de prorata » du calcul.`
        : `1ᵉʳ mois attendu = prorata ${pr.fraction} = ${pr.montant} €, pointé « payé » sans être un partiel.`
  })
}

// --- 4 révision IRL à l'anniversaire ----------------------------------------
// D15/D16 : révisions APPLIQUÉES (2024 puis 2025 pour D15 ; 2025 pour D16).
// D17 : révision NON appliquée (anniversaire 2026 passé) → alerte.
// D18 : taux de l'année précédente (dernière révision = anniversaire 2025).
const IR = IRL_REELS
function dossierRevision(id, config) {
  const loc = nouveauLocataire()
  const charges = 70
  ajoute({
    id,
    famille: 'revision',
    designation: `Appartement révisé ${config.debut.slice(0, 4)} — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: {
      debut: config.debut,
      fin: null,
      meuble: false,
      surface: entier(40, 80),
      hc: config.hcActuel,
      charges,
      cc: Math.round((config.hcActuel + charges) * 100) / 100,
      // Après application réelle, irl_reference == irl_nouveau == IRL appliqué
      // (comportement d'appliquerRevision) ; D17 : nouveau null (jamais appliqué).
      irlReference: config.irlReference ?? null,
      irlNouveau: config.irlNouveau ?? null,
      trimestreReference: config.trimestreRef ?? null
    },
    complements: {
      revisions: config.revisions, // { date, ancienHc, nouvelHc, irlRef, irlNouv, taux, trimestreRef }
      dateDerniereRevision: config.dateDerniereRevision ?? null,
      tauxIrl: config.tauxIrl ?? null,
      trimestreReference: config.trimestreRef ?? null
    },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: Math.round((config.hcActuel + charges) * 100) / 100,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref: `VIR-${p}-${id}`
    })),
    attendus: {
      revisionAttendue: config.revisions.length
        ? Math.round(
            config.revisions.at(-1).ancienHc *
              (config.revisions.at(-1).irlNouv / config.revisions.at(-1).irlRef) *
              100
          ) / 100
        : null,
      alerteRevision: config.alerteRevision,
      nbPaiements: 12,
      quittancePossible: true
    },
    resultat: config.resultat
  })
}
// Logique d'alerte réelle (alertes.service.ts) : alerte si l'anniversaire de
// CETTE année est passé ET que date_derniere_revision est antérieure. Pour un
// dossier « appliqué » sans alerte au 06/11/2026, la dernière révision doit
// donc être datée de l'anniversaire 2026 — les chaînes ci-dessous respectent
// cette contrainte, avec arrondi au centime À CHAQUE révision (règle légale).
// D15 : 2 révisions appliquées (2024 puis 2026 — 2025 sautée, cas réel).
const d15rev1 = Math.round(640 * (IR['2024-T3'] / IR['2023-T3']) * 100) / 100
const d15rev2 = Math.round(d15rev1 * (IR['2026-T3'] / IR['2024-T3']) * 100) / 100
dossierRevision(`D${String(dossiers.length + 1).padStart(2, '0')}`, {
  debut: '2023-10-01',
  hc0: 640,
  hcActuel: d15rev2,
  irlReference: IR['2026-T3'],
  irlNouveau: IR['2026-T3'],
  trimestreRef: 'T3 2026',
  revisions: [
    {
      date: '2024-10-01',
      ancienHc: 640,
      irlRef: IR['2023-T3'],
      irlNouv: IR['2024-T3'],
      nouvelHc: d15rev1,
      trimestreRef: 'T3 2024',
      taux: tauxIrlDe(IR['2023-T3'], IR['2024-T3'])
    },
    {
      date: '2026-10-01',
      ancienHc: d15rev1,
      irlRef: IR['2024-T3'],
      irlNouv: IR['2026-T3'],
      nouvelHc: d15rev2,
      trimestreRef: 'T3 2026',
      taux: tauxIrlDe(IR['2024-T3'], IR['2026-T3'])
    }
  ],
  dateDerniereRevision: '2026-10-01',
  tauxIrl: tauxIrlDe(IR['2024-T3'], IR['2026-T3']),
  alerteRevision: false,
  resultat:
    '2 révisions appliquées (2024 puis 2026, 2025 sautée — cas réel) : loyer = HC × (IRL nouv / IRL ref) au centime à chaque étape ; plus d’alerte.'
})
// D16 : 1 révision appliquée à l'anniversaire 2026 (paire T3 2025 → T3 2026).
dossierRevision(`D${String(dossiers.length + 1).padStart(2, '0')}`, {
  debut: '2024-10-01',
  hc0: 520,
  hcActuel: Math.round(520 * (IR['2026-T3'] / IR['2025-T3']) * 100) / 100,
  irlReference: IR['2026-T3'],
  irlNouveau: IR['2026-T3'],
  trimestreRef: 'T3 2026',
  revisions: [
    {
      date: '2026-10-01',
      ancienHc: 520,
      irlRef: IR['2025-T3'],
      irlNouv: IR['2026-T3'],
      nouvelHc: Math.round(520 * (IR['2026-T3'] / IR['2025-T3']) * 100) / 100,
      trimestreRef: 'T3 2026',
      taux: tauxIrlDe(IR['2025-T3'], IR['2026-T3'])
    }
  ],
  dateDerniereRevision: '2026-10-01',
  tauxIrl: tauxIrlDe(IR['2025-T3'], IR['2026-T3']),
  alerteRevision: false,
  resultat:
    '1 révision appliquée à l’anniversaire 2026 : nouveau HC = ancien HC × (IRL nouv / IRL ref), au centime ; plus d’alerte.'
})
// D17 : révision NON appliquée — irl_reference renseignée (sinon l'alerte
// n'existe pas : condition irl_reference !== null dans alertes.service.ts).
dossierRevision(`D${String(dossiers.length + 1).padStart(2, '0')}`, {
  debut: '2023-04-01',
  hc0: 580,
  hcActuel: 580,
  irlReference: IR['2023-T3'],
  irlNouveau: null,
  trimestreRef: 'T1 2023',
  revisions: [],
  dateDerniereRevision: null,
  alerteRevision: true,
  resultat:
    'IRL de référence renseigné, aucune révision appliquée depuis le début → alerte « révision IRL à l’anniversaire ».'
})
// D18 : taux de l'année précédente — dernière révision à l'anniversaire 2025
// (paire T3 2023 → T3 2024), l'anniversaire 2026 est passé sans révision.
dossierRevision(`D${String(dossiers.length + 1).padStart(2, '0')}`, {
  debut: '2022-10-01',
  hc0: 500,
  hcActuel: Math.round(500 * (IR['2024-T3'] / IR['2023-T3']) * 100) / 100,
  irlReference: IR['2024-T3'],
  irlNouveau: IR['2024-T3'],
  trimestreRef: 'T3 2024',
  revisions: [
    {
      date: '2025-10-01',
      ancienHc: 500,
      irlRef: IR['2023-T3'],
      irlNouv: IR['2024-T3'],
      nouvelHc: Math.round(500 * (IR['2024-T3'] / IR['2023-T3']) * 100) / 100,
      trimestreRef: 'T3 2024',
      taux: tauxIrlDe(IR['2023-T3'], IR['2024-T3'])
    }
  ],
  dateDerniereRevision: '2025-10-01',
  tauxIrl: tauxIrlDe(IR['2023-T3'], IR['2024-T3']),
  alerteRevision: true,
  resultat:
    'Dernière révision = anniversaire 2025 (taux IRL de l’année précédente) → anniversaire 2026 raté, alerte.'
})

// --- 3 paiement partiel : reçu PDF autonome, pas de quittance ----------------
for (let i = 0; i < 3; i++) {
  const loc = nouveauLocataire()
  const hc = entier(430, 700)
  const charges = 55
  const cc = Math.round((hc + charges) * 100) / 100
  const periodePartielle = ['2026-10', '2026-09', '2026-10'][i]
  const partMontant = Math.round(cc * [0.55, 0.6, 0.4][i] * 100) / 100
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'partiel',
    designation: `Appartement paiement partiel — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: {
      debut: choix(['2023-02-01', '2024-05-10', '2022-09-15']),
      fin: null,
      meuble: false,
      surface: entier(35, 75),
      hc,
      charges,
      cc
    },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: p === periodePartielle ? partMontant : cc,
      statut: p === periodePartielle ? 'partiel' : 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref:
        p === periodePartielle
          ? `RECU-${p}-D${dossiers.length + 1}`
          : `VIR-${p}-D${dossiers.length + 1}`
    })),
    attendus: {
      partiel: { periode: periodePartielle, montant: partMontant, attenduPlein: cc },
      nbPaiements: 12,
      quittancePossible: true // les périodes « payé » restent quittancables
    },
    resultat: `Période ${periodePartielle} pointée « partiel » à ${partMontant} € (sur ${cc} €) → REÇU de paiement, pas de quittance pour cette période.`
  })
}

// --- 3 impayés : 1, 2, 3 mois → paliers d'alerte -----------------------------
// Toutes les périodes impayées sont POINTÉES « impayé » (y compris le mois
// courant) : sinon l'alerte « mois courant non pointé » se déclencherait en
// plus et mélangerait les paliers. 1/2/3 mois = 1/2/3 alertes « impayé ».
for (let i = 0; i < 3; i++) {
  const nbMois = i + 1
  const loc = nouveauLocataire()
  const hc = entier(450, 760)
  const charges = 65
  const cc = Math.round((hc + charges) * 100) / 100
  const periodesImpayees = PERIODES_HISTO.slice(-nbMois)
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'impaye',
    designation: `Maison impayé ${nbMois} mois — ${adresseBien()}`,
    type: 'Maison',
    locataires: [loc],
    bail: {
      debut: '2022-11-01',
      fin: null,
      meuble: false,
      surface: entier(70, 110),
      hc,
      charges,
      cc
    },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: periodesImpayees.includes(p) ? 0 : cc,
      statut: periodesImpayees.includes(p) ? 'impaye' : 'paye',
      date: null,
      mode: null,
      ref: null
    })),
    attendus: { nbMoisImpayes: nbMois, nbPaiements: 12, quittancePossible: true },
    resultat: `${nbMois} période(s) pointée(s) « impayé » → ${nbMois} alerte(s) « impayé » au Dashboard (pas d'intensité croissante : cf. limites).`
  })
}

// --- 2 congé en cours de bail + restitution du dépôt -------------------------
// D25 : congé DONNÉ, préavis en cours (fin dans 45 jours) — bail actif,
//       alerte « fin de bail < 90 j », loyers payés jusqu'au mois courant.
// D26 : congé TERMINÉ (bail clos : actif=false via complément post-import,
//       l'import force actif=1), dépôt enregistré — la RESTITUTION n'a
//       aucun support dans le schéma (cf. README fixtures, limites).
{
  const loc = nouveauLocataire()
  const hc = 660
  const charges = 80
  const cc = Math.round((hc + charges) * 100) / 100
  const fin = '2026-12-20' // ~45 jours après le 6 novembre 2026
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'conge',
    designation: `Appartement congé en cours — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: { debut: '2023-12-20', fin, meuble: false, surface: 58, hc, charges, cc },
    complements: { depotGarantie: cc, congéEnCours: true },
    paiements: periodesEntre('2025-12', REF_MOIS_COURANT).map((p) => ({
      periode: p,
      montant: cc,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref: `VIR-${p}-D${dossiers.length + 1}`
    })),
    attendus: { joursAvantFin: 44, alerteFinBail: true, nbPaiements: 12, quittancePossible: true },
    resultat:
      'Congé donné, fin dans ~44 jours → alerte « fin de bail », dépôt de garantie enregistré (restitution non modélisée).'
  })
}
{
  const loc = nouveauLocataire()
  const hc = 590
  const charges = 75
  const cc = Math.round((hc + charges) * 100) / 100
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'conge',
    designation: `Appartement congé terminé — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: { debut: '2022-07-01', fin: '2026-07-31', meuble: false, surface: 52, hc, charges, cc },
    complements: { depotGarantie: 665, actif: false, congéTerminé: true },
    paiements: [
      ...periodesEntre('2025-12', '2026-07').map((p) => ({
        periode: p,
        montant: cc,
        statut: 'paye',
        date: `${p}-03`,
        mode: 'Virement',
        ref: `VIR-${p}-D${dossiers.length + 1}`
      }))
    ],
    attendus: { actif: false, alerteFinBail: false, nbPaiements: 8, quittancePossible: true },
    resultat:
      'Bail clos (actif=false via complément — l’import force actif=1) → hors alertes, dépôt de 665 € à restituer (non modélisé).'
  })
}

// --- 2 charges avec régularisation annuelle ----------------------------------
for (let i = 0; i < 2; i++) {
  const loc = nouveauLocataire()
  const hc = entier(500, 720)
  const charges = [92, 78][i]
  const cc = Math.round((hc + charges) * 100) / 100
  // i=0 : régularisation EN FAVEUR du bailleur (réelles < provisions) ;
  // i=1 : EN FAVEUR du locataire (réelles > provisions).
  const reelles = Math.round((charges * 12 + [-260, 140][i]) * 100) / 100
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'regularisation',
    designation: `Appartement charges provisionnelles — ${adresseBien()}`,
    type: 'Appartement',
    locataires: [loc],
    bail: {
      debut: i === 0 ? '2022-09-01' : '2023-06-15',
      fin: null,
      meuble: false,
      surface: entier(45, 85),
      hc,
      charges,
      cc
    },
    complements: {
      typeCharges: 'provisionnelles',
      regularisations: [{ annee: 2025, chargesReelles: reelles }]
    },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: cc,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Virement',
      ref: `VIR-${p}-D${dossiers.length + 1}`
    })),
    attendus: {
      provisionsAnnee2025: Math.round(charges * 12 * 100) / 100,
      chargesReelles2025: reelles,
      ecart: Math.round((charges * 12 - reelles) * 100) / 100,
      nbPaiements: 12,
      quittancePossible: true
    },
    resultat: `Charges provisionnelles (${charges} €/mois) + régularisation 2025 : réelles ${reelles} €, écart ${Math.round((charges * 12 - reelles) * 100) / 100} € (décompte PDF art. 23).`
  })
}

// --- 1 parking/box sans charges ----------------------------------------------
{
  const loc = nouveauLocataire()
  const hc = 45
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'parking',
    designation: `Parking extérieur sans charges — ${adresseBien()}`,
    type: 'Parking',
    locataires: [loc],
    bail: { debut: '2023-04-01', fin: null, meuble: false, surface: 12, hc, charges: null, cc: hc },
    paiements: PERIODES_HISTO.map((p) => ({
      periode: p,
      montant: hc,
      statut: 'paye',
      date: `${p}-03`,
      mode: 'Espèces',
      ref: `ESP-${p}-D${dossiers.length + 1}`
    })),
    attendus: { chargesNulles: true, attenduPlein: hc, nbPaiements: 12, quittancePossible: true },
    resultat: `Parking sans charges (colonne vide à l'import) → attendu = loyer CC = HC = ${hc} €, aucune régularisation possible.`
  })
}

// --- 1 colocation à 2 locataires ---------------------------------------------
// Le schéma lie 1 bail à UN locataire et l'import crée 1 bien par ligne :
// la colocation est donc modélisée par 2 baux sur le MÊME bien (moitié du
// loyer chacun, une quittance par colocataire) — les 2 lignes du CSV créent
// 2 biens identiques que le vérificateur fusionne en post-import (cf. README
// fixtures, limites). Compte comme 1 dossier (2 baux).
{
  const adresse = `9 rue du Mûrier, Blois`
  const locA = nouveauLocataire()
  const locB = nouveauLocataire()
  const hc = 640
  const charges = 90
  const cc = Math.round((hc + charges) * 100) / 100
  const demi = Math.round((cc / 2) * 100) / 100
  const designation = `Appartement en colocation (2 baux) — ${adresse}`
  ajoute({
    id: `D${String(dossiers.length + 1).padStart(2, '0')}`,
    famille: 'colocation',
    designation,
    type: 'Appartement',
    locataires: [locA, locB],
    bail: { debut: '2024-09-01', fin: null, meuble: false, surface: 74, hc, charges, cc },
    complements: { colocation: true, repartition: [demi, Math.round((cc - demi) * 100) / 100] },
    paiements: PERIODES_HISTO.flatMap((p) => [
      {
        periode: p,
        montant: demi,
        statut: 'paye',
        date: `${p}-05`,
        mode: 'Virement',
        ref: `VIR-${p}-D30A`,
        locataire: locA.ref
      },
      {
        periode: p,
        montant: Math.round((cc - demi) * 100) / 100,
        statut: 'paye',
        date: `${p}-05`,
        mode: 'Virement',
        ref: `VIR-${p}-D30B`,
        locataire: locB.ref
      }
    ]),
    attendus: { nbBaux: 2, nbBiens: 1, nbPaiements: 24, quittancePossible: true },
    resultat:
      '1 bien, 2 baux (1 par colocataire, moitié du loyer chacun) → 2 quittances par période possibles.'
  })
}

// ============================================================================
// Contrôles internes du générateur (fail-fast si la répartition casse)
// ============================================================================
if (dossiers.length !== 30)
  throw new Error(`Répartition : ${dossiers.length} dossiers au lieu de 30`)
const familles = {}
for (const d of dossiers) familles[d.famille] = (familles[d.famille] ?? 0) + 1
const attenduFamilles = {
  simple: 10,
  prorata: 4,
  revision: 4,
  partiel: 3,
  impaye: 3,
  conge: 2,
  regularisation: 2,
  parking: 1,
  colocation: 1
}
for (const [f, n] of Object.entries(attenduFamilles)) {
  if ((familles[f] ?? 0) !== n)
    throw new Error(`Famille ${f} : ${familles[f] ?? 0} au lieu de ${n}`)
}
// Unicité de la clé de rattachement (designation + locataire) : c'est sur
// elle que le vérificateur remappe les paiements vers les baux importés.
{
  const cles = new Set()
  for (const d of dossiers) {
    for (const l of d.locataires) {
      const cle = `${d.designation} § ${l.nom_complet}`
      if (cles.has(cle)) throw new Error(`Clé de rattachement dupliquée : ${cle}`)
      cles.add(cle)
    }
  }
}

// ============================================================================
// Sérialisation
// ============================================================================
const versCsvFr = (entetes, lignes) => {
  const cellule = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\n')
}
const isoVersFr = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

// baux.csv — mapping par index imposé par import.service.ts :
// 0 désignation, 1 type, 2 locataire, 3 début, 4 fin, 5 (vide), 6 trimestre,
// 7 meublé, 8 surface, 9 loyer/m², 10 HC, 11 charges, 12 CC, 13 IRL ref,
// 14 IRL nouveau, 15 taux, 16 nouveau HC, 17 (vide), 18 annuel HC, 19 annuel CC,
// 20 frais d'agence. Les dérivés (9/15/18/19) sont recalculés par l'import ;
// ils sont écrits cohérents pour l'honnêteté du fichier de démo.
const lignesBaux = []
const indexBailParRef = new Map() // ref de ligne → bail_id attendu (ordre d'insert)
let bailIdCourant = 0
for (const d of dossiers) {
  for (const loc of d.locataires) {
    bailIdCourant++
    const refBail = `${d.id}#${d.locataires.indexOf(loc) + 1}`
    indexBailParRef.set(refBail, bailIdCourant)
    const { bail } = d
    const derniereRev = d.complements?.revisions?.at(-1)
    // Colocation : chaque bail porte SA part (moitié), sinon l'invariant
    // « payé ⇒ montant = attendu » casse (l'attendu se lit sur le bail).
    const colocation = d.complements?.colocation === true
    const hcBail = colocation ? Math.round((bail.hc / 2) * 100) / 100 : bail.hc
    const chargesBail = colocation
      ? Math.round(((bail.charges ?? 0) / 2) * 100) / 100
      : (bail.charges ?? null)
    const ccBail = colocation ? Math.round((hcBail + (chargesBail ?? 0)) * 100) / 100 : bail.cc
    lignesBaux.push([
      d.designation, // 0 — ne doit PAS matcher /^(Total|Type de Bien|Appartements|Garages|Colonne|ID)/i
      d.type, // 1
      loc.nom_complet, // 2
      isoVersFr(bail.debut), // 3
      isoVersFr(bail.fin ?? null), // 4
      '', // 5
      bail.trimestreReference ?? '', // 6
      bail.meuble ? 'true' : 'false', // 7
      bail.surface, // 8
      hcBail && bail.surface ? Math.round((hcBail / bail.surface) * 100) / 100 : null, // 9 (recalculé)
      hcBail, // 10
      chargesBail, // 11
      ccBail, // 12
      bail.irlReference, // 13
      bail.irlNouveau, // 14
      null, // 15 (recalculé)
      derniereRev ? derniereRev.nouvelHc : null, // 16
      '', // 17
      hcBail ? Math.round(hcBail * 12 * 100) / 100 : null, // 18 (recalculé)
      ccBail ? Math.round(ccBail * 12 * 100) / 100 : null, // 19 (recalculé)
      null // 20
    ])
  }
}
const bauxCsv = versCsvFr(
  [
    'ID',
    'Type de Bien',
    'Locataire',
    'Date bail',
    'Fin bail',
    '',
    'Trimestre',
    'Meublé',
    'Surface',
    'Loyer/m²',
    'Loyer HC',
    'Charges',
    'Loyer CC',
    'IRL ref',
    'IRL nouveau',
    'Taux',
    'Nouveau HC',
    '',
    'Annuel HC',
    'Annuel CC',
    'Frais'
  ],
  lignesBaux
)

// paiements.csv — format d'export de l'app (7 colonnes exactes). Les bail_id
// correspondent à l'ordre d'insert du CSV ci-dessus sur une base neuve.
const lignesPaiements = []
for (const d of dossiers) {
  for (const p of d.paiements) {
    const refBail = `${d.id}#${p.locataire ? d.locataires.findIndex((l) => l.ref === p.locataire) + 1 : 1}`
    lignesPaiements.push([
      indexBailParRef.get(refBail),
      p.periode,
      p.montant,
      p.date ?? '',
      p.statut,
      p.mode ?? '',
      p.ref ?? ''
    ])
  }
}
const paiementsCsv = versCsvFr(
  ['bail_id', 'periode', 'montant_paye', 'date_paiement', 'statut', 'mode_paiement', 'reference'],
  lignesPaiements
)

// dossiers.json — manifest (compléments post-import + valeurs attendues).
const manifest = {
  genere_le: `seed=${SEED}`,
  refMoisCourant: REF_MOIS_COURANT,
  noteBailIds:
    'paiements.csv référence les bail_id par ORDRE DE LIGNE de baux.csv sur une base neuve (autoincrement, import dans l’ordre).',
  dossiers: dossiers.map((d) => ({
    id: d.id,
    famille: d.famille,
    designation: d.designation,
    type: d.type,
    locataires: d.locataires.map((l) => l.nom_complet),
    bail: d.bail,
    complements: d.complements ?? {},
    paiements: d.paiements,
    attendus: d.attendus,
    resultat: d.resultat,
    refsBail: d.locataires.map((l, i) => `${d.id}#${i + 1}`)
  }))
}

// README.md — tableau dossier | ce qu'il exerce | résultat attendu.
const readme = `# fixtures/demo-30 — 30 dossiers locatifs synthétiques

Générés par \`node scripts/gen_demo_30.mjs\` (seed par défaut **20261106**,
démo figée à **novembre 2026**). Même seed → fichiers **identiques au bit près**.

| Fichier | Rôle |
|---|---|
| \`baux.csv\` | Format d'import de l'app (mapping par index 0..20, Excel-fr \`;\` + BOM). Importable via Paramètres → Données sur une **base vide**. |
| \`paiements.csv\` | Format d'export \`paiements.csv\` de l'app (7 colonnes). \`bail_id\` = ordre de ligne de \`baux.csv\` sur une base neuve. |
| \`dossiers.json\` | Manifest : compléments que l'import ne peut pas porter + valeurs attendues des invariants (consommé par \`scripts/check_demo_30.mjs\`). |

⚠️ **Tout est fictif** (noms, adresses, montants) ; les indices IRL cités sont
des valeurs INSEE publiques. Ne jamais charger ces données dans la vraie base
(%APPDATA%) — l'import refuse d'ailleurs toute base non vide.

## Les 30 dossiers

| Dossier | Ce qu'il exerce | Résultat attendu |
|---|---|---|
${dossiers.map((d) => `| ${d.id} (${d.famille}) | ${d.famille === 'colocation' ? 'Colocation : 1 bien, 2 baux (moitié chacun)' : d.famille} | ${d.resultat} |`).join('\n')}

## Limites connues (règles métier absentes du code — documentées, pas inventées)

1. **Colocation** : l'import crée 1 bien par ligne → les 2 lignes de D30 créent
   2 biens identiques que \`check_demo_30.mjs\` fusionne en post-import. L'app
   n'a pas de concept de colocation : 2 quittances par période (une par bail).
2. **Restitution du dépôt** : aucun champ/table n'existe — \`depot_garantie\`
   est un simple montant. Les 2 congés n'exercent donc que la clôture du bail.
3. **Paliers d'alerte impayés** : sévérité « urgent » uniquement pour le mois
   courant NON pointé (> 15 j de retard) ; un impayé POINTÉ reste « warning »
   quel que soit son âge → les paliers 1/2/3 mois = nombre d'alertes, pas
   d'intensité croissante.
4. **Congé/préavis** : pas de concept dédié — modélisé par \`date_fin_bail\`
   (+ \`actif=false\` en post-import pour le bail clos, l'import forçant
   \`actif=1\`).
5. **\`taux_irl\` d'un bail déjà révisé** : l'import recalcule le taux depuis la
   paire (ref, nouveau) ; après application réelle ref == nouveau → taux 0.
   Le manifest corrige \`taux_irl\` et \`date_derniere_revision\` en post-import.
6. **« 30 quittances générables »** : vérification au niveau DONNÉES — chaque
   dossier a ≥ 1 période pointée « payé » (art. 21) ; les périodes « partiel »
   donnent un reçu, pas de quittance. La génération PDF elle-même n'est pas
   testée par ce harnais.
7. **\`commitImport\` est lié à la boîte de dialogue native** : le vérificateur
   réplique son mapping colonne par colonne (aucun refactor autorisé) en
   réutilisant les vrais parseurs \`shared/csv.ts\` et le vrai calcul
   \`shared/echeancier.ts\`.
`

// ============================================================================
// Écriture (--dry-run : n'écrit rien, affiche seulement le résumé)
// ============================================================================
const fichiers = {
  'baux.csv': bauxCsv,
  'paiements.csv': paiementsCsv,
  'dossiers.json': JSON.stringify(manifest, null, 2) + '\n',
  'README.md': readme
}

if (DRY_RUN) {
  console.log(
    `DRY-RUN — seed ${SEED} → ${dossiers.length} dossiers, ${lignesBaux.length} baux, ${lignesPaiements.length} paiements. Rien écrit.`
  )
} else {
  mkdirSync(OUT, { recursive: true })
  for (const [nom, contenu] of Object.entries(fichiers)) {
    writeFileSync(join(OUT, nom), contenu)
    console.log(`Écrit : ${join(OUT, nom)} (${Buffer.byteLength(contenu)} octets)`)
  }
  console.log(
    `30 dossiers / ${lignesBaux.length} baux / ${lignesPaiements.length} paiements — seed ${SEED}`
  )
}
