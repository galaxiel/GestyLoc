// ============================================================================
// Harnais de tests BDD — exécuté dans ELECTRON (better-sqlite3 est compilé
// pour Electron, vitest tourne sur Node pur : incompatibilité connue, cf.
// AGENTS.md §2). Lancement : `npm run test:db`.
//
// Principe : userData redirigé vers un dossier TEMPORAIRE (jamais la vraie
// base de l'utilisateur !), migrations SQL appliquées depuis les fichiers,
// puis assertions sur les repositories + services via les fichiers de test
// par entité (un fichier par module, tous auto-contenus : aucun test ne
// dépend de l'ordre d'exécution des autres). Sortie 0 = vert, 1 = rouge.
// ============================================================================

import { app } from 'electron'
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
// Imports STATIQUES (sûrs : connection.ts n'ouvre la base qu'au premier
// appel getDb() — le setPath ci-dessous passe donc toujours avant).
import { getRawConnection } from '../../src/main/database/connection'

// Dossier du BUNDLE (scripts/test-db/) — les chemins relatifs y sont ancrés.
const ici = dirname(fileURLToPath(import.meta.url))

// 1) Redirige la base vers un dossier temporaire AVANT le premier getDb.
const dossierTest = mkdtempSync(join(tmpdir(), 'gestyloc-test-db-'))
app.setPath('userData', dossierTest)

// 2) Migrations SQL réelles (ordre alphabétique = 0001→0013).
const dossierMigrations = join(ici, '../../src/main/database/migrations')
const conn = getRawConnection()
conn.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)
for (const fichier of readdirSync(dossierMigrations)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  conn.exec(readFileSync(join(dossierMigrations, fichier), 'utf-8'))
}
console.log(
  `Migrations appliquées : ${readdirSync(dossierMigrations).filter((f) => f.endsWith('.sql')).length} fichiers`
)

// 3) Les fichiers de test par entité (imports dynamiques après le setPath).
const { registreBienTests } = await import('./bien.test')
const { registreBailTests } = await import('./bail.test')
const { registreLocataireTests } = await import('./locataire.test')
const { registreDepenseTests } = await import('./depense.test')
const { registreRegularisationTests } = await import('./regularisation.test')
const { registrePaiementTests } = await import('./paiement.test')
const { registreBailRevisionTests } = await import('./bail-revision.test')
const { registreParametresTests } = await import('./parametres.test')
const { registreAlertesImpayeTests } = await import('./alertes-impaye.test')
const { registreAlertesIrlTests } = await import('./alertes-irl.test')
const { registreEcheancierTests } = await import('./echeancier.test')
const { registreAuditTests } = await import('./audit.test')

console.log('\n=== Repositories ===')
await registreBienTests(test)
await registreBailTests(test)
await registreLocataireTests(test)
await registreDepenseTests(test)
await registreRegularisationTests(test)
await registrePaiementTests(test)
await registreBailRevisionTests(test)
await registreParametresTests(test)

console.log('\n=== Services ===')
await registreAlertesImpayeTests(test)
await registreAlertesIrlTests(test)
await registreEcheancierTests(test)
await registreAuditTests(test)

// 4) Nettoyage + verdict — la base temporaire est SUPPRIMÉE.
const base = join(dossierTest, 'data', 'app.db')
assert.ok(existsSync(base), 'la base doit exister dans userData redirigé')
try {
  conn.close()
} catch {
  /* déjà fermée */
}
rmSync(dossierTest, { recursive: true, force: true })
console.log(`\nBase temporaire supprimée (${dossierTest}) — la base réelle n'a jamais été ouverte.`)

resumeEtQuitte()

// ============================================================================
// Imports du harnais (après les registres pour la lisibilité) — les helpers
// test/etat vivent dans harnais.ts pour être partagés par tous les fichiers.
// ============================================================================
import { test, resumeEtQuitte } from './harnais'
