// ============================================================================
// Tests repository DÉPENSES — catégories, filtre par bien, cascade.
// ============================================================================

import assert from 'node:assert/strict'
import { depenseRepository } from '../../src/main/repositories/depense.repository'
import { bienRepository } from '../../src/main/repositories/bien.repository'
import type { TestFn } from './harnais'
import { referenceUnique } from './harnais'

export function registreDepenseTests(test: TestFn): void {
  const ref = referenceUnique('T-DEPENSE')
  const bien = bienRepository.create({ type_bien: 'Appartement', designation: ref, nom: ref }) as {
    id: number
  }

  test('dépenses: create avec catégorie → list + listByBien', () => {
    const d = depenseRepository.create({
      bien_id: bien.id,
      categorie: 'travaux',
      montant: 1250.5,
      date_depense: '2025-06-15',
      notes: 'Remplacement chaudière'
    }) as { id: number; montant: number }
    assert.equal(d.montant, 1250.5)
    const duBien = depenseRepository.listByBien(bien.id)
    assert.ok(
      duBien.some((x) => x.id === d.id),
      'la dépense est rattachée au bien'
    )
    assert.ok(depenseRepository.list().some((x) => x.id === d.id))
  })

  test('dépenses: update catégorie/montant → delete', () => {
    const d = depenseRepository.create({
      bien_id: bien.id,
      categorie: 'taxe_fonciere',
      montant: 900
    }) as { id: number }
    const maj = depenseRepository.update(d.id, { montant: 950, categorie: 'assurance_pno' }) as {
      montant: number
      categorie: string
    }
    assert.equal(maj.montant, 950)
    assert.equal(maj.categorie, 'assurance_pno')
    depenseRepository.delete(d.id)
    assert.ok(!depenseRepository.list().some((x) => x.id === d.id), 'dépense supprimée')
  })
}
