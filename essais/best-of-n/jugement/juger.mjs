// ============================================================================
// JUGE du Best-of-N — exécute les 9 colonnes (code actuel + 8 tentatives)
// sur le jeu VISIBLE et le jeu SCELLÉ, compare à l'oracle du contrat, et
// classe chaque cas en trois familles (CONTRAT §7, mission phase 3) :
//   UNANIMITE_OK   — les 9 + oracle d'accord
//   UNANIMITE_KO   — les 9 d'accord entre eux mais ≠ oracle (spec ou oracle en défaut)
//   DIVERGENCE     — au moins une implémentation diffère
//   ORACLE_SEUL    — l'oracle diffère des 9 (traité comme UNANIMITE_KO variante)
// Usage : node juger.mjs   (nécessite scelle/cas-scelle-2000.json + attempts)
// Sortie : jugement/matrice.json + jugement/resume.md
// ============================================================================

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { simulerRevisionContrat, montantAttenduContrat } from './oracle.mjs'

const ici = dirname(fileURLToPath(import.meta.url))
const racine = join(ici, '..', '..', '..')
const TENTATIVES = [1, 2, 3, 4, 5, 6, 7, 8]

function bundler(entry, sortie) {
  execSync(
    `npx esbuild "${entry}" --bundle --platform=node --format=esm --outfile="${sortie}"`,
    { cwd: racine, stdio: 'pipe' }
  )
}

const round2 = (v) => Math.round(v * 100) / 100

// --- Chargement des colonnes -------------------------------------------------
const colonnes = []

// Colonne « actuel » : shim vers les vrais modules de l'app.
const shimActuel = join(ici, 'entry-actuel.ts')
writeFileSync(
  shimActuel,
  "export { simulerRattrapageIrl } from '../../../shared/stats.ts'\n" +
    "export { montantAttendu } from '../../../shared/echeancier.ts'\n"
)
bundler(shimActuel, join(ici, 'bundle-actuel.mjs'))
{
  const m = await import(pathToFileURL(join(ici, 'bundle-actuel.mjs')).href)
  colonnes.push({ nom: 'actuel', revision: m.simulerRattrapageIrl, prorata: m.montantAttendu })
}

// Colonnes tentatives : shim par tentative vers impl-revision + impl-prorata.
for (const n of TENTATIVES) {
  const dossier = join(ici, '..', `attempt-${n}`)
  if (!existsSync(join(dossier, 'impl-revision.ts')) || !existsSync(join(dossier, 'impl-prorata.ts'))) {
    console.error(`⚠ attempt-${n} incomplet — colonne exclue (à relancer/documenter)`)
    continue
  }
  const shim = join(ici, `entry-${n}.ts`)
  writeFileSync(
    shim,
    `export { simulerRattrapageIrl } from '../attempt-${n}/impl-revision.ts'\n` +
      `export { montantAttendu } from '../attempt-${n}/impl-prorata.ts'\n`
  )
  const bundle = join(ici, `bundle-${n}.mjs`)
  try {
    bundler(shim, bundle)
    const m = await import(pathToFileURL(bundle).href)
    if (typeof m.simulerRattrapageIrl !== 'function' || typeof m.montantAttendu !== 'function') {
      throw new Error('exports manquants')
    }
    colonnes.push({ nom: `attempt-${n}`, revision: m.simulerRattrapageIrl, prorata: m.montantAttendu })
  } catch (err) {
    console.error(`⚠ attempt-${n} non compilable ou signature non conforme — colonne exclue : ${err.message}`)
  }
}

console.log(`Colonnes chargées : ${colonnes.map((c) => c.nom).join(', ')}`)

// --- Exécution des cas --------------------------------------------------------
function execRevision(colonne, cas) {
  const baux = [
    {
      bailId: cas.bail.bailId,
      designation: cas.bail.designation,
      locataire: cas.bail.locataire,
      loyerHcActuel: cas.bail.loyerHcActuel,
      dateDebutBail: cas.bail.dateDebutBail,
      trimestreRef: cas.bail.trimestreRef
    }
  ]
  const map = cas.irlParTrimestre ? new Map(Object.entries(cas.irlParTrimestre)) : null
  const r = colonne.revision(baux, cas.anneeDepart, map, cas.tauxFixeAnnuel)
  const x = Array.isArray(r) ? r[0] : r
  return { loyerSimule: x.loyerSimule, revisionsJouees: x.revisionsJouees }
}

