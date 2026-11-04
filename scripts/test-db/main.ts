// ============================================================================
// Harnais de tests BDD — exécuté dans ELECTRON (better-sqlite3 est compilé
// pour Electron, vitest tourne sur Node pur : incompatibilité connue, cf.
// AGENTS.md §2). Lancement : `npm run test:db`.
//
// Principe : userData redirigé vers un dossier TEMPORAIRE (jamais la vraie
// base de l'utilisateur !), migrations SQL appliquées depuis les fichiers,
// puis assertions sur les repositories + le service d'alertes.
// Sortie 0 = vert, 1 = rouge. Aucune assertion flaky : les tests qui
// dépendent de la date du jour sont volontairement bornés (statuts pointés,
// config) — les calculs de date purs sont couverts dans vitest.
// ============================================================================

import { app } from 'electron'
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import assert from 'node:assert/strict'
// Imports STATIQUES (sûrs : connection.ts n'ouvre la base qu'au premier
// appel getDb() — le setPath ci-dessous passe donc toujours avant).
import { getRawConnection } from '../../src/main/database/connection'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import { paiementRepository } from '../../src/main/repositories/paiement.repository'
import { bailRevisionRepository } from '../../src/main/repositories/bail-revision.repository'
import { parametresRepository } from '../../src/main/repositories/parametres.repository'
import { computeAlertes, margeRetardJours } from '../../src/main/services/alertes.service'

// Dossier du BUNDLE (scripts/test-db/) — les chemins relatifs y sont ancrés.
const ici = dirname(fileURLToPath(import.meta.url))

// 1) Redirige la base vers un dossier temporaire AVANT le premier getDb.
const dossierTest = mkdtempSync(join(tmpdir(), 'gestyloc-test-db-'))
app.setPath('userData', dossierTest)

let reussis = 0
const echecs: string[] = []
async function test(nom: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    reussis++
    console.log(`  ✓ ${nom}`)
  } catch (err) {
    echecs.push(nom)
    console.error(`  ✗ ${nom}\n    ${err instanceof Error ? err.message : String(err)}`)
  }
}

// 3) Applique les migrations SQL (ordre alphabétique = ordre 0001→0013).
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

// --- Fixtures ---
const bien1 = bienRepository.create({
  type_bien: 'Garage',
  designation: 'Test G1',
  nom: 'Garage test'
}) as { id: number }
const loc1 = locataireRepository.create({ nom_complet: 'Loc Test' }) as { id: number }
const bail1 = bailRepository.create({
  bien_id: bien1.id,
  locataire_id: loc1.id,
  date_debut_bail: '2026-01-15',
  loyer_hc: 400,
  charges: 50,
  loyer_cc: 450,
  jour_paiement: 5,
  actif: true
}) as { id: number }

await test('baux: jour_paiement par défaut = 1, explicite = 5', () => {
  const bail = bailRepository.getById(bail1.id) as { jour_paiement: number }
  assert.equal(bail.jour_paiement, 5)
  const bail2 = bailRepository.create({
    bien_id: bien1.id,
    locataire_id: loc1.id,
    actif: true
  }) as { id: number }
  assert.equal((bailRepository.getById(bail2.id) as { jour_paiement: number }).jour_paiement, 1)
})

await test('baux: UPDATE avec FK factice (bien_id: 0) ne lève PAS et ne modifie pas la FK', () => {
  // Règle historique v1.0→v1.12 : les FK ne changent jamais en édition.
  const maj = bailRepository.update(bail1.id, {
    bien_id: 0, // payload « sale » — doit être ignoré par le repository
    locataire_id: 0,
    frais_agence: 12.5
  }) as { bien_id: number; frais_agence: number }
  assert.equal(maj.bien_id, bien1.id, 'bien_id inchangé')
  assert.equal(maj.frais_agence, 12.5, 'les autres champs passent')
})

