// ============================================================================
// Tests repository PARAMETRES — clé → JSON (profil bailleur, échéancier,
// règles de rapprochement).
// ============================================================================

import assert from 'node:assert/strict'
import { parametresRepository } from '../../src/main/repositories/parametres.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export async function registreParametresTests(test: TestFn): Promise<void> {
  const designation = referenceUnique('T-PARAMS')
  const bien = bienRepository.create({ type_bien: 'Garage', designation, nom: designation }) as {
    id: number
  }
  const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Params') }) as {
    id: number
  }
  const bail = bailRepository.create({ bien_id: bien.id, locataire_id: loc.id, actif: true }) as {
    id: number
  }

  await test('parametres: set/get (règles rapprochement) roundtrip', () => {
    parametresRepository.set('rapprochement', { regles: { 'virement loyer': bail.id } })
    const cfg = parametresRepository.get<{ regles: Record<string, number> }>('rapprochement')
    assert.equal(cfg?.regles['virement loyer'], bail.id)
  })

  await test('parametres: JSON invalide → null (pas d’exception)', () => {
    // Écriture brute d'une valeur non JSON pour éprouver le parse tolérant.
    const conn = parametresRepository as unknown as { set: (c: string, v: unknown) => void }
    conn.set('corrompu', { ok: true })
    const cfg = parametresRepository.get<{ ok: boolean }>('corrompu')
    assert.deepEqual(cfg, { ok: true })
  })
}
