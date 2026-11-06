// ============================================================================
// Tests repository BAUX — auto-contenus (créent leurs propres fixtures avec
// des marqueurs uniques) : aucun test ne dépend de l'ordre des autres.
// ============================================================================

import assert from 'node:assert/strict'
import { bailRepository } from '../../src/main/repositories/bail.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import { locataireRepository } from '../../src/main/repositories/locataire.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export async function registreBailTests(test: TestFn): Promise<void> {
  const designation = referenceUnique('T-BAIL')
  const bien1 = bienRepository.create({
    type_bien: 'Garage',
    designation,
    nom: designation
  }) as { id: number }
  const loc1 = locataireRepository.create({
    nom_complet: referenceUnique('Loc Bail')
  }) as { id: number }
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
}