await test('paiements: upsert conserve reference/notes à la modification', () => {
  paiementRepository.upsert({
    bail_id: bail1.id,
    periode: '2026-10',
    montant_paye: 450,
    statut: 'paye',
    reference: 'VIREMENT 4521',
    notes: 'Rapprochement bancaire'
  })
  const maj = paiementRepository.upsert({
    bail_id: bail1.id,
    periode: '2026-10',
    montant_paye: 450,
    statut: 'partiel',
    reference: 'VIREMENT 4521',
    notes: 'Rapprochement bancaire'
  }) as { statut: string; reference: string | null; notes: string | null }
  assert.equal(maj.statut, 'partiel')
  assert.equal(maj.reference, 'VIREMENT 4521', 'reference conservée (bug corrigé)')
  assert.equal(maj.notes, 'Rapprochement bancaire', 'notes conservées (bug corrigé)')
})

await test('révisions de loyer: create + listAll (desc) + listByBail', () => {
  bailRevisionRepository.create({
    bail_id: bail1.id,
    date_revision: '2026-06-01',
    ancien_loyer_hc: 400,
    nouveau_loyer_hc: 410,
    irl_reference: 130,
    irl_nouveau: 133.25,
    taux: 2.5
  })
  bailRevisionRepository.create({
    bail_id: bail1.id,
    date_revision: '2027-06-01',
    ancien_loyer_hc: 410,
    nouveau_loyer_hc: 418,
    irl_reference: 133.25,
    irl_nouveau: 135.98,
    taux: 2.05
  })
  const toutes = bailRevisionRepository.listAll()
  assert.ok(toutes.length >= 2)
  assert.equal(toutes[0].date_revision, '2027-06-01', 'tri desc par date')
  const parBail = bailRevisionRepository.listByBail(bail1.id)
  assert.equal(parBail.length, 2)
})

await test('parametres: set/get (règles rapprochement) roundtrip', () => {
  parametresRepository.set('rapprochement', { regles: { 'virement loyer': bail1.id } })
  const cfg = parametresRepository.get<{ regles: Record<string, number> }>('rapprochement')
  assert.equal(cfg?.regles['virement loyer'], bail1.id)
})

await test('alertes: pointage retard -> alerte impaye ; pointé payé -> rien', () => {
  // Statut pointé = branche indépendante de la date du jour (pas de flaky).
  paiementRepository.upsert({
    bail_id: bail1.id,
    periode: '2026-09',
    montant_paye: 450,
    statut: 'retard'
  })
  const rows = bailRepository.listWithRelations()
  const alertes1 = computeAlertes(rows)
  assert.ok(
    alertes1.some((a) => a.type === 'impaye' && a.bail_id === bail1.id),
    'le pointage retard génère une alerte'
  )
  paiementRepository.upsert({
    bail_id: bail1.id,
    periode: '2026-09',
    montant_paye: 450,
    statut: 'paye'
  })
  const alertes2 = computeAlertes(bailRepository.listWithRelations())
  assert.ok(
    !alertes2.some(
      (a) => a.type === 'impaye' && a.bail_id === bail1.id && a.message.includes('2026-09')
    ),
    'plus d’alerte pour la période payée'
  )
})

await test('alertes: marge de retard lue depuis les paramètres (échéancier)', () => {
  assert.equal(margeRetardJours(), 0, 'défaut 0 j')
  parametresRepository.set('echeancier', { marge_retard_jours: 3 })
  assert.equal(margeRetardJours(), 3)
  parametresRepository.set('echeancier', { marge_retard_jours: 'bogus' })
  assert.equal(margeRetardJours(), 0, 'valeur invalide -> défaut 0')
})

await test('occupation gratuite: exclue des alertes loyer', () => {
  const bail3 = bailRepository.create({
    bien_id: bien1.id,
    locataire_id: loc1.id,
    actif: true,
    occupation_gratuite: true
  }) as { id: number }
  const alertes = computeAlertes(bailRepository.listWithRelations())
  assert.ok(!alertes.some((a) => a.bail_id === bail3), 'aucune alerte pour un bail gratuit')
})

// --- Nettoyage + verdict ---
const base = join(dossierTest, 'data', 'app.db')
assert.ok(existsSync(base), 'la base doit exister dans userData redirigé')
try {
  conn.close()
} catch {
  /* déjà fermée */
}
rmSync(dossierTest, { recursive: true, force: true })

console.log(`\n${reussis} test(s) BDD réussi(s), ${echecs.length} échec(s)`)
process.exit(echecs.length > 0 ? 1 : 0)
