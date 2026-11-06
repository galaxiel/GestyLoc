// ============================================================================
// Squelette du harnais BDD (exécuté sous Electron via npm run test:db).
// Ne touche JAMAIS à %APPDATA%\gestyloc : app.setPath('userData') redirige
// vers un dossier temporaire créé et supprimé par main.ts.
// ============================================================================

export interface EtatHarness {
  reussis: number
  echecs: string[]
}

export const etat: EtatHarness = { reussis: 0, echecs: [] }

export type TestFn = (nom: string, fn: () => Promise<void> | void) => Promise<void>

export async function test(nom: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    etat.reussis++
    console.log(`  ✓ ${nom}`)
  } catch (err) {
    etat.echecs.push(nom)
    console.error(`  ✗ ${nom}\n    ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Affiche le verdict et quitte (0 = vert, 1 = rouge). */
export function resumeEtQuitte(): never {
  console.log(`\n${etat.reussis} test(s) BDD réussi(s), ${etat.echecs.length} échec(s)`)
  if (etat.echecs.length > 0) {
    console.error('ÉCHECS : ' + etat.echecs.join(' ; '))
    process.exit(1)
  }
  process.exit(0)
}

/** Compteur de fixtures pour des noms uniques sans dépendre de l'ordre. */
let compteur = 0
export function referenceUnique(prefixe: string): string {
  compteur++
  return `${prefixe}-${compteur}`
}
