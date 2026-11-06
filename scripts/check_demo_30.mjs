#!/usr/bin/env node
// ============================================================================
// Vérificateur des 30 dossiers de démo — DRIVER Node.
//
//   node scripts/check_demo_30.mjs [--fixtures fixtures/demo-30]
//
// Étapes :
//   1. Déterminisme : régénère les fixtures avec le même seed dans un
//      dossier temporaire et compare les 4 fichiers au bit près (SHA-256).
//   2. Bundle esbuild de scripts/check_demo_30/main.ts (patron du harnais
//      `test:db`) puis exécution dans ELECTRON — better-sqlite3 ne charge
//      que dans Electron (AGENTS.md §2). La base de vérification est une
//      base TEMPORAIRE : jamais %APPDATA%\gestyloc (données réelles).
//   3. Propagation du code de sortie de l'enfant.
// ============================================================================

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import electronPath from 'electron'

const ici = dirname(fileURLToPath(import.meta.url))
const racine = join(ici, '..')
const args = process.argv.slice(2)
const iFixtures = args.indexOf('--fixtures')
const fixtures = resolve(
  iFixtures >= 0 && args[iFixtures + 1] ? args[iFixtures + 1] : join(racine, 'fixtures', 'demo-30')
)

let code = 0

// --- 1) Déterminisme : régénération + comparaison au bit près ----------------
console.log('=== 1) Déterminisme du générateur (même seed → même octet) ===')
const dossierRegen = mkdtempSync(join(tmpdir(), 'demo-30-regen-'))
const regen = spawnSync(
  process.execPath,
  [join(racine, 'scripts', 'gen_demo_30.mjs'), '--out', dossierRegen],
  {
    cwd: racine,
    encoding: 'utf-8'
  }
)
if (regen.status !== 0) {
  console.error(regen.stdout + regen.stderr)
  console.error('✗ Régénération échouée')
  process.exit(1)
}
for (const nom of ['baux.csv', 'paiements.csv', 'dossiers.json', 'README.md']) {
  const h1 = createHash('sha256')
    .update(readFileSync(join(fixtures, nom)))
    .digest('hex')
  const h2 = createHash('sha256')
    .update(readFileSync(join(dossierRegen, nom)))
    .digest('hex')
  const ok = h1 === h2
  console.log(
    `${ok ? '✓' : '✗'} ${nom.padEnd(15)} SHA-256 ${h1.slice(0, 16)}… ${ok ? 'identique' : `DIFFÉRENT (${h2.slice(0, 16)}…)`}`
  )
  if (!ok) code = 1
}
rmSync(dossierRegen, { recursive: true, force: true })
console.log('Hashes de référence des fixtures :')
for (const nom of ['baux.csv', 'paiements.csv', 'dossiers.json']) {
  console.log(
    `  ${nom.padEnd(15)} ${createHash('sha256')
      .update(readFileSync(join(fixtures, nom)))
      .digest('hex')}`
  )
}

// --- 2) Bundle + exécution Electron ------------------------------------------
console.log('\n=== 2) Import en base temporaire + invariants (Electron) ===')
const bundle = join(ici, 'check_demo_30', 'bundle.mjs')
buildSync({
  entryPoints: [join(ici, 'check_demo_30', 'main.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron', 'better-sqlite3'],
  alias: { '@shared': join(racine, 'shared') }
})
try {
  const enfant = spawnSync(electronPath, [bundle], {
    cwd: racine,
    env: { ...process.env, CHECK_DEMO_FIXTURES: fixtures, ELECTRON_ENABLE_LOGGING: '0' },
    stdio: 'inherit'
  })
  code = code || enfant.status || 0
} finally {
  rmSync(bundle, { force: true })
}

// --- 3) Verdict ---------------------------------------------------------------
console.log(
  code === 0
    ? '\n✓ check_demo_30 : tout est vert (déterminisme + import + invariants).'
    : `\n✗ check_demo_30 : ÉCHEC (code ${code}).`
)
process.exit(code)