function execProrata(colonne, cas) {
  return colonne.prorata(cas.bail, cas.periode)
}

const visible = JSON.parse(readFileSync(join(ici, '..', 'cas-visibles-500.json'), 'utf-8'))
const cheminScelle = join(ici, '..', 'scelle', 'cas-scelle-2000.json')
const scelle = existsSync(cheminScelle)
  ? JSON.parse(readFileSync(cheminScelle, 'utf-8'))
  : null

function executerJeu(jeu, etiquete) {
  const resultats = {} // cas -> { colonne: valeur }
  for (const cas of jeu.revision) {
    resultats[`${etiquete}:${cas.cas}`] = {
      famille: 'revision',
      valeurs: Object.fromEntries(colonnes.map((c) => [c.nom, execRevision(c, cas)])),
      entree: cas
    }
  }
  for (const cas of jeu.prorata) {
    resultats[`${etiquete}:${cas.cas}`] = {
      famille: 'prorata',
      valeurs: Object.fromEntries(colonnes.map((c) => [c.nom, execProrata(c, cas)])),
      entree: cas
    }
  }
  return resultats
}

console.log('Exécution du jeu visible…')
const resultatsVisible = executerJeu(visible, 'visible')
console.log(`  ${Object.keys(resultatsVisible).length} cas`)
let resultatsScelle = null
if (scelle) {
  console.log('Exécution du jeu scellé…')
  resultatsScelle = executerJeu(scelle, 'scelle')
  console.log(`  ${Object.keys(resultatsScelle).length} cas`)
}

// --- Oracle (contrat) ---------------------------------------------------------
function valeurOracle(entree) {
  if (entree.famille === 'revision') {
    const r = simulerRevisionContrat({
      bail: entree.entree.bail,
      anneeDepart: entree.entree.anneeDepart,
      irl: entree.entree.irlParTrimestre ? new Map(Object.entries(entree.entree.irlParTrimestre)) : null,
      tauxFixe: entree.entree.tauxFixeAnnuel
    })
    return { loyerSimule: r.loyerSimule, revisionsJouees: r.revisionsJouees }
  }
  return montantAttenduContrat({ bail: entree.entree.bail, periode: entree.entree.periode })
}

// --- Classification -----------------------------------------------------------
const norm = (v) => JSON.stringify(v === undefined ? 'UNDEFINED' : v)

function classifier(resultats) {
  const familles = { UNANIMITE_OK: [], UNANIMITE_KO: [], DIVERGENCE: [] }
  const details = []
  for (const [cle, entree] of Object.entries(resultats)) {
    const valeurs = Object.values(entree.valeurs).map(norm)
    const unique = [...new Set(valeurs)]
    const oracle = norm(valeurOracle(entree))
    if (unique.length === 1) {
      // Les implémentations sont d'accord entre elles.
      if (valeurs[0] === oracle) {
        familles.UNANIMITE_OK.push(cle)
      } else {
        familles.UNANIMITE_KO.push(cle)
        details.push({ cas: cle, famille: entree.famille, attenduOracle: JSON.parse(oracle), obtenu: JSON.parse(valeurs[0]), entree: entree.entree })
      }
    } else {
      familles.DIVERGENCE.push(cle)
      details.push({
        cas: cle,
        famille: entree.famille,
        entree: entree.entree,
        valeurs: entree.valeurs,
        oracle: JSON.parse(oracle)
      })
    }
  }
  return { familles, details }
}

const classificationVisible = classifier(resultatsVisible)
console.log('\n=== Jeu VISIBLE (500) ===')
for (const [f, liste] of Object.entries(classificationVisible.familles)) {
  console.log(`  ${f} : ${liste.length}`)
}

let classificationScelle = null
if (resultatsScelle) {
  classificationScelle = classifier(resultatsScelle)
  console.log('\n=== Jeu SCELLÉ (2000) ===')
  for (const [f, liste] of Object.entries(classificationScelle.familles)) {
    console.log(`  ${f} : ${liste.length}`)
  }
}

writeFileSync(
  join(ici, 'matrice.json'),
  JSON.stringify(
    {
      colonnes: colonnes.map((c) => c.nom),
      visible: classificationVisible,
      scelle: classificationScelle
    },
    null,
    2
  )
)
console.log(`\nMatrice écrite : ${join(ici, 'matrice.json')}`)
