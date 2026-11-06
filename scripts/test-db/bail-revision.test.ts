// ============================================================================
// Tests repository BAIL-REVISION — historique des révisions de loyer
// (migration 0012).
// ============================================================================

import assert from 'node:assert/strict'
import { bailRevisionRepository } from '../../src/main/repositories/bail-revision.repository'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export async function registreBailRevisionTests(test: TestFn): Promise<void> {
  const designation = referenceUnique('T-REVISION')
  const bien = bienRepository.create({
    type_bien: 'Appartement',
    designation,
    nom: designation
  }) as { id: number }
  const loc = locataireRepository.create({ nom_complet: referenceUnique('Loc Revision') }) as {
    id: number
  }
  const bail = bailRepository.create({ bien_id: bien.id, locataire_id: loc.id, actif: true }) as {
    id: number
  }

  await test('révisions de loyer: create + listAll (desc) + listByBail', () => {
    bailRevisionRepository.create({
      bail_id: bail.id,
      date_revision: '2026-06-01',
      ancien_loyer_hc: 400,
      nouveau_loyer_hc: 410,
      irl_reference: 130,
      irl_nouveau: 133.25,
      taux: 2.5
    })
    bailRevisionRepository.create({
      bail_id: bail.id,
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
    const parBail = bailRevisionRepository.listByBail(bail.id)
    assert.equal(parBail.length, 2)
    assert.equal(parBail[0].date_revision, '2027-06-01', 'tri desc aussi par bail')
  })
}
